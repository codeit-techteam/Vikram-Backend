import {
  assertKeyMatchesMode,
  canTransitionGatewayStatus,
  expectedPaymentSignature,
  rupeesToPaise,
  sanitizeWebhookPayload,
  verifyPaymentSignature,
  verifyWebhookSignature,
  webhookDedupeKey,
} from './razorpay.crypto';

describe('razorpay.crypto', () => {
  const secret = 'test_key_secret';

  it('converts rupees to paise without trusting floats blindly', () => {
    expect(rupeesToPaise(458)).toBe(45800);
    expect(rupeesToPaise(458.5)).toBe(45850);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });

  it('verifies a valid checkout signature', () => {
    const razorpayOrderId = 'order_test123';
    const razorpayPaymentId = 'pay_test456';
    const razorpaySignature = expectedPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      secret,
    );

    expect(
      verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        keySecret: secret,
      }),
    ).toBe(true);
  });

  it('rejects an invalid checkout signature', () => {
    expect(
      verifyPaymentSignature({
        razorpayOrderId: 'order_test123',
        razorpayPaymentId: 'pay_test456',
        razorpaySignature: 'deadbeef',
        keySecret: secret,
      }),
    ).toBe(false);
  });

  it('does not trust a client-supplied order id that was not used to sign', () => {
    const razorpaySignature = expectedPaymentSignature(
      'order_server',
      'pay_test456',
      secret,
    );
    expect(
      verifyPaymentSignature({
        razorpayOrderId: 'order_attacker',
        razorpayPaymentId: 'pay_test456',
        razorpaySignature,
        keySecret: secret,
      }),
    ).toBe(false);
  });

  it('verifies webhook signatures against the raw body', () => {
    const rawBody = '{"event":"payment.captured"}';
    const signature = require('crypto')
      .createHmac('sha256', 'whsec')
      .update(rawBody)
      .digest('hex');

    expect(
      verifyWebhookSignature({
        rawBody,
        signature,
        webhookSecret: 'whsec',
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        rawBody,
        signature: 'nope',
        webhookSecret: 'whsec',
      }),
    ).toBe(false);
  });

  it('rejects invalid gateway status transitions', () => {
    expect(canTransitionGatewayStatus('CAPTURED', 'PENDING')).toBe(false);
    expect(canTransitionGatewayStatus('CAPTURED', 'REFUNDED')).toBe(true);
    expect(canTransitionGatewayStatus('CREATED', 'CAPTURED')).toBe(true);
    expect(canTransitionGatewayStatus('VERIFICATION_FAILED', 'CAPTURED')).toBe(
      false,
    );
  });

  it('builds a stable webhook dedupe key', () => {
    expect(
      webhookDedupeKey({
        eventType: 'payment.captured',
        providerPaymentId: 'pay_1',
        providerOrderId: 'order_1',
      }),
    ).toBe('payment.captured:pay_1:order_1');
    expect(
      webhookDedupeKey({
        eventType: 'payment.captured',
        eventId: 'evt_1',
      }),
    ).toBe('evt:evt_1');
  });

  it('sanitizes webhook payloads to ids/amount only', () => {
    const sanitized = sanitizeWebhookPayload('payment.captured', {
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            order_id: 'order_1',
            amount: 45800,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            card: { cvv: 'should-not-leak' },
          },
        },
      },
    }) as Record<string, unknown>;

    expect(sanitized.paymentId).toBe('pay_1');
    expect(sanitized.amount).toBe(45800);
    expect(JSON.stringify(sanitized)).not.toContain('cvv');
  });

  it('refuses mixed test/live key IDs', () => {
    expect(() => assertKeyMatchesMode('rzp_live_abc', 'test')).toThrow(/live/i);
    expect(() => assertKeyMatchesMode('rzp_test_abc', 'live')).toThrow(/test/i);
    expect(() => assertKeyMatchesMode('rzp_test_abc', 'test')).not.toThrow();
  });
});
