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
  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody, 'utf8');
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

export function assertKeyMatchesMode(
  keyId: string,
  mode: 'test' | 'live',
): void {
  const id = keyId.trim();
  if (!id) return;
  if (mode === 'test' && id.startsWith('rzp_live_')) {
    throw new Error('RAZORPAY_MODE=test cannot be used with a live Key ID.');
  }
  if (mode === 'live' && id.startsWith('rzp_test_')) {
    throw new Error('RAZORPAY_MODE=live cannot be used with a test Key ID.');
  }
}

/**
 * Human-readable configuration problems. Empty means checkout and webhooks can work.
 * Never includes secret values.
 */
export function razorpayConfigProblems(input: {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: 'test' | 'live';
}): string[] {
  const problems: string[] = [];
  const keyId = input.keyId.trim();
  const keySecret = input.keySecret.trim();
  const webhookSecret = input.webhookSecret.trim();

  if (!keyId) problems.push('RAZORPAY_KEY_ID is not set.');
  if (!keySecret) problems.push('RAZORPAY_KEY_SECRET is not set.');
  if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    problems.push('RAZORPAY_KEY_ID does not look like a Razorpay Key ID.');
  }
  try {
    assertKeyMatchesMode(keyId, input.mode);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (keySecret && keySecret === keyId) {
    problems.push('RAZORPAY_KEY_SECRET must not equal RAZORPAY_KEY_ID.');
  }
  if (!webhookSecret) {
    problems.push(
      'RAZORPAY_WEBHOOK_SECRET is not set; webhooks will be rejected and payments rely on polling only.',
    );
  } else if (/^https?:\/\//i.test(webhookSecret)) {
    problems.push(
      'RAZORPAY_WEBHOOK_SECRET contains a URL. It must be the secret entered in the Razorpay Dashboard webhook, not the webhook URL.',
    );
  } else if (keySecret && webhookSecret === keySecret) {
    problems.push(
      'RAZORPAY_WEBHOOK_SECRET must differ from RAZORPAY_KEY_SECRET.',
    );
  }
  return problems;
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

const REMOTE_STATUS_PRIORITY: Record<string, number> = {
  captured: 4,
  authorized: 3,
  created: 2,
  failed: 1,
};

/**
 * One Razorpay order can carry several attempts (e.g. a failed UPI try, then a
 * card). Money that moved wins; otherwise the most recent attempt decides.
 */
export function pickAuthoritativePayment<
  T extends { status: string; created_at?: number | null },
>(payments: T[]): T | null {
  let best: T | null = null;
  for (const payment of payments) {
    if (!best) {
      best = payment;
      continue;
    }
    const rank = REMOTE_STATUS_PRIORITY[payment.status] ?? 0;
    const bestRank = REMOTE_STATUS_PRIORITY[best.status] ?? 0;
    const moneyMoved = rank >= 3 || bestRank >= 3;
    if (
      moneyMoved
        ? rank > bestRank
        : (payment.created_at ?? 0) > (best.created_at ?? 0)
    ) {
      best = payment;
    }
  }
  return best;
}

export function sanitizeWebhookPayload(
  eventType: string,
  body: unknown,
): object {
  const root = (body ?? {}) as Record<string, unknown>;
  const payload = (root.payload ?? {}) as Record<string, unknown>;
  const paymentEntity =
    (payload.payment as { entity?: Record<string, unknown> } | undefined)
      ?.entity ?? {};
  const orderEntity =
    (payload.order as { entity?: Record<string, unknown> } | undefined)
      ?.entity ?? {};

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
