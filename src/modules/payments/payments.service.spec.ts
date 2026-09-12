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
import { PaymentsService } from './payments.service';
import { PaymentException } from './payment.exceptions';
import { expectedPaymentSignature } from './razorpay.crypto';

describe('PaymentsService', () => {
  const secret = 'test_secret';
  const customerId = 'cust-1';
  const orderId = 'order-uuid';
  const providerOrderId = 'order_Rzp1';
  const providerPaymentId = 'pay_Rzp1';

  const order = {
    id: orderId,
    orderNumber: 'BJW-2026-000001',
    customerId,
    grandTotal: 458,
    paymentMethod: 'RAZORPAY',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    deletedAt: null,
  };

  const paymentRow = {
    id: 'pay-row-1',
    orderId,
    customerId,
    provider: 'razorpay',
    providerOrderId,
    providerPaymentId: null,
    amountPaise: 45800,
    currency: 'INR',
    status: 'CREATED',
    order,
  };

  let prisma: any;
  let razorpay: any;
  let ordersService: any;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      payment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn(),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          fullName: 'Rahul',
          email: 'rahul@example.com',
          phone: '9999999999',
        }),
      },
    };
    razorpay = {
      assertConfigured: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('test'),
      getKeyId: jest.fn().mockReturnValue('rzp_test_xxx'),
      createOrder: jest.fn(),
      fetchPayment: jest.fn(),
      capturePayment: jest.fn(),
      verifyCheckoutSignature: jest.fn(),
      verifyWebhook: jest.fn(),
    };
    ordersService = {
      placeOrder: jest.fn(),
      confirmPaidOrder: jest.fn().mockResolvedValue(undefined),
    };
    service = new PaymentsService(prisma, razorpay, ordersService, {
      get: jest.fn().mockReturnValue('Bajriwala'),
    } as never);
  });

  it('rejects an invalid signature and does not fulfill', async () => {
    prisma.payment.findFirst.mockResolvedValue(paymentRow);
    razorpay.verifyCheckoutSignature.mockReturnValue(false);
    prisma.payment.findUniqueOrThrow.mockResolvedValue(paymentRow);
    prisma.payment.update.mockResolvedValue({
      ...paymentRow,
      status: 'VERIFICATION_FAILED',
    });

    await expect(
      service.verifyCheckoutPayment(customerId, {
        internalOrderId: orderId,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: providerPaymentId,
        razorpay_signature: 'bad',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });

    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('rejects amount mismatches after a valid signature', async () => {
    prisma.payment.findFirst.mockResolvedValue(paymentRow);
    razorpay.verifyCheckoutSignature.mockReturnValue(true);
    prisma.payment.findFirst
      .mockResolvedValueOnce(paymentRow)
      .mockResolvedValueOnce(null);
    prisma.payment.update.mockResolvedValue({
      ...paymentRow,
      providerPaymentId,
      status: 'PENDING',
    });
    razorpay.fetchPayment.mockResolvedValue({
      id: providerPaymentId,
      order_id: providerOrderId,
      amount: 100,
      currency: 'INR',
      status: 'captured',
    });
    prisma.payment.findUniqueOrThrow.mockResolvedValue(paymentRow);

    await expect(
      service.verifyCheckoutPayment(customerId, {
        internalOrderId: orderId,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: providerPaymentId,
        razorpay_signature: expectedPaymentSignature(
          providerOrderId,
          providerPaymentId,
          secret,
        ),
      }),
    ).rejects.toBeInstanceOf(PaymentException);

    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('is idempotent when payment is already captured', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      ...paymentRow,
      status: 'CAPTURED',
      providerPaymentId,
      capturedAt: new Date(),
      order: { ...order, paymentStatus: 'PAID', orderStatus: 'HUB_ASSIGNED' },
    });

    const result = await service.verifyCheckoutPayment(customerId, {
      internalOrderId: orderId,
      razorpay_order_id: providerOrderId,
      razorpay_payment_id: providerPaymentId,
      razorpay_signature: 'anything',
    });

    expect(result.replay).toBe(true);
    expect(razorpay.fetchPayment).not.toHaveBeenCalled();
    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('does not process a duplicate webhook twice', async () => {
    razorpay.verifyWebhook.mockReturnValue(true);
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row',
      processingStatus: 'PROCESSED',
    });

    const raw = Buffer.from(
      JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: providerPaymentId,
              order_id: providerOrderId,
              amount: 45800,
            },
          },
        },
      }),
    );

    const result = await service.handleWebhook(raw, 'sig');
    expect(result.duplicate).toBe(true);
    expect(ordersService.confirmPaidOrder).not.toHaveBeenCalled();
  });

  it('rejects unauthorized access to another customer order', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyCheckoutPayment('other-customer', {
        internalOrderId: orderId,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: providerPaymentId,
        razorpay_signature: 'sig',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});
