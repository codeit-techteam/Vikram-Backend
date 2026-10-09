import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { PaymentException } from './payment.exceptions';
import {
  assertKeyMatchesMode,
  expectedWebhookSignature,
  RAZORPAY_CURRENCY,
  razorpayConfigProblems,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './razorpay.crypto';

export type RazorpayMode = 'test' | 'live';

export interface RazorpayOrderRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string | null;
}

export interface RazorpayPaymentRecord {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Shape of errors thrown by the razorpay Node SDK (not an Error instance). */
type RazorpaySdkError = {
  statusCode?: number;
  error?: { code?: string; description?: string; reason?: string };
  code?: string;
  message?: string;
};

/** Maps a Razorpay SDK failure to an API error the app can act on. Never leaks secrets. */
export function toGatewayException(
  operation: string,
  raw: unknown,
): PaymentException {
  const error = (raw ?? {}) as RazorpaySdkError;
  const status = typeof error.statusCode === 'number' ? error.statusCode : 0;
  if (status === 401) {
    return new PaymentException(
      'RAZORPAY_AUTH_FAILED',
      'Online payments are temporarily unavailable. Please use another payment method or try again later.',
      HttpStatus.SERVICE_UNAVAILABLE,
      false,
    );
  }
  if (status >= 400 && status < 500) {
    return new PaymentException(
      'PAYMENT_GATEWAY_REJECTED',
      `Razorpay rejected the ${operation} request.`,
      HttpStatus.BAD_GATEWAY,
      false,
    );
  }
  return new PaymentException(
    'PAYMENT_GATEWAY_UNAVAILABLE',
    'The payment gateway did not respond. Please try again.',
    HttpStatus.BAD_GATEWAY,
    true,
  );
}

function describeSdkError(raw: unknown): string {
  const error = (raw ?? {}) as RazorpaySdkError;
  const parts = [
    error.statusCode ? `status=${error.statusCode}` : null,
    error.error?.code ? `code=${error.error.code}` : null,
    error.error?.description ?? error.message ?? null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'unknown error';
}

@Injectable()
export class RazorpayService implements OnModuleInit {
  private readonly logger = new Logger(RazorpayService.name);
  private client: Razorpay | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const problems = this.configProblems();
    for (const problem of problems) {
      this.logger.error(`Razorpay config: ${problem}`);
    }
    if (!this.isConfigured()) return;
    this.logger.log(
      `Razorpay ${this.getMode()} mode with key ${this.getKeyId().slice(0, 13)}…`,
    );
    void this.probeCredentials();
  }

  configProblems(): string[] {
    return razorpayConfigProblems({
      keyId: this.getKeyId(),
      keySecret: this.getKeySecret(),
      webhookSecret: this.getWebhookSecret(),
      mode: this.getMode(),
    });
  }

  /** One read-only call at boot so a wrong Key ID/Secret pair shows up in logs immediately. */
  private async probeCredentials(): Promise<void> {
    try {
      await this.getClient().orders.all({ count: 1 });
      this.logger.log('Razorpay credentials verified.');
    } catch (error) {
      const status = (error as RazorpaySdkError).statusCode;
      if (status === 401) {
        this.logger.error(
          'Razorpay rejected RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET (401). Online payments will fail until the matching key pair is configured.',
        );
      } else {
        this.logger.warn(
          `Razorpay credential check inconclusive: ${describeSdkError(error)}`,
        );
      }
    }
  }

  private async call<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Razorpay ${operation} failed: ${describeSdkError(error)}`,
      );
      throw toGatewayException(operation, error);
    }
  }

  getMode(): RazorpayMode {
    const mode = this.configService.get<string>('payment.razorpay.mode');
    return mode === 'live' ? 'live' : 'test';
  }

  getKeyId(): string {
    return (
      this.configService.get<string>('payment.razorpay.keyId')?.trim() ?? ''
    );
  }

  private getKeySecret(): string {
    return (
      this.configService.get<string>('payment.razorpay.keySecret')?.trim() ?? ''
    );
  }

  private getWebhookSecret(): string {
    return (
      this.configService
        .get<string>('payment.razorpay.webhookSecret')
        ?.trim() ?? ''
    );
  }

  isConfigured(): boolean {
    return Boolean(this.getKeyId() && this.getKeySecret());
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        success: false,
        code: 'RAZORPAY_NOT_CONFIGURED',
        message:
          'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the backend.',
      });
    }
    try {
      assertKeyMatchesMode(this.getKeyId(), this.getMode());
    } catch (error) {
      this.logger.error(
        'Razorpay mode/credential mismatch. Refusing to start a payment.',
      );
      throw new ServiceUnavailableException({
        success: false,
        code: 'RAZORPAY_MODE_MISMATCH',
        message:
          error instanceof Error
            ? error.message
            : 'Razorpay mode does not match the configured Key ID.',
      });
    }
  }

  private getClient(): Razorpay {
    this.assertConfigured();
    if (!this.client) {
      this.client = new Razorpay({
        key_id: this.getKeyId(),
        key_secret: this.getKeySecret(),
      });
    }
    return this.client;
  }

  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrderRecord> {
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100) {
      throw new PaymentException(
        'INVALID_PAYABLE_AMOUNT',
        'Online payments need a payable amount of at least ₹1.',
      );
    }
    const order = await this.call('order create', () =>
      this.getClient().orders.create({
        amount: input.amountPaise,
        currency: RAZORPAY_CURRENCY,
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      }),
    );
    return {
      id: String(order.id),
      amount: Number(order.amount),
      currency: String(order.currency ?? RAZORPAY_CURRENCY),
      status: String(order.status ?? 'created'),
      receipt: order.receipt ? String(order.receipt) : null,
    };
  }

  async fetchOrder(razorpayOrderId: string): Promise<RazorpayOrderRecord> {
    const order = await this.call('order fetch', () =>
      this.getClient().orders.fetch(razorpayOrderId),
    );
    return {
      id: String(order.id),
      amount: Number(order.amount),
      currency: String(order.currency ?? RAZORPAY_CURRENCY),
      status: String(order.status ?? 'created'),
      receipt: order.receipt ? String(order.receipt) : null,
    };
  }

  async fetchPayment(
    razorpayPaymentId: string,
  ): Promise<RazorpayPaymentRecord> {
    const payment = await this.call('payment fetch', () =>
      this.getClient().payments.fetch(razorpayPaymentId),
    );
    return this.toPaymentRecord(payment);
  }

  async fetchOrderPayments(
    razorpayOrderId: string,
  ): Promise<RazorpayPaymentRecord[]> {
    const result = await this.call('order payments fetch', () =>
      this.getClient().orders.fetchPayments(razorpayOrderId),
    );
    const items = (result as { items?: unknown[] }).items ?? [];
    return items.map((item) => this.toPaymentRecord(item));
  }

  private toPaymentRecord(raw: unknown): RazorpayPaymentRecord {
    const payment = raw as Record<string, unknown>;
    return {
      id: String(payment.id),
      order_id: String(payment.order_id),
      amount: Number(payment.amount),
      currency: optionalString(payment.currency) ?? RAZORPAY_CURRENCY,
      status: String(payment.status),
      method: optionalString(payment.method),
      error_code: optionalString(payment.error_code),
      error_description: optionalString(payment.error_description),
      created_at:
        typeof payment.created_at === 'number' ? payment.created_at : null,
    };
  }

  async capturePayment(
    razorpayPaymentId: string,
    amountPaise: number,
  ): Promise<RazorpayPaymentRecord> {
    const payment = await this.call('payment capture', () =>
      this.getClient().payments.capture(
        razorpayPaymentId,
        amountPaise,
        RAZORPAY_CURRENCY,
      ),
    );
    return this.toPaymentRecord(payment);
  }

  verifyCheckoutSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    this.assertConfigured();
    return verifyPaymentSignature({
      ...input,
      keySecret: this.getKeySecret(),
    });
  }

  verifyWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): boolean {
    const secret = this.getWebhookSecret();
    if (!secret) {
      this.logger.error(
        'Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured.',
      );
      return false;
    }
    if (!signature) return false;
    return verifyWebhookSignature({
      rawBody,
      signature,
      webhookSecret: secret,
    });
  }

  expectedWebhookSignatureForTests(rawBody: Buffer | string): string {
    return expectedWebhookSignature(rawBody, this.getWebhookSecret());
  }
}
