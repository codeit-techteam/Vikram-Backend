import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { razorpayConfigProblems } from './razorpay.crypto';
import { RazorpayService } from './razorpay.service';

const ordersCreate = jest.fn();
const paymentsFetch = jest.fn();

jest.mock('razorpay', () =>
  jest.fn().mockImplementation(() => ({
    orders: { create: ordersCreate, all: jest.fn(), fetch: jest.fn() },
    payments: { fetch: paymentsFetch, capture: jest.fn() },
  })),
);

function buildService(values: Record<string, string>): RazorpayService {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new RazorpayService(config);
}

const testConfig = {
  'payment.razorpay.keyId': 'rzp_test_AbC123',
  'payment.razorpay.keySecret': 'key_secret_value',
  'payment.razorpay.webhookSecret': 'webhook_secret_value',
  'payment.razorpay.mode': 'test',
};

type ApiErrorBody = { code?: string; retryable?: boolean };

async function rejectionOf(promise: Promise<unknown>): Promise<{
  error: HttpException;
  body: ApiErrorBody;
}> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    return { error, body: error.getResponse() as ApiErrorBody };
  }
  throw new Error('Expected promise to reject');
}

describe('RazorpayService', () => {
  beforeEach(() => {
    ordersCreate.mockReset();
    paymentsFetch.mockReset();
  });

  it('refuses to start a payment when credentials are missing', async () => {
    const service = buildService({ 'payment.razorpay.mode': 'test' });
    expect(service.isConfigured()).toBe(false);
    const { error, body } = await rejectionOf(
      service.createOrder({ amountPaise: 63400, receipt: 'BJW-1' }),
    );
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(body.code).toBe('RAZORPAY_NOT_CONFIGURED');
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('refuses a live Key ID while RAZORPAY_MODE=test', async () => {
    const service = buildService({
      ...testConfig,
      'payment.razorpay.keyId': 'rzp_live_AbC123',
    });
    const { body } = await rejectionOf(
      service.createOrder({ amountPaise: 63400, receipt: 'BJW-1' }),
    );
    expect(body.code).toBe('RAZORPAY_MODE_MISMATCH');
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('creates an INR order for the exact paise amount', async () => {
    ordersCreate.mockResolvedValue({
      id: 'order_1',
      amount: 63350,
      currency: 'INR',
      status: 'created',
      receipt: 'BJW-1',
    });
    const service = buildService(testConfig);
    const order = await service.createOrder({
      amountPaise: 63350,
      receipt: 'BJW-1',
    });
    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 63350, currency: 'INR' }),
    );
    expect(order).toMatchObject({ id: 'order_1', amount: 63350 });
  });

  it('rejects amounts below Razorpay minimum or non-integer paise', async () => {
    const service = buildService(testConfig);
    for (const amountPaise of [0, 99, 100.5]) {
      const { body } = await rejectionOf(
        service.createOrder({ amountPaise, receipt: 'BJW-1' }),
      );
      expect(body.code).toBe('INVALID_PAYABLE_AMOUNT');
    }
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('reports mismatched Key ID/Secret as RAZORPAY_AUTH_FAILED instead of a 500', async () => {
    ordersCreate.mockRejectedValue({
      statusCode: 401,
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Authentication failed',
      },
    });
    const service = buildService(testConfig);
    const { error, body } = await rejectionOf(
      service.createOrder({ amountPaise: 63400, receipt: 'BJW-1' }),
    );
    expect(error.getStatus()).toBe(503);
    expect(body).toMatchObject({
      code: 'RAZORPAY_AUTH_FAILED',
      retryable: false,
    });
    expect(JSON.stringify(body)).not.toContain('key_secret_value');
  });

  it('marks gateway outages as retryable', async () => {
    paymentsFetch.mockRejectedValue(new Error('socket hang up'));
    const service = buildService(testConfig);
    const { body } = await rejectionOf(service.fetchPayment('pay_1'));
    expect(body).toMatchObject({
      code: 'PAYMENT_GATEWAY_UNAVAILABLE',
      retryable: true,
    });
  });

  it('rejects webhooks when the secret is missing', () => {
    const service = buildService({
      ...testConfig,
      'payment.razorpay.webhookSecret': '',
    });
    expect(service.verifyWebhook('{}', 'anything')).toBe(false);
  });
});

describe('razorpayConfigProblems', () => {
  const valid = {
    keyId: 'rzp_test_AbC123',
    keySecret: 'secret',
    webhookSecret: 'whsec',
    mode: 'test' as const,
  };

  it('accepts a complete Test Mode configuration', () => {
    expect(razorpayConfigProblems(valid)).toEqual([]);
  });

  it('flags a webhook URL stored as the webhook secret', () => {
    const problems = razorpayConfigProblems({
      ...valid,
      webhookSecret: 'https://example.com/api/v1/payments/razorpay/webhook',
    });
    expect(problems.join(' ')).toContain('contains a URL');
  });

  it('flags missing keys, mode mismatch and reused secrets', () => {
    expect(
      razorpayConfigProblems({ ...valid, keyId: '', keySecret: '' }),
    ).toHaveLength(2);
    expect(
      razorpayConfigProblems({ ...valid, keyId: 'rzp_live_AbC123' }).join(' '),
    ).toContain('live Key ID');
    expect(
      razorpayConfigProblems({ ...valid, webhookSecret: 'secret' }).join(' '),
    ).toContain('must differ');
  });
});
