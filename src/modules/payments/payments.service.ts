import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GatewayPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  WebhookProcessingStatus,
} from '../../../generated/prisma/client';
import type { Order, Payment } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PlaceOrderDto } from '../orders/dto/order.dto';
import { OrdersService } from '../orders/orders.service';
import { decimalToNumber } from '../orders/orders.constants';
import { PaymentException } from './payment.exceptions';
import {
  canTransitionGatewayStatus,
  pickAuthoritativePayment,
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

/** Gateway rows that need no further contact with Razorpay. */
const SETTLED_GATEWAY_STATUSES: GatewayPaymentStatus[] = [
  'CAPTURED',
  'REFUNDED',
  'VERIFICATION_FAILED',
];

/** Gateway rows where money may already have moved; never release these orders. */
const IN_FLIGHT_GATEWAY_STATUSES: GatewayPaymentStatus[] = [
  'AUTHORIZED',
  'CAPTURED',
];

/** Customer-facing payment state the app renders directly. */
export type CustomerPaymentState =
  | 'PAID'
  | 'PROCESSING'
  | 'AWAITING_PAYMENT'
  | 'FAILED'
  | 'CANCELLED'
  | 'ORDER_CANCELLED'
  | 'REFUND_PENDING';

const REFUND_REQUIRED_CODE = 'ORDER_CANCELLED_REFUND_REQUIRED';
const RECONCILE_MIN_AGE_MS = 2 * 60_000;
const RECONCILE_BATCH_SIZE = 50;

type OrderRow = Order;
type PaymentRow = Payment;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;
  private reconcileRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs =
      this.configService.get<number>('payment.razorpay.reconcileIntervalMs') ??
      0;
    if (
      process.env.NODE_ENV === 'test' ||
      !Number.isFinite(intervalMs) ||
      intervalMs <= 0 ||
      !this.razorpay.isConfigured()
    ) {
      return;
    }
    this.reconcileTimer = setInterval(() => {
      void this.reconcileStalePendingOrders();
    }, intervalMs);
    this.reconcileTimer.unref();
    this.logger.log(`Razorpay reconciliation every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

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
    options?: { idempotencyKey?: string | null },
  ) {
    this.razorpay.assertConfigured();

    const order = dto.internalOrderId
      ? await this.loadReusableOrder(customerId, dto.internalOrderId)
      : await this.resolveCheckoutOrder(customerId, dto, options);

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
        true,
      );
    }

    this.logPayment('checkout_created', {
      internalOrderId: order.id,
      orderNumber: order.orderNumber,
      paymentId: payment.id,
      razorpayOrderId: payment.providerOrderId,
      amountPaise,
    });

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

    if (
      payment.status === 'CAPTURED' &&
      (payment.order.paymentStatus === PaymentStatus.PAID ||
        payment.order.paymentStatus === PaymentStatus.COLLECTED)
    ) {
      return this.toVerifyResponse(customerId, payment.orderId, true);
    }

    // The trusted Razorpay order id comes from our DB row, never from the client.
    const signatureOk = this.razorpay.verifyCheckoutSignature({
      razorpayOrderId: payment.providerOrderId,
      razorpayPaymentId: input.razorpay_payment_id,
      razorpaySignature: input.razorpay_signature,
    });

    if (!signatureOk) {
      this.logger.warn(
        `SECURITY payment signature mismatch internalOrder=${payment.order.orderNumber} razorpayOrder=${payment.providerOrderId}`,
      );
      // Record the event but keep the row reconcilable: a forged callback must not
      // block a genuine capture that arrives later through the webhook.
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          failureCode: 'SIGNATURE_MISMATCH',
          failureDescription: 'Checkout signature verification failed',
        },
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
      },
    });
    await this.transitionPayment(payment.id, payment.status, 'PENDING', {
      event: 'checkout_callback',
    });

    const remote = await this.razorpay.fetchPayment(input.razorpay_payment_id);
    await this.assertRemoteMatches(payment, remote);
    await this.applyRemotePayment(payment.id, remote, 'checkout_verify');

    const current = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    if (current.status === 'FAILED') {
      throw new PaymentException(
        'PAYMENT_FAILED',
        current.failureDescription || 'Your payment was not completed.',
        HttpStatus.BAD_REQUEST,
        true,
      );
    }

    return this.toVerifyResponse(customerId, payment.orderId, false);
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

    if (payment.status === 'CREATED' || payment.status === 'PENDING') {
      // Razorpay may have captured the payment even though checkout reported a close.
      await this.syncOrderPayment(internalOrderId).catch((error) =>
        this.logger.warn(
          `Cancel reconcile skipped for ${payment.order.orderNumber}: ${errorMessage(error)}`,
        ),
      );
      const latest = await this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      if (latest.status === 'CREATED' || latest.status === 'PENDING') {
        await this.transitionPayment(latest.id, latest.status, 'CANCELLED', {
          event: 'checkout_cancelled',
        });
      }
    }

    return this.getStatus(customerId, internalOrderId, { reconcile: false });
  }

  async getStatus(
    customerId: string,
    orderId: string,
    options: { reconcile?: boolean } = {},
  ) {
    const owned = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) {
      throw new PaymentException(
        'ORDER_NOT_FOUND',
        'Order not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    let reconcileFailed = false;
    if (options.reconcile !== false) {
      try {
        await this.syncOrderPayment(orderId);
      } catch (error) {
        reconcileFailed = true;
        this.logger.warn(
          `Payment status reconcile failed for order=${orderId}: ${errorMessage(error)}`,
        );
      }
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return this.toStatusResponse(order, order.payments[0] ?? null, {
      reconcileFailed,
    });
  }

  async getPending(customerId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        deletedAt: null,
        paymentMethod: PaymentMethod.RAZORPAY,
        paymentStatus: { in: UNPAID_ORDER_STATUSES },
        orderStatus: OrderStatus.PENDING,
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
        amountPaise:
          payment?.amountPaise ??
          rupeesToPaise(decimalToNumber(order.grandTotal)),
        currency: payment?.currency ?? RAZORPAY_CURRENCY,
        razorpayOrderId: payment?.providerOrderId ?? null,
        keyId: this.razorpay.getKeyId(),
        gatewayStatus: payment?.status ?? null,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        state: derivePaymentState(order, payment),
        expiresAt: this.expiresAt(order).toISOString(),
      },
    };
  }

  /**
   * Brings one internal order in line with Razorpay (the source of truth) and
   * releases it when the payment window has passed without money moving.
   */
  async syncOrderPayment(orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order || order.paymentMethod !== PaymentMethod.RAZORPAY) return;
    if (!this.razorpay.isConfigured()) return;

    for (const payment of order.payments) {
      if (payment.provider !== RAZORPAY_PROVIDER) continue;
      await this.reconcilePayment(payment);
    }

    const refreshed = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    const moneyMoved = refreshed.payments.some((p) =>
      IN_FLIGHT_GATEWAY_STATUSES.includes(p.status),
    );
    if (
      !moneyMoved &&
      refreshed.orderStatus === OrderStatus.PENDING &&
      UNPAID_ORDER_STATUSES.includes(refreshed.paymentStatus) &&
      this.expiresAt(refreshed).getTime() <= Date.now()
    ) {
      await this.ordersService.releaseUnpaidOnlineOrder(
        refreshed.id,
        'Payment not completed in time',
      );
    }
  }

  async reconcileStalePendingOrders(): Promise<void> {
    if (this.reconcileRunning) return;
    this.reconcileRunning = true;
    try {
      const candidates = await this.prisma.order.findMany({
        where: {
          deletedAt: null,
          paymentMethod: PaymentMethod.RAZORPAY,
          paymentStatus: { in: UNPAID_ORDER_STATUSES },
          orderStatus: OrderStatus.PENDING,
          createdAt: { lte: new Date(Date.now() - RECONCILE_MIN_AGE_MS) },
        },
        orderBy: { createdAt: 'asc' },
        take: RECONCILE_BATCH_SIZE,
        select: { id: true, orderNumber: true },
      });
      for (const candidate of candidates) {
        try {
          await this.syncOrderPayment(candidate.id);
        } catch (error) {
          this.logger.warn(
            `Background reconcile failed for ${candidate.orderNumber}: ${errorMessage(error)}`,
          );
        }
      }
    } finally {
      this.reconcileRunning = false;
    }
  }

  async handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
    if (!this.razorpay.verifyWebhook(rawBody, signature)) {
      this.logger.warn(
        'SECURITY Razorpay webhook signature verification failed',
      );
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
    const paymentEntity = ((
      payload.payment as { entity?: Record<string, unknown> } | undefined
    )?.entity ?? {}) as Record<string, unknown>;
    const orderEntity = ((
      payload.order as { entity?: Record<string, unknown> } | undefined
    )?.entity ?? {}) as Record<string, unknown>;

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
      this.logPayment('webhook_duplicate', {
        event: eventType,
        razorpayOrderId: providerOrderId,
        razorpayPaymentId: providerPaymentId,
      });
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
            payload: sanitizeWebhookPayload(
              eventType,
              parsed,
            ) as Prisma.InputJsonValue,
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
        status:
          typeof paymentEntity.status === 'string'
            ? paymentEntity.status
            : null,
        method:
          typeof paymentEntity.method === 'string'
            ? paymentEntity.method
            : null,
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
      this.logPayment('webhook_processed', {
        event: eventType,
        razorpayOrderId: providerOrderId,
        razorpayPaymentId: providerPaymentId,
      });
      return { duplicate: false, eventType };
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          errorMessage: errorMessage(error).slice(0, 500),
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
      this.logger.warn(
        `Webhook ${eventType} ignored — missing Razorpay order id`,
      );
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: payload.providerOrderId },
    });
    if (!payment) {
      this.logger.warn(
        `Webhook ${eventType} for unknown Razorpay order ${payload.providerOrderId}`,
      );
      return;
    }

    const isFailure =
      eventType === 'payment.failed' || payload.status === 'failed';
    const isSuccess =
      eventType === 'payment.authorized' ||
      eventType === 'payment.captured' ||
      eventType === 'order.paid' ||
      payload.status === 'authorized' ||
      payload.status === 'captured';
    if (!isFailure && !isSuccess) return;

    const providerPaymentId =
      payload.providerPaymentId ?? payment.providerPaymentId;
    if (!providerPaymentId) return;

    if (isFailure) {
      // Only the payment named in the event failed; another attempt on the same
      // Razorpay order may still succeed, so apply it without re-fetching.
      await this.applyRemotePayment(
        payment.id,
        {
          id: providerPaymentId,
          order_id: payload.providerOrderId,
          amount: payment.amountPaise,
          currency: payment.currency,
          status: 'failed',
          method: payload.method,
          error_code: payload.errorCode,
          error_description: payload.errorDescription,
        },
        `webhook:${eventType}`,
      );
      return;
    }

    // Never trust the webhook body for money: re-read the payment from Razorpay.
    const remote = await this.razorpay.fetchPayment(providerPaymentId);
    await this.assertRemoteMatches(payment, remote);
    await this.applyRemotePayment(payment.id, remote, `webhook:${eventType}`);
  }

  private async reconcilePayment(payment: PaymentRow): Promise<void> {
    if (SETTLED_GATEWAY_STATUSES.includes(payment.status)) {
      if (payment.status === 'CAPTURED') {
        await this.confirmOrderForPayment(payment.id);
      }
      return;
    }

    const remotes = await this.razorpay.fetchOrderPayments(
      payment.providerOrderId,
    );
    const remote = pickAuthoritativePayment(remotes);
    if (!remote) return;

    if (remote.status === 'captured' || remote.status === 'authorized') {
      await this.assertRemoteMatches(payment, remote);
    }
    await this.applyRemotePayment(payment.id, remote, 'reconcile');
  }

  /** Applies a Razorpay payment record to our row and, if captured, confirms the order. */
  private async applyRemotePayment(
    paymentId: string,
    remote: RazorpayPaymentRecord,
    event: string,
  ): Promise<void> {
    const current = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    if (remote.status === 'captured' || remote.status === 'authorized') {
      if (remote.id !== current.providerPaymentId) {
        const duplicate = await this.prisma.payment.findFirst({
          where: { providerPaymentId: remote.id, NOT: { id: current.id } },
        });
        if (duplicate) {
          this.logger.warn(
            `SECURITY duplicate provider payment id ${remote.id}`,
          );
          return;
        }
      }
      await this.ensureCaptured(current.id, remote, event);
      await this.confirmOrderForPayment(current.id);
      return;
    }

    if (remote.status === 'failed') {
      // An older failed attempt must not overwrite a newer attempt in progress.
      if (
        current.providerPaymentId &&
        current.providerPaymentId !== remote.id &&
        current.status === 'PENDING'
      ) {
        return;
      }
      await this.transitionPayment(current.id, current.status, 'FAILED', {
        event,
        providerPaymentId: remote.id,
        method: remote.method,
        failureCode: remote.error_code,
        failureDescription: remote.error_description,
      });
      await this.prisma.order.updateMany({
        where: {
          id: current.orderId,
          orderStatus: { not: OrderStatus.CANCELLED },
          paymentStatus: {
            notIn: [PaymentStatus.PAID, PaymentStatus.COLLECTED],
          },
        },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      return;
    }

    if (remote.status === 'created' && current.status === 'CREATED') {
      await this.transitionPayment(current.id, current.status, 'PENDING', {
        event,
        providerPaymentId: remote.id,
        method: remote.method,
      });
    }
  }

  private async confirmOrderForPayment(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (payment.status !== 'CAPTURED' && payment.status !== 'AUTHORIZED') {
      return;
    }
    const result = await this.ordersService.confirmPaidOrder(payment.orderId);
    if (
      result === 'ORDER_CANCELLED' &&
      payment.failureCode !== REFUND_REQUIRED_CODE
    ) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          failureCode: REFUND_REQUIRED_CODE,
          failureDescription:
            'Payment captured after the order was cancelled. Refund required.',
        },
      });
      this.logPayment('refund_required', {
        internalOrderId: payment.orderId,
        paymentId: payment.id,
        razorpayOrderId: payment.providerOrderId,
        razorpayPaymentId: payment.providerPaymentId,
      });
    } else if (result === 'CONFIRMED') {
      this.logPayment('order_confirmed', {
        internalOrderId: payment.orderId,
        paymentId: payment.id,
        razorpayOrderId: payment.providerOrderId,
        razorpayPaymentId: payment.providerPaymentId,
      });
    }
  }

  private async resolveCheckoutOrder(
    customerId: string,
    dto: CreateRazorpayOrderDto,
    options?: { idempotencyKey?: string | null },
  ) {
    const idempotencyKey =
      options?.idempotencyKey?.trim()?.slice(0, 120) || null;
    if (idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { customerId, idempotencyKey, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        return this.loadReusableOrder(customerId, existing.id);
      }
    }

    await this.releaseSupersededCheckouts(customerId);
    return this.placePendingOnlineOrder(customerId, dto, options);
  }

  /**
   * A fresh "Pay Online" tap is for the current cart. Older unpaid online orders
   * are reconciled first (in case Razorpay did capture them) and otherwise
   * released so their stock, slot and loyalty points return to the customer.
   */
  private async releaseSupersededCheckouts(customerId: string): Promise<void> {
    const stale = await this.prisma.order.findMany({
      where: {
        customerId,
        deletedAt: null,
        paymentMethod: PaymentMethod.RAZORPAY,
        paymentStatus: { in: UNPAID_ORDER_STATUSES },
        orderStatus: OrderStatus.PENDING,
      },
      select: { id: true, orderNumber: true },
    });

    for (const row of stale) {
      try {
        await this.syncOrderPayment(row.id);
      } catch (error) {
        this.logger.warn(
          `Skipping release of ${row.orderNumber}; Razorpay reconcile failed: ${errorMessage(error)}`,
        );
        continue;
      }
      const latest = await this.prisma.order.findUniqueOrThrow({
        where: { id: row.id },
        include: { payments: true },
      });
      const moneyMoved = latest.payments.some(
        (p) =>
          IN_FLIGHT_GATEWAY_STATUSES.includes(p.status) ||
          (p.status === 'PENDING' && p.providerPaymentId),
      );
      if (moneyMoved) continue;
      await this.ordersService.releaseUnpaidOnlineOrder(
        row.id,
        'Replaced by a new checkout',
      );
    }
  }

  private async placePendingOnlineOrder(
    customerId: string,
    dto: CreateRazorpayOrderDto,
    options?: { idempotencyKey?: string | null },
  ) {
    const placeDto: PlaceOrderDto = {
      addressId: dto.addressId,
      notes: dto.notes,
      deliveryPreferenceType: dto.deliveryPreferenceType,
      scheduledSlotId: dto.scheduledSlotId,
      deliveryCustomerRemark: dto.deliveryCustomerRemark,
      deliveryCallOnArrival: dto.deliveryCallOnArrival,
      deliveryLeaveAtSecurity: dto.deliveryLeaveAtSecurity,
      deliveryHeavyVehicleAccess: dto.deliveryHeavyVehicleAccess,
      openAreaConfirmed: dto.openAreaConfirmed,
      deliveryTermsAccepted: dto.deliveryTermsAccepted,
      deliveryTermsVersion: dto.deliveryTermsVersion,
      loyaltyPointsToRedeem: dto.loyaltyPointsToRedeem,
      paymentMethod: PaymentMethod.RAZORPAY,
    };
    const placed = await this.ordersService.placeOrder(
      customerId,
      placeDto,
      options,
    );
    return this.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
    });
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
    if (
      order.paymentStatus === PaymentStatus.PAID ||
      order.paymentStatus === PaymentStatus.COLLECTED
    ) {
      return order;
    }

    if (this.expiresAt(order).getTime() <= Date.now()) {
      await this.syncOrderPayment(order.id);
    }
    const latest = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    if (latest.orderStatus === OrderStatus.CANCELLED) {
      throw new PaymentException(
        'ORDER_CANCELLED',
        'This order is no longer payable. Please place the order again.',
      );
    }
    return latest;
  }

  private async assertRemoteMatches(
    payment: {
      id: string;
      status: GatewayPaymentStatus;
      providerOrderId: string;
      amountPaise: number;
      currency: string;
    },
    remote: RazorpayPaymentRecord,
  ) {
    let failureCode: string | null = null;
    if (remote.order_id !== payment.providerOrderId) {
      failureCode = 'ORDER_MISMATCH';
    } else if (Number(remote.amount) !== payment.amountPaise) {
      failureCode = 'AMOUNT_MISMATCH';
    } else if (String(remote.currency).toUpperCase() !== payment.currency) {
      failureCode = 'CURRENCY_MISMATCH';
    }
    if (!failureCode) return;

    this.logger.warn(
      `SECURITY ${failureCode} payment=${payment.id} expectedPaise=${payment.amountPaise} actualPaise=${remote.amount}`,
    );
    const current = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    await this.transitionPayment(
      current.id,
      current.status,
      'VERIFICATION_FAILED',
      {
        event: 'remote_mismatch',
        failureCode,
      },
    );
    throw new PaymentException(
      failureCode === 'ORDER_MISMATCH'
        ? 'PAYMENT_ORDER_MISMATCH'
        : 'PAYMENT_AMOUNT_MISMATCH',
      'We could not verify this payment.',
    );
  }

  private async ensureCaptured(
    paymentId: string,
    remote: RazorpayPaymentRecord,
    event: string,
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
          `Capture skipped for ${remote.id}: ${errorMessage(error)}`,
        );
      }
    }

    if (status !== 'captured' && status !== 'authorized') {
      throw new PaymentException(
        'PAYMENT_NOT_CAPTURED',
        'Payment is not completed yet. Please wait a moment and retry.',
        HttpStatus.CONFLICT,
        true,
      );
    }

    const nextStatus: GatewayPaymentStatus =
      status === 'captured' ? 'CAPTURED' : 'AUTHORIZED';

    return this.transitionPayment(current.id, current.status, nextStatus, {
      event,
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
      event?: string;
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
      return this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
    }

    const now = new Date();
    const updated = await this.prisma.payment.update({
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

    if (from !== to) {
      this.logPayment('status_changed', {
        event: extra?.event ?? null,
        internalOrderId: updated.orderId,
        paymentId: updated.id,
        razorpayOrderId: updated.providerOrderId,
        razorpayPaymentId: updated.providerPaymentId,
        from,
        to,
      });
    }
    return updated;
  }

  private expiresAt(order: { createdAt: Date }): Date {
    const minutes =
      this.configService.get<number>('payment.razorpay.pendingExpiryMinutes') ??
      30;
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
    return new Date(order.createdAt.getTime() + safeMinutes * 60_000);
  }

  private logPayment(event: string, fields: Record<string, unknown>): void {
    this.logger.log(
      `PAYMENT ${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}`,
    );
  }

  private toStatusResponse(
    order: OrderRow,
    payment: PaymentRow | null,
    extra: { reconcileFailed: boolean },
  ) {
    const state = derivePaymentState(order, payment);
    return {
      internalOrderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      state,
      retryable:
        state === 'AWAITING_PAYMENT' ||
        state === 'FAILED' ||
        state === 'CANCELLED',
      paid: state === 'PAID',
      provider: payment?.provider ?? RAZORPAY_PROVIDER,
      providerOrderId: payment?.providerOrderId ?? null,
      providerPaymentId: payment?.providerPaymentId ?? null,
      gatewayStatus: payment?.status ?? null,
      method: payment?.method ?? null,
      failureReason:
        state === 'FAILED' || state === 'REFUND_PENDING'
          ? (payment?.failureDescription ?? null)
          : null,
      cancelReason: order.cancelReason ?? null,
      amount: decimalToNumber(order.grandTotal),
      amountPaise:
        payment?.amountPaise ??
        rupeesToPaise(decimalToNumber(order.grandTotal)),
      currency: payment?.currency ?? RAZORPAY_CURRENCY,
      capturedAt: payment?.capturedAt?.toISOString() ?? null,
      expiresAt:
        state === 'AWAITING_PAYMENT' ||
        state === 'FAILED' ||
        state === 'CANCELLED'
          ? this.expiresAt(order).toISOString()
          : null,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      deliveryPreferenceType: order.deliveryPreferenceType,
      reconcileFailed: extra.reconcileFailed,
    };
  }

  private async toCheckoutResponse(
    order: {
      id: string;
      orderNumber: string;
      grandTotal: unknown;
      customerId: string;
    },
    payment: {
      providerOrderId: string;
      amountPaise: number;
      currency: string;
    } | null,
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
      amount:
        payment?.amountPaise ??
        rupeesToPaise(decimalToNumber(order.grandTotal)),
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

  private async toVerifyResponse(
    customerId: string,
    orderId: string,
    replay: boolean,
  ) {
    const status = await this.getStatus(customerId, orderId, {
      reconcile: false,
    });
    return { success: true, replay, ...status };
  }
}

export function derivePaymentState(
  order: Pick<OrderRow, 'orderStatus' | 'paymentStatus'>,
  payment: Pick<PaymentRow, 'status' | 'providerPaymentId'> | null,
): CustomerPaymentState {
  const orderCancelled = order.orderStatus === OrderStatus.CANCELLED;
  if (
    !orderCancelled &&
    (order.paymentStatus === PaymentStatus.PAID ||
      order.paymentStatus === PaymentStatus.COLLECTED)
  ) {
    return 'PAID';
  }
  if (orderCancelled) {
    return payment &&
      (payment.status === 'CAPTURED' || payment.status === 'AUTHORIZED')
      ? 'REFUND_PENDING'
      : 'ORDER_CANCELLED';
  }
  switch (payment?.status) {
    case 'CAPTURED':
    case 'AUTHORIZED':
      return 'PROCESSING';
    case 'PENDING':
      return payment.providerPaymentId ? 'PROCESSING' : 'AWAITING_PAYMENT';
    case 'FAILED':
    case 'VERIFICATION_FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'REFUNDED':
      return 'ORDER_CANCELLED';
    case 'CREATED':
    default:
      return 'AWAITING_PAYMENT';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const described = (error as { error?: { description?: unknown } }).error
      ?.description;
    if (typeof described === 'string') return described;
  }
  return 'unknown error';
}
