import { createHmac, timingSafeEqual } from 'crypto';
import type { GatewayPaymentStatus } from '../../../generated/prisma/client';

export const RAZORPAY_PROVIDER = 'razorpay';
export const RAZORPAY_CURRENCY = 'INR';

export const GATEWAY_PAYMENT_TRANSITIONS: Record<
  GatewayPaymentStatus,
  GatewayPaymentStatus[]
> = {
  CREATED: [
    'PENDING',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'CANCELLED',
    'VERIFICATION_FAILED',
  ],
  PENDING: [
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'CANCELLED',
    'VERIFICATION_FAILED',
  ],
  AUTHORIZED: ['CAPTURED', 'FAILED', 'REFUNDED'],
  CAPTURED: ['REFUNDED'],
  FAILED: ['PENDING', 'AUTHORIZED', 'CAPTURED', 'CANCELLED'],
  CANCELLED: ['PENDING', 'AUTHORIZED', 'CAPTURED'],
  VERIFICATION_FAILED: [],
  REFUNDED: [],
};

export function rupeesToPaise(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export function paiseToRupees(paise: number): number {
  return Number((paise / 100).toFixed(2));
}

export function canTransitionGatewayStatus(
  from: GatewayPaymentStatus,
  to: GatewayPaymentStatus,
): boolean {
  if (from === to) return true;
  return GATEWAY_PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function expectedPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  keySecret: string,
): string {
  return createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

export function verifyPaymentSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  keySecret: string;
}): boolean {
  const expected = expectedPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.keySecret,
  );
  return safeEqual(expected, input.razorpaySignature);
}

export function expectedWebhookSignature(
  rawBody: string | Buffer,
  webhookSecret: string,
): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return createHmac('sha256', webhookSecret).update(body).digest('hex');
}

export function verifyWebhookSignature(input: {
  rawBody: string | Buffer;
  signature: string;
  webhookSecret: string;
}): boolean {
  const expected = expectedWebhookSignature(input.rawBody, input.webhookSecret);
  return safeEqual(expected, input.signature);
}

export function assertKeyMatchesMode(keyId: string, mode: 'test' | 'live'): void {
  const id = keyId.trim();
  if (!id) return;
  if (mode === 'test' && id.startsWith('rzp_live_')) {
    throw new Error('RAZORPAY_MODE=test cannot be used with a live Key ID.');
  }
  if (mode === 'live' && id.startsWith('rzp_test_')) {
    throw new Error('RAZORPAY_MODE=live cannot be used with a test Key ID.');
  }
}

export function webhookDedupeKey(input: {
  eventType: string;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  eventId?: string | null;
}): string {
  if (input.eventId?.trim()) {
    return `evt:${input.eventId.trim()}`;
  }
  return [
    input.eventType,
    input.providerPaymentId ?? '',
    input.providerOrderId ?? '',
  ].join(':');
}

export function sanitizeWebhookPayload(eventType: string, body: unknown): object {
  const root = (body ?? {}) as Record<string, unknown>;
  const payload = (root.payload ?? {}) as Record<string, unknown>;
  const paymentEntity = (
    (payload.payment as { entity?: Record<string, unknown> } | undefined)
      ?.entity ?? {}
  ) as Record<string, unknown>;
  const orderEntity = (
    (payload.order as { entity?: Record<string, unknown> } | undefined)
      ?.entity ?? {}
  ) as Record<string, unknown>;

  return {
    eventType,
    paymentId: paymentEntity.id ?? null,
    orderId: paymentEntity.order_id ?? orderEntity.id ?? null,
    amount: paymentEntity.amount ?? orderEntity.amount ?? null,
    currency: paymentEntity.currency ?? orderEntity.currency ?? null,
    status: paymentEntity.status ?? orderEntity.status ?? null,
    method: paymentEntity.method ?? null,
  };
}
