import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendInvoiceEmailInput {
  to: string;
  customerName: string;
  invoiceNumber: string;
  orderNumber: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

export interface EmailSendResult {
  sent: boolean;
  messageId?: string;
  mode: 'mock' | 'smtp';
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<EmailSendResult> {
    const enabled = this.configService.get<boolean>('email.enabled', false);
    const from = this.configService.get<string>('email.from', 'noreply@bajriwala.com');

    if (!enabled) {
      this.logger.log(
        `[MOCK EMAIL] Invoice ${input.invoiceNumber} → ${input.to} (${input.pdfFilename}, ${input.pdfBuffer.length} bytes)`,
      );
      return {
        sent: true,
        messageId: `mock-${Date.now()}`,
        mode: 'mock',
      };
    }

    // SMTP integration point — wire nodemailer or @nestjs-modules/mailer here
    const smtpHost = this.configService.get<string>('email.smtpHost', '');
    if (!smtpHost) {
      this.logger.warn(
        `EMAIL_ENABLED=true but SMTP_HOST is empty — falling back to mock for ${input.to}`,
      );
      return {
        sent: false,
        mode: 'mock',
        error: 'SMTP not configured',
      };
    }

    this.logger.log(
      `[SMTP READY] Would send invoice ${input.invoiceNumber} from ${from} to ${input.to} via ${smtpHost}`,
    );

    return {
      sent: false,
      mode: 'smtp',
      error: 'SMTP transport not yet wired — configure nodemailer in EmailService',
    };
  }
}
