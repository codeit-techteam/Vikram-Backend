import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GatewayPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  WebhookProcessingStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PlaceOrderDto } from '../orders/dto/order.dto';
import { OrdersService } from '../orders/orders.service';
import { decimalToNumber } from '../orders/orders.constants';
import { PaymentException } from './payment.exceptions';
import {
  canTransitionGatewayStatus,
  RAZORPAY_CURRENCY,
  RAZORPAY_PROVIDER,
  rupeesToPaise,
  sanitizeWebhookPayload,
  webhookDedupeKey,
} from './razorpay.crypto';
import type { RazorpayPaymentRecord } from './razorpay.service';
import { RazorpayService } from './razorpay.service';
import type { CreateRazorpayOrderDto } from './dto/razorpay-payment.dto';

const REUSABLE_PAYMENT_STATUSES: GatewayPaymentStatus[] = [
  'CREATED',
  'PENDING',
  'FAILED',
  'CANCELLED',
];

const UNPAID_ORDER_STATUSES: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  getPublicConfig() {
    return {
      enabled: this.razorpay.isConfigured(),
      mode: this.razorpay.getMode(),
      provider: RAZORPAY_PROVIDER,
    };
  }

  async createCheckout(
    customerId: string,
    dto: CreateRazorpayOrderDto,
  ) {
    this.razorpay.assertConfigured();

    const order = dto.internalOrderId
      ? await this.loadReusableOrder(customerId, dto.internalOrderId)
      : ((await this.findPendingOnlineOrder(customerId)) ??
        (await this.placePendingOnlineOrder(customerId, dto)));

    if (
      order.paymentStatus === PaymentStatus.PAID ||
      order.paymentStatus === PaymentStatus.COLLECTED
    ) {
      return this.toCheckoutResponse(order, null, { alreadyPaid: true });
    }

    const amountPaise = rupeesToPaise(decimalToNumber(order.grandTotal));
    if (amountPaise <= 0) {
      throw new PaymentException(
        'INVALID_PAYABLE_AMOUNT',
        'This order has no payable amount.',
      );
    }

    let payment = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        provider: RAZORPAY_PROVIDER,
        status: { in: REUSABLE_PAYMENT_STATUSES },
        amountPaise,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      const razorpayOrder = await this.razorpay.createOrder({
        amountPaise,
        receipt: order.orderNumber,
        notes: {
          internalOrderId: order.id,
          orderNumber: order.orderNumber,
          customerId,
        },
      });

      try {
        payment = await this.prisma.payment.create({
          data: {
            orderId: order.id,
            customerId,
            provider: RAZORPAY_PROVIDER,
            providerOrderId: razorpayOrder.id,
            amount: order.grandTotal,
            amountPaise,
            currency: RAZORPAY_CURRENCY,
            status: 'CREATED',
            method: dto.checkoutMethod ?? null,
            metadata: {
              checkoutMethod: dto.checkoutMethod ?? null,
              razorpayStatus: razorpayOrder.status,
            },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          payment = await this.prisma.payment.findUnique({
            where: { providerOrderId: razorpayOrder.id },
          });
        } else {
          throw error;
        }
      }
    }

    if (!payment) {
      throw new PaymentException(
        'PAYMENT_CREATE_FAILED',
        'We could not start this payment. Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(
      `Razorpay order created internalOrder=${order.orderNumber} providerOrder=${payment.providerOrderId} amountPaise=${amountPaise}`,
    );

    return this.toCheckoutResponse(order, payment, { alreadyPaid: false });
  }

  async verifyCheckoutPayment(
    customerId: string,
    input: {
      internalOrderId: string;
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    this.razorpay.assertConfigured();

    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: input.internalOrderId,
        customerId,
        provider: RAZORPAY_PROVIDER,
        providerOrderId: input.razorpay_order_id,
      },
      include: { order: true },
    });

    if (!payment || payment.order.customerId !== customerId) {
      this.logger.warn(
        `Payment verify rejected: order/customer mismatch order=${input.internalOrderId}`,
      );
      throw new PaymentException(
        'PAYMENT_NOT_FOUND',
        'We could not find this payment.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (payment.providerOrderId !== input.razorpay_order_id) {
      throw new PaymentException(
        'PAYMENT_ORDER_MISMATCH',
        'We could not verify this payment.',
      );
    }

    if (
      payment.status === 'CAPTURED' &&
      (payment.order.paymentStatus === PaymentStatus.PAID ||
        payment.order.paymentStatus === PaymentStatus.COLLECTED)
    ) {
      return this.toVerifyResponse(payment.order, payment, true);
    }

    const signatureOk = this.razorpay.verifyCheckoutSignature({
      razorpayOrderId: payment.providerOrderId,
      razorpayPaymentId: input.razorpay_payment_id,
      razorpaySignature: input.razorpay_signature,
    });

    if (!signatureOk) {
      this.logger.warn(
        `SECURITY payment signature mismatch internalOrder=${payment.order.orderNumber}`,
      );
      await this.transitionPayment(payment.id, payment.status, 'VERIFICATION_FAILED', {
        failureCode: 'SIGNATURE_MISMATCH',
        failureDescription: 'Checkout signature verification failed',
      });
      throw new PaymentException(
        'PAYMENT_VERIFICATION_FAILED',
        'We could not verify this payment.',
      );
    }

    const duplicate = await this.prisma.payment.findFirst({
      where: {
        providerPaymentId: input.razorpay_payment_id,
        NOT: { id: payment.id },
      },
    });
    if (duplicate) {
      this.logger.warn(
        `SECURITY duplicate provider payment id ${input.razorpay_payment_id}`,
      );
      throw new PaymentException(
        'DUPLICATE_PAYMENT',
        'This payment has already been used.',
      );
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: input.razorpay_payment_id,
        providerSignature: input.razorpay_signature,
        verifiedAt: new Date(),
        status: canTransitionGatewayStatus(payment.status, 'PENDING')
          ? 'PENDING'
          : payment.status,
      },
    });

    const remote = await this.razorpay.fetchPayment(input.razorpay_payment_id);
    await this.assertRemoteMatches(payment, remote);

    const captured = await this.ensureCaptured(payment.id, remote);
    await this.ordersService.confirmPaidOrder(payment.orderId);

    this.logger.log(
      `Payment verified internalOrder=${payment.order.orderNumber} providerPayment=${captured.providerPaymentId}`,
    );

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: payment.orderId },
    });
    return this.toVerifyResponse(order, captured, false);
  }

  async cancelCheckout(customerId: string, internalOrderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: internalOrderId,
        customerId,
        provider: RAZORPAY_PROVIDER,
      },
      orderBy: { createdAt: 'desc' },
      include: { order: true },
    });

    if (!payment || payment.order.customerId !== customerId) {
      throw new PaymentException(
        'PAYMENT_NOT_FOUND',
        'We could not find this payment.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (payment.status === 'CAPTURED' || payment.order.paymentStatus === 'PAID') {
      return this.getStatus(customerId, internalOrderId);
    }

    if (
      payment.status === 'CREATED' ||
      payment.status === 'PENDING' ||
      payment.status === 'FAILED'
    ) {
      await this.transitionPayment(payment.id, payment.status, 'CANCELLED');
    }

    return this.getStatus(customerId, internalOrderId);
  }

  async getStatus(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) {
      throw new PaymentException(
        'ORDER_NOT_FOUND',
        'Order not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    let payment = order.payments[0] ?? null;
    if (
      payment &&
      payment.status !== 'CAPTURED' &&
      payment.providerPaymentId
    ) {
      try {
        const remote = await this.razorpay.fetchPayment(payment.providerPaymentId);
        if (remote.status === 'captured' || remote.status === 'authorized') {
          await this.assertRemoteMatches(payment, remote);
          payment = await this.ensureCaptured(payment.id, remote);
          await this.ordersService.confirmPaidOrder(order.id);
        } else if (remote.status === 'failed') {
          payment = await this.transitionPayment(
            payment.id,
            payment.status,
            'FAILED',
            {
              failureCode: remote.error_code,
              failureDescription: remote.error_description,
            },
          );
        }
      } catch (error) {
        this.logger.warn(
          `Payment status reconcile skipped for ${order.orderNumber}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    const refreshed = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const latest = refreshed.payments[0] ?? payment;

    return {
      internalOrderId: refreshed.id,
      orderNumber: refreshed.orderNumber,
      orderStatus: refreshed.orderStatus,
      paymentStatus: refreshed.paymentStatus,
      paymentMethod: refreshed.paymentMethod,
      provider: latest?.provider ?? RAZORPAY_PROVIDER,
      providerOrderId: latest?.providerOrderId ?? null,
      providerPaymentId: latest?.providerPaymentId ?? null,
      gatewayStatus: latest?.status ?? null,
      amount: decimalToNumber(refreshed.grandTotal),
      amountPaise: latest?.amountPaise ?? rupeesToPaise(decimalToNumber(refreshed.grandTotal)),
      currency: latest?.currency ?? RAZORPAY_CURRENCY,
      paid: refreshed.paymentStatus === PaymentStatus.PAID,
      capturedAt: latest?.capturedAt?.toISOString() ?? null,
    };
  }

  async getPending(customerId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        deletedAt: null,
        paymentMethod: PaymentMethod.RAZORPAY,
        paymentStatus: { in: UNPAID_ORDER_STATUSES },
        orderStatus: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!order) {
      return { pending: null };
    }

    const payment = order.payments[0] ?? null;
    return {
      pending: {
        internalOrderId: order.id,
        orderNumber: order.orderNumber,
        amount: decimalToNumber(order.grandTotal),
        amountPaise: payment?.amountPaise ?? rupeesToPaise(decimalToNumber(order.grandTotal)),
        currency: payment?.currency ?? RAZORPAY_CURRENCY,
        razorpayOrderId: payment?.providerOrderId ?? null,
        keyId: this.razorpay.getKeyId(),
        gatewayStatus: payment?.status ?? null,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
      },
    };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
    if (!this.razorpay.verifyWebhook(rawBody, signature)) {
      this.logger.warn('SECURITY Razorpay webhook signature verification failed');
      throw new PaymentException(
        'WEBHOOK_SIGNATURE_INVALID',
        'Invalid webhook signature.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(
        Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody,
      ) as Record<string, unknown>;
    } catch {
      throw new PaymentException(
        'WEBHOOK_PAYLOAD_INVALID',
        'Invalid webhook payload.',
      );
    }

    const eventType = String(parsed.event ?? '');
    const payload = (parsed.payload ?? {}) as Record<string, unknown>;
    const paymentEntity = (
      (payload.payment as { entity?: Record<string, unknown> } | undefined)
        ?.entity ?? {}
    ) as Record<string, unknown>;
    const orderEntity = (
      (payload.order as { entity?: Record<string, unknown> } | undefined)
        ?.entity ?? {}
    ) as Record<string, unknown>;

    const providerPaymentId =
      typeof paymentEntity.id === 'string' ? paymentEntity.id : null;
    const providerOrderId =
      typeof paymentEntity.order_id === 'string'
        ? paymentEntity.order_id
        : typeof orderEntity.id === 'string'
          ? orderEntity.id
          : null;
    const eventId = typeof parsed.id === 'string' ? parsed.id : null;
    const dedupeKey = webhookDedupeKey({
      eventType,
      providerPaymentId,
      providerOrderId,
      eventId,
    });

    const existing = await this.prisma.paymentWebhookEvent.findUnique({
      where: { dedupeKey },
    });
    if (existing?.processingStatus === WebhookProcessingStatus.PROCESSED) {
      this.logger.log(`Webhook duplicate ignored event=${eventType} key=${dedupeKey}`);
      return { duplicate: true, eventType };
    }

    let eventRow = existing;
    if (!eventRow) {
      try {
        eventRow = await this.prisma.paymentWebhookEvent.create({
          data: {
            provider: RAZORPAY_PROVIDER,
            eventType,
            dedupeKey,
            eventId,
            providerPaymentId,
            providerOrderId,
            payload: sanitizeWebhookPayload(eventType, parsed) as Prisma.InputJsonValue,
            processingStatus: WebhookProcessingStatus.RECEIVED,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { duplicate: true, eventType };
        }
        throw error;
      }
    }

    if (!eventRow) {
      return { duplicate: true, eventType };
    }

    try {
      await this.processWebhookEvent(eventType, {
        providerPaymentId,
        providerOrderId,
        status: typeof paymentEntity.status === 'string' ? paymentEntity.status : null,
        method: typeof paymentEntity.method === 'string' ? paymentEntity.method : null,
        errorCode:
          typeof paymentEntity.error_code === 'string'
            ? paymentEntity.error_code
            : null,
        errorDescription:
          typeof paymentEntity.error_description === 'string'
            ? paymentEntity.error_description
            : null,
      });

      await this.prisma.paymentWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          processingStatus: WebhookProcessingStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
      this.logger.log(`Webhook processed event=${eventType} order=${providerOrderId}`);
      return { duplicate: false, eventType };
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 500) : 'Webhook failed',
        },
      });
      throw error;
    }
  }

  private async processWebhookEvent(
    eventType: string,
    payload: {
      providerPaymentId: string | null;
      providerOrderId: string | null;
      status: string | null;
      method: string | null;
      errorCode: string | null;
      errorDescription: string | null;
    },
  ) {
    if (!payload.providerOrderId) {
      this.logger.warn(`Webhook ${eventType} ignored — missing Razorpay order id`);
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: payload.providerOrderId },
      include: { order: true },
    });
    if (!payment) {
      this.logger.warn(
        `Webhook ${eventType} for unknown Razorpay order ${payload.providerOrderId}`,
      );
      return;
    }

    if (payload.providerPaymentId && !payment.providerPaymentId) {
      const duplicate = await this.prisma.payment.findFirst({
        where: {
          providerPaymentId: payload.providerPaymentId,
          NOT: { id: payment.id },
        },
      });
      if (duplicate) {
        this.logger.warn(
          `SECURITY webhook duplicate payment id ${payload.providerPaymentId}`,
        );
        return;
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerPaymentId: payload.providerPaymentId },
      });
    }

    if (
      eventType === 'payment.failed' ||
      payload.status === 'failed'
    ) {
      await this.transitionPayment(payment.id, payment.status, 'FAILED', {
        failureCode: payload.errorCode,
        failureDescription: payload.errorDescription,
        method: payload.method,
      });
      await this.prisma.order.updateMany({
        where: {
          id: payment.orderId,
          paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.COLLECTED] },
        },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      return;
    }

    if (
      eventType === 'payment.authorized' ||
      eventType === 'payment.captured' ||
      eventType === 'order.paid' ||
      payload.status === 'authorized' ||
      payload.status === 'captured'
    ) {
      if (!payload.providerPaymentId && !payment.providerPaymentId) {
        return;
      }
      const remote = await this.razorpay.fetchPayment(
        payload.providerPaymentId ?? payment.providerPaymentId!,
      );
      await this.assertRemoteMatches(payment, remote);
      await this.ensureCaptured(payment.id, remote);
      await this.ordersService.confirmPaidOrder(payment.orderId);
    }
  }

  private async findPendingOnlineOrder(customerId: string) {
    return this.prisma.order.findFirst({
      where: {
        customerId,
        deletedAt: null,
        paymentMethod: PaymentMethod.RAZORPAY,
        paymentStatus: { in: UNPAID_ORDER_STATUSES },
        orderStatus: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async placePendingOnlineOrder(
    customerId: string,
    dto: CreateRazorpayOrderDto,
  ) {
    const placeDto: PlaceOrderDto = {
      addressId: dto.addressId,
      notes: dto.notes,
      deliveryPreferenceType: dto.deliveryPreferenceType,
      scheduledSlotId: dto.scheduledSlotId,
      deliveryCustomerRemark: dto.deliveryCustomerRemark,
      loyaltyPointsToRedeem: dto.loyaltyPointsToRedeem,
      paymentMethod: PaymentMethod.RAZORPAY,
    };
    const placed = await this.ordersService.placeOrder(customerId, placeDto);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
    });
    return order;
  }

  private async loadReusableOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
    });
    if (!order) {
      throw new PaymentException(
        'ORDER_NOT_FOUND',
        'Order not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (order.paymentMethod !== PaymentMethod.RAZORPAY) {
      throw new PaymentException(
        'INVALID_PAYMENT_METHOD',
        'This order is not an online payment order.',
      );
    }
    if (order.orderStatus === 'CANCELLED') {
      throw new PaymentException(
        'ORDER_CANCELLED',
        'This order was cancelled.',
      );
    }
    return order;
  }

  private async assertRemoteMatches(
    payment: {
      id: string;
      orderId: string;
      providerOrderId: string;
      amountPaise: number;
      currency: string;
    },
    remote: RazorpayPaymentRecord,
  ) {
    if (remote.order_id !== payment.providerOrderId) {
      this.logger.warn(
        `SECURITY Razorpay order mismatch payment=${payment.id}`,
      );
      await this.transitionPayment(payment.id, 'PENDING', 'VERIFICATION_FAILED', {
        failureCode: 'ORDER_MISMATCH',
      });
      throw new PaymentException(
        'PAYMENT_ORDER_MISMATCH',
        'We could not verify this payment.',
      );
    }
    if (Number(remote.amount) !== payment.amountPaise) {
      this.logger.warn(
        `SECURITY amount mismatch payment=${payment.id} expected=${payment.amountPaise} actual=${remote.amount}`,
      );
      await this.transitionPayment(payment.id, 'PENDING', 'VERIFICATION_FAILED', {
        failureCode: 'AMOUNT_MISMATCH',
      });
      throw new PaymentException(
        'PAYMENT_AMOUNT_MISMATCH',
        'We could not verify this payment.',
      );
    }
    if (String(remote.currency).toUpperCase() !== payment.currency) {
      this.logger.warn(`SECURITY currency mismatch payment=${payment.id}`);
      await this.transitionPayment(payment.id, 'PENDING', 'VERIFICATION_FAILED', {
        failureCode: 'CURRENCY_MISMATCH',
      });
      throw new PaymentException(
        'PAYMENT_AMOUNT_MISMATCH',
        'We could not verify this payment.',
      );
    }
  }

  private async ensureCaptured(
    paymentId: string,
    remote: RazorpayPaymentRecord,
  ) {
    const current = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    let status = remote.status;
    if (status === 'authorized') {
      try {
        const captured = await this.razorpay.capturePayment(
          remote.id,
          current.amountPaise,
        );
        status = captured.status;
      } catch (error) {
        this.logger.warn(
          `Capture skipped for ${remote.id}: ${
            error instanceof Error ? error.message : 'already captured or unavailable'
          }`,
        );
      }
    }

    if (status !== 'captured' && status !== 'authorized') {
      throw new PaymentException(
        'PAYMENT_NOT_CAPTURED',
        'Payment is not completed yet. Please wait a moment and retry.',
      );
    }

    const nextStatus: GatewayPaymentStatus =
      status === 'captured' ? 'CAPTURED' : 'AUTHORIZED';

    return this.transitionPayment(current.id, current.status, nextStatus, {
      providerPaymentId: remote.id,
      method: remote.method,
      captured: nextStatus === 'CAPTURED',
    });
  }

  private async transitionPayment(
    paymentId: string,
    from: GatewayPaymentStatus,
    to: GatewayPaymentStatus,
    extra?: {
      providerPaymentId?: string | null;
      method?: string | null;
      failureCode?: string | null;
      failureDescription?: string | null;
      captured?: boolean;
    },
  ) {
    if (!canTransitionGatewayStatus(from, to)) {
      this.logger.warn(
        `Rejected invalid payment transition ${from} → ${to} payment=${paymentId}`,
      );
      const current = await this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      return current;
    }

    const now = new Date();
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: to,
        ...(extra?.providerPaymentId
          ? { providerPaymentId: extra.providerPaymentId }
          : {}),
        ...(extra?.method ? { method: extra.method } : {}),
        ...(extra?.failureCode ? { failureCode: extra.failureCode } : {}),
        ...(extra?.failureDescription
          ? { failureDescription: extra.failureDescription }
          : {}),
        ...(extra?.captured ? { capturedAt: now, verifiedAt: now } : {}),
        ...(to === 'AUTHORIZED' ? { verifiedAt: now } : {}),
      },
    });
  }

  private async toCheckoutResponse(
    order: {
      id: string;
      orderNumber: string;
      grandTotal: unknown;
      customerId: string;
    },
    payment: { providerOrderId: string; amountPaise: number; currency: string } | null,
    extra: { alreadyPaid: boolean },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: order.customerId },
      select: { fullName: true, email: true, phone: true },
    });
    const company =
      this.configService.get<string>('company.name') ?? 'Bajriwala';

    return {
      keyId: this.razorpay.getKeyId(),
      razorpayOrderId: payment?.providerOrderId ?? null,
      amount: payment?.amountPaise ?? rupeesToPaise(decimalToNumber(order.grandTotal)),
      currency: payment?.currency ?? RAZORPAY_CURRENCY,
      internalOrderId: order.id,
      orderNumber: order.orderNumber,
      alreadyPaid: extra.alreadyPaid,
      name: company,
      description: `Order #${order.orderNumber}`,
      customer: {
        name: customer?.fullName ?? '',
        email: customer?.email ?? '',
        phone: customer?.phone ?? '',
      },
    };
  }

  private toVerifyResponse(
    order: {
      id: string;
      orderNumber: string;
      orderStatus: string;
      paymentStatus: PaymentStatus;
      grandTotal: unknown;
    },
    payment: {
      providerPaymentId: string | null;
      providerOrderId: string;
      status: GatewayPaymentStatus;
      capturedAt: Date | null;
      amountPaise: number;
    },
    replay: boolean,
  ) {
    return {
      success: true,
      replay,
      internalOrderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      gatewayStatus: payment.status,
      providerPaymentId: payment.providerPaymentId,
      providerOrderId: payment.providerOrderId,
      amount: decimalToNumber(order.grandTotal),
      amountPaise: payment.amountPaise,
      currency: RAZORPAY_CURRENCY,
      capturedAt: payment.capturedAt?.toISOString() ?? null,
    };
  }
}
