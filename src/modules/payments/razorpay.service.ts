import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import {
  assertKeyMatchesMode,
  expectedWebhookSignature,
  RAZORPAY_CURRENCY,
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
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private client: Razorpay | null = null;

  constructor(private readonly configService: ConfigService) {}

  getMode(): RazorpayMode {
    const mode = this.configService.get<string>('payment.razorpay.mode');
    return mode === 'live' ? 'live' : 'test';
  }

  getKeyId(): string {
    return this.configService.get<string>('payment.razorpay.keyId')?.trim() ?? '';
  }

  private getKeySecret(): string {
    return (
      this.configService.get<string>('payment.razorpay.keySecret')?.trim() ?? ''
    );
  }

  private getWebhookSecret(): string {
    return (
      this.configService.get<string>('payment.razorpay.webhookSecret')?.trim() ??
      ''
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
    const order = await this.getClient().orders.create({
      amount: input.amountPaise,
      currency: RAZORPAY_CURRENCY,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return {
      id: String(order.id),
      amount: Number(order.amount),
      currency: String(order.currency ?? RAZORPAY_CURRENCY),
      status: String(order.status ?? 'created'),
      receipt: order.receipt ? String(order.receipt) : null,
    };
  }

  async fetchOrder(razorpayOrderId: string): Promise<RazorpayOrderRecord> {
    const order = await this.getClient().orders.fetch(razorpayOrderId);
    return {
      id: String(order.id),
      amount: Number(order.amount),
      currency: String(order.currency ?? RAZORPAY_CURRENCY),
      status: String(order.status ?? 'created'),
      receipt: order.receipt ? String(order.receipt) : null,
    };
  }

  async fetchPayment(razorpayPaymentId: string): Promise<RazorpayPaymentRecord> {
    const payment = await this.getClient().payments.fetch(razorpayPaymentId);
    return {
      id: String(payment.id),
      order_id: String(payment.order_id),
      amount: Number(payment.amount),
      currency: String(payment.currency ?? RAZORPAY_CURRENCY),
      status: String(payment.status),
      method: payment.method ? String(payment.method) : null,
      error_code: payment.error_code ? String(payment.error_code) : null,
      error_description: payment.error_description
        ? String(payment.error_description)
        : null,
    };
  }

  async capturePayment(
    razorpayPaymentId: string,
    amountPaise: number,
  ): Promise<RazorpayPaymentRecord> {
    const payment = await this.getClient().payments.capture(
      razorpayPaymentId,
      amountPaise,
      RAZORPAY_CURRENCY,
    );
    return {
      id: String(payment.id),
      order_id: String(payment.order_id),
      amount: Number(payment.amount),
      currency: String(payment.currency ?? RAZORPAY_CURRENCY),
      status: String(payment.status),
      method: payment.method ? String(payment.method) : null,
      error_code: payment.error_code ? String(payment.error_code) : null,
      error_description: payment.error_description
        ? String(payment.error_description)
        : null,
    };
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

  verifyWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
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
