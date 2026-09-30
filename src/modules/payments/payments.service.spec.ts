/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  EntityStatus: { ACTIVE: 'ACTIVE' },
  GatewayPaymentStatus: {
    CREATED: 'CREATED',
    PENDING: 'PENDING',
    AUTHORIZED: 'AUTHORIZED',
    CAPTURED: 'CAPTURED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
    VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  },
  OrderStatus: {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    HUB_ASSIGNED: 'HUB_ASSIGNED',
    CANCELLED: 'CANCELLED',
  },
  PaymentMethod: { CASH: 'CASH', MANUAL: 'MANUAL', RAZORPAY: 'RAZORPAY' },
  PaymentStatus: {
    PENDING: 'PENDING',
    PAID: 'PAID',
    COLLECTED: 'COLLECTED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
  },
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    },
  },
  WebhookProcessingStatus: {
    RECEIVED: 'RECEIVED',
    PROCESSED: 'PROCESSED',
    IGNORED: 'IGNORED',
    FAILED: 'FAILED',
  },
}));
jest.mock('../../common/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../orders/orders.service', () => ({
  OrdersService: class OrdersService {},
}));

import { HttpStatus } from '@nestjs/common';
import { derivePaymentState, PaymentsService } from './payments.service';
import { PaymentException } from './payment.exceptions';
import {
  expectedPaymentSignature,
  pickAuthoritativePayment,
} from './razorpay.crypto';

/**
 * Minimal in-memory Prisma double: enough state for payments/orders to move
 * through the real service logic instead of hand-scripted mock sequences.
 */
function createStore(seed: { orders: any[]; payments: any[] }) {
  const orders = seed.orders.map((o) => ({ ...o }));
  const payments = seed.payments.map((p) => ({ ...p }));
  const webhookEvents: any[] = [];

  const matches = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === 'NOT') return !matches(row, cond);
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('in' in cond) return cond.in.includes(row[key]);
        if ('notIn' in cond) return !cond.notIn.includes(row[key]);
        if ('not' in cond) return row[key] !== cond.not;
        if ('lte' in cond) return row[key] <= cond.lte;
        return true;
      }
      return row[key] === cond;
    });

  const withRelations = (order: any, include?: any) =>
    include?.payments
      ? {
          ...order,
          payments: payments
            .filter((p) => p.orderId === order.id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, include.payments.take ?? undefined),
        }
      : { ...order };

  const prisma = {
    order: {
      findFirst: jest.fn(async ({ where, include }: any) => {
        const row = orders.find((o) => matches(o, where));
        return row ? withRelations(row, include) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where, include }: any) => {
        const row = orders.find((o) => o.id === where.id);
        if (!row) throw new Error('order not found');
        return withRelations(row, include);
      }),
      findMany: jest.fn(async ({ where }: any) =>
        orders.filter((o) => matches(o, where)).map((o) => ({ ...o })),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = orders.filter((o) => matches(o, where));
        rows.forEach((o) => Object.assign(o, data));
        return { count: rows.length };
      }),
    },
    payment: {
      findFirst: jest.fn(async ({ where, include }: any) => {
        const rows = payments
          .filter((p) => matches(p, where))
          .sort((a, b) => b.createdAt - a.createdAt);
        const row = rows[0];
        if (!row) return null;
        return include?.order
          ? { ...row, order: { ...orders.find((o) => o.id === row.orderId) } }
          : { ...row };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = payments.find((p) => matches(p, where));
        return row ? { ...row } : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = payments.find((p) => p.id === where.id);
        if (!row) throw new Error('payment not found');
        return { ...row };
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `pay-row-${payments.length + 1}`,
          createdAt: Date.now(),
          ...data,
        };
        payments.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = payments.find((p) => p.id === where.id);
        Object.assign(row, data);
        return { ...row };
      }),
    },
    paymentWebhookEvent: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          webhookEvents.find((e) => e.dedupeKey === where.dedupeKey) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `evt-${webhookEvents.length + 1}`, ...data };
        webhookEvents.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = webhookEvents.find((e) => e.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({
        fullName: 'Rahul',
        email: 'rahul@example.com',
        phone: '9999999999',
      }),
    },
  };
  return { prisma, orders, payments, webhookEvents };
}

describe('PaymentsService', () => {
  const secret = 'test_secret';
  const customerId = 'cust-1';
  const orderId = 'order-uuid';
  const providerOrderId = 'order_Rzp1';
  const providerPaymentId = 'pay_Rzp1';

  const baseOrder = () => ({
    id: orderId,
    orderNumber: 'BJW-2026-000001',
    customerId,
    grandTotal: 634,
    paymentMethod: 'RAZORPAY',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    deletedAt: null,
    cancelReason: null,
    idempotencyKey: 'key-1',
    createdAt: new Date(),
    expectedDeliveryAt: null,
    deliveryPreferenceType: 'ASAP',
  });

  const basePayment = () => ({
    id: 'pay-row-1',
    orderId,
    customerId,
    provider: 'razorpay',
    providerOrderId,
    providerPaymentId: null,
    amountPaise: 63400,
    currency: 'INR',
    status: 'CREATED',
    failureCode: null,
    failureDescription: null,
    method: null,
    capturedAt: null,
    createdAt: 1,
  });

  const remoteCaptured = (overrides: Record<string, unknown> = {}) => ({
    id: providerPaymentId,
    order_id: providerOrderId,
    amount: 63400,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    created_at: 100,
    ...overrides,
  });

  let store: ReturnType<typeof createStore>;
  let razorpay: any;
  let ordersService: any;
  let service: PaymentsService;

  const build = (seed: { orders: any[]; payments: any[] }) => {
    store = createStore(seed);
    razorpay = {
      assertConfigured: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('test'),
      getKeyId: jest.fn().mockReturnValue('rzp_test_xxx'),
      createOrder: jest.fn().mockResolvedValue({
        id: 'order_New',
        amount: 63400,
        currency: 'INR',
        status: 'created',
      }),
      fetchPayment: jest.fn(),
      fetchOrderPayments: jest.fn().mockResolvedValue([]),
      capturePayment: jest.fn(),
      verifyCheckoutSignature: jest.fn(
        (input: any) =>
          input.razorpaySignature ===
          expectedPaymentSignature(
            input.razorpayOrderId,
            input.razorpayPaymentId,
            secret,
          ),
      ),
      verifyWebhook: jest.fn().mockReturnValue(true),
    };
    ordersService = {
      placeOrder: jest.fn(),
      confirmPaidOrder: jest.fn(async (id: string) => {
        const order = store.orders.find((o) => o.id === id);
        if (order.orderStatus === 'CANCELLED') return 'ORDER_CANCELLED';
        if (order.paymentStatus === 'PAID') return 'ALREADY_CONFIRMED';
        order.paymentStatus = 'PAID';
        order.orderStatus = 'HUB_ASSIGNED';
        return 'CONFIRMED';
      }),
      releaseUnpaidOnlineOrder: jest.fn(async (id: string) => {
        const order = store.orders.find((o) => o.id === id);
        if (order.orderStatus !== 'PENDING') return false;
        order.orderStatus = 'CANCELLED';
        order.paymentStatus = 'CANCELLED';
        store.payments
          .filter(
            (p) =>
              p.orderId === id &&
              ['CREATED', 'PENDING', 'FAILED'].includes(p.status),
          )
          .forEach((p) => (p.status = 'CANCELLED'));
        return true;
      }),
    };
    service = new PaymentsService(
      store.prisma as never,
      razorpay,
      ordersService,
      {
        get: jest.fn((key: string) => {
          if (key === 'payment.razorpay.pendingExpiryMinutes') return 30;
          return 'Bajriwala';
        }),
      } as never,
    );
  };

  const validVerifyInput = () => ({
    internalOrderId: orderId,
    razorpay_order_id: providerOrderId,
    razorpay_payment_id: providerPaymentId,
    razorpay_signature: expectedPaymentSignature(
      providerOrderId,
      providerPaymentId,
      secret,
    ),
  });

  it('successful payment: verify captures, confirms the order and reports PAID', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchPayment.mockResolvedValue(remoteCaptured());

    const result = await service.verifyCheckoutPayment(
      customerId,
      validVerifyInput(),
    );

    expect(result.state).toBe('PAID');
    expect(result.providerPaymentId).toBe(providerPaymentId);
    expect(store.payments[0].status).toBe('CAPTURED');
    expect(ordersService.confirmPaidOrder).toHaveBeenCalledTimes(1);
  });

  it('failed payment: verify marks FAILED, order unpaid, error is retryable', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchPayment.mockResolvedValue(
      remoteCaptured({ status: 'failed', error_description: 'Card declined' }),
    );

    await expect(
      service.verifyCheckoutPayment(customerId, validVerifyInput()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PAYMENT_FAILED',
        retryable: true,
      }),
    });
    expect(store.payments[0].status).toBe('FAILED');
    expect(store.orders[0].paymentStatus).toBe('FAILED');
    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('invalid signature is rejected and does not block a later genuine capture', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });

    await expect(
      service.verifyCheckoutPayment(customerId, {
        ...validVerifyInput(),
        razorpay_signature: 'forged',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
    expect(store.payments[0].status).toBe('CREATED');
    expect(store.payments[0].failureCode).toBe('SIGNATURE_MISMATCH');

    razorpay.fetchOrderPayments.mockResolvedValue([remoteCaptured()]);
    const status = await service.getStatus(customerId, orderId);
    expect(status.state).toBe('PAID');
  });

  it('amount tampering: a remote amount that differs from the DB amount is rejected', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchPayment.mockResolvedValue(remoteCaptured({ amount: 100 }));

    await expect(
      service.verifyCheckoutPayment(customerId, validVerifyInput()),
    ).rejects.toBeInstanceOf(PaymentException);
    expect(store.payments[0].status).toBe('VERIFICATION_FAILED');
    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('duplicate callback is idempotent once the payment is captured', async () => {
    build({
      orders: [
        { ...baseOrder(), paymentStatus: 'PAID', orderStatus: 'HUB_ASSIGNED' },
      ],
      payments: [{ ...basePayment(), status: 'CAPTURED', providerPaymentId }],
    });

    const result = await service.verifyCheckoutPayment(customerId, {
      ...validVerifyInput(),
      razorpay_signature: 'anything',
    });

    expect(result.replay).toBe(true);
    expect(result.state).toBe('PAID');
    expect(razorpay.fetchPayment).not.toHaveBeenCalled();
    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('duplicate webhook is processed once', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchPayment.mockResolvedValue(remoteCaptured());
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt_1',
        event: 'payment.captured',
        payload: { payment: { entity: remoteCaptured() } },
      }),
    );

    const first = await service.handleWebhook(raw, 'sig');
    const second = await service.handleWebhook(raw, 'sig');

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(razorpay.fetchPayment).toHaveBeenCalledTimes(1);
    expect(store.orders[0].paymentStatus).toBe('PAID');
  });

  it('webhook before app verification: later verify is a replay', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchPayment.mockResolvedValue(remoteCaptured());
    await service.handleWebhook(
      Buffer.from(
        JSON.stringify({
          id: 'evt_2',
          event: 'payment.captured',
          payload: { payment: { entity: remoteCaptured() } },
        }),
      ),
      'sig',
    );

    const verified = await service.verifyCheckoutPayment(
      customerId,
      validVerifyInput(),
    );
    expect(verified.replay).toBe(true);
    expect(ordersService.confirmPaidOrder).toHaveBeenCalledTimes(1);
  });

  it('lost callback: status polling discovers the captured payment from Razorpay', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchOrderPayments.mockResolvedValue([
      remoteCaptured({ id: 'pay_old', status: 'failed', created_at: 50 }),
      remoteCaptured(),
    ]);

    const status = await service.getStatus(customerId, orderId);

    expect(status.state).toBe('PAID');
    expect(status.providerPaymentId).toBe(providerPaymentId);
  });

  it('checkout opened but never paid reports AWAITING_PAYMENT instead of checking forever', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });

    const status = await service.getStatus(customerId, orderId);

    expect(status.state).toBe('AWAITING_PAYMENT');
    expect(status.retryable).toBe(true);
  });

  it('expired unpaid order is released and reported as ORDER_CANCELLED', async () => {
    build({
      orders: [
        { ...baseOrder(), createdAt: new Date(Date.now() - 31 * 60_000) },
      ],
      payments: [basePayment()],
    });

    const status = await service.getStatus(customerId, orderId);

    expect(ordersService.releaseUnpaidOnlineOrder).toHaveBeenCalledWith(
      orderId,
      'Payment not completed in time',
    );
    expect(status.state).toBe('ORDER_CANCELLED');
    expect(status.retryable).toBe(false);
  });

  it('capture after the order was released is flagged for refund, not revived', async () => {
    build({
      orders: [
        {
          ...baseOrder(),
          orderStatus: 'CANCELLED',
          paymentStatus: 'CANCELLED',
        },
      ],
      payments: [{ ...basePayment(), status: 'CANCELLED' }],
    });
    razorpay.fetchOrderPayments.mockResolvedValue([remoteCaptured()]);

    const status = await service.getStatus(customerId, orderId);

    expect(status.state).toBe('REFUND_PENDING');
    expect(store.orders[0].orderStatus).toBe('CANCELLED');
    expect(store.payments[0].failureCode).toBe(
      'ORDER_CANCELLED_REFUND_REQUIRED',
    );
  });

  it('double tap: the same idempotency key reuses the order and Razorpay order', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });

    const session = await service.createCheckout(
      customerId,
      { addressId: 'addr-1' },
      { idempotencyKey: 'key-1' },
    );

    expect(session.internalOrderId).toBe(orderId);
    expect(session.razorpayOrderId).toBe(providerOrderId);
    expect(ordersService.placeOrder).not.toHaveBeenCalled();
    expect(ordersService.releaseUnpaidOnlineOrder).not.toHaveBeenCalled();
    expect(razorpay.createOrder).not.toHaveBeenCalled();
  });

  it('new checkout releases an abandoned unpaid order instead of reusing its stale cart', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    ordersService.placeOrder.mockImplementation(async () => {
      store.orders.push({
        ...baseOrder(),
        id: 'order-new',
        orderNumber: 'BJW-2026-000002',
        grandTotal: 999,
        idempotencyKey: 'key-2',
      });
      return { id: 'order-new' };
    });

    const session = await service.createCheckout(
      customerId,
      { addressId: 'addr-1' },
      { idempotencyKey: 'key-2' },
    );

    expect(ordersService.releaseUnpaidOnlineOrder).toHaveBeenCalledWith(
      orderId,
      'Replaced by a new checkout',
    );
    expect(session.internalOrderId).toBe('order-new');
    expect(session.amount).toBe(99900);
  });

  it('new checkout confirms (not cancels) an old order that Razorpay shows as captured', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });
    razorpay.fetchOrderPayments.mockResolvedValue([remoteCaptured()]);
    ordersService.placeOrder.mockImplementation(async () => {
      store.orders.push({
        ...baseOrder(),
        id: 'order-new',
        idempotencyKey: 'key-3',
      });
      return { id: 'order-new' };
    });

    await service.createCheckout(
      customerId,
      { addressId: 'addr-1' },
      {
        idempotencyKey: 'key-3',
      },
    );

    expect(store.orders[0].paymentStatus).toBe('PAID');
    expect(ordersService.releaseUnpaidOnlineOrder).not.toHaveBeenCalled();
  });

  it('rejects unauthorized access to another customer order', async () => {
    build({ orders: [baseOrder()], payments: [basePayment()] });

    await expect(
      service.verifyCheckoutPayment('other-customer', validVerifyInput()),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(
      service.getStatus('other-customer', orderId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});

describe('derivePaymentState', () => {
  it('maps internal statuses to customer states explicitly', () => {
    const order = { orderStatus: 'PENDING', paymentStatus: 'PENDING' } as never;
    expect(derivePaymentState(order, null)).toBe('AWAITING_PAYMENT');
    expect(
      derivePaymentState(order, {
        status: 'PENDING',
        providerPaymentId: 'pay_1',
      } as never),
    ).toBe('PROCESSING');
    expect(derivePaymentState(order, { status: 'FAILED' } as never)).toBe(
      'FAILED',
    );
    expect(derivePaymentState(order, { status: 'CANCELLED' } as never)).toBe(
      'CANCELLED',
    );
    expect(
      derivePaymentState(
        { orderStatus: 'HUB_ASSIGNED', paymentStatus: 'PAID' } as never,
        { status: 'CAPTURED' } as never,
      ),
    ).toBe('PAID');
  });
});

describe('pickAuthoritativePayment', () => {
  it('prefers captured money over newer failed attempts', () => {
    const picked = pickAuthoritativePayment([
      { id: 'a', status: 'captured', created_at: 1 },
      { id: 'b', status: 'failed', created_at: 5 },
    ]);
    expect(picked?.id).toBe('a');
  });

  it('otherwise uses the most recent attempt', () => {
    const picked = pickAuthoritativePayment([
      { id: 'a', status: 'failed', created_at: 1 },
      { id: 'b', status: 'created', created_at: 5 },
    ]);
    expect(picked?.id).toBe('b');
  });
});
