import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import {
  CancelRazorpayPaymentDto,
  CreateRazorpayOrderDto,
  VerifyRazorpayPaymentDto,
} from './dto/razorpay-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags(SWAGGER_TAGS.PAYMENTS)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'payments/razorpay' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Get('config')
  @ApiOperation({
    summary: 'Public Razorpay configuration for the customer app',
    description:
      'Returns only whether Test Mode online payments are configured. Never returns Key Secret.',
  })
  getConfig() {
    return this.paymentsService.getPublicConfig();
  }

  @Get('pending')
  @ApiOperation({ summary: 'Latest unpaid Razorpay checkout for this customer' })
  getPending(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.paymentsService.getPending(customer.id);
  }

  @Get('status/:orderId')
  @ApiOperation({ summary: 'Authoritative payment status for an internal order' })
  getStatus(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.getStatus(customer.id, orderId);
  }

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create internal pending order + Razorpay order',
    description:
      'Backend calculates the payable amount from cart/order data. The Key Secret is never returned.',
  })
  createOrder(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CreateRazorpayOrderDto,
  ) {
    return this.paymentsService.createCheckout(customer.id, dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Razorpay checkout signature and confirm the order',
  })
  verify(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: VerifyRazorpayPaymentDto,
  ) {
    return this.paymentsService.verifyCheckoutPayment(customer.id, dto);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a checkout attempt as cancelled by the customer' })
  cancel(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CancelRazorpayPaymentDto,
  ) {
    return this.paymentsService.cancelCheckout(customer.id, dto.internalOrderId);
  }
}
