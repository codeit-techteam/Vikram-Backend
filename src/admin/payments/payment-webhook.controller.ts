import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerExecutiveService } from '../customer-executive/customer-executive.service';

class PaymentWebhookDto {
  @ApiProperty({ description: 'PaymentLink publicToken' })
  @IsString()
  @MinLength(16)
  publicToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;
}

@ApiTags('Payments Webhook')
@Controller({ version: '1', path: 'payments' })
export class PaymentWebhookController {
  constructor(
    private readonly ceService: CustomerExecutiveService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @ApiOperation({
    summary: 'Idempotent payment provider webhook',
    description:
      'Requires header x-payment-webhook-secret matching PAYMENT_WEBHOOK_SECRET',
  })
  async webhook(
    @Headers('x-payment-webhook-secret') secret: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ) {
    const expected =
      this.configService.get<string>('payment.webhookSecret') ??
      process.env.PAYMENT_WEBHOOK_SECRET ??
      '';

    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid payment webhook secret');
    }

    const data = await this.ceService.confirmPaymentWebhook(dto);
    return { success: true, message: 'Payment webhook processed', data };
  }
}
