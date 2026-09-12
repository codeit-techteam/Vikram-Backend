import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { PaymentsService } from './payments.service';

@ApiTags(SWAGGER_TAGS.PAYMENTS)
@Controller({ version: '1', path: 'payments/razorpay' })
export class RazorpayWebhookController {
  private readonly logger = new Logger(RazorpayWebhookController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @SkipResponseWrap()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      this.logger.warn('Razorpay webhook missing raw body');
      throw new UnauthorizedException('Invalid webhook payload');
    }

    const result = await this.paymentsService.handleWebhook(rawBody, signature);
    return { status: 'ok', ...result };
  }
}
