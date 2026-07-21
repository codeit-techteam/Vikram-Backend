import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { CheckoutService } from './checkout.service';
import {
  CheckoutQueryDto,
  CheckoutResponseDto,
  PrepareCheckoutDto,
} from './dto/checkout.dto';

@ApiTags(SWAGGER_TAGS.CHECKOUT)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'checkout' })
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get()
  @ApiOperation({
    summary: 'Get checkout summary',
    description:
      'Validates cart items, stock, customer address, and nearest hub availability. Calculates subtotal, GST, delivery charge, and grand total. Does NOT place an order.',
  })
  @ApiResponse({
    status: 200,
    type: CheckoutResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Checkout summary prepared',
        data: {
          address: { id: 'uuid', city: 'Mumbai', pincode: '400001' },
          itemCount: 1,
          subtotal: 850,
          gstAmount: 153,
          deliveryCharge: 150,
          grandTotal: 1153,
          hubAvailable: true,
          nearestHub: { code: 'HUB-MUM-01', distanceKm: 3.4, canFulfill: true },
          paymentMethod: 'CASH',
          readinessMessage: 'Ready for order placement',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Empty cart / stock error', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Address not found', type: ApiErrorResponseDto })
  async getCheckout(
    @CurrentUser() user: AuthenticatedCustomer,
    @Query() query: CheckoutQueryDto,
  ): Promise<{ success: boolean; message: string; data: CheckoutResponseDto }> {
    const data = await this.checkoutService.getCheckout(user.id, query.addressId);
    return { success: true, message: 'Checkout summary prepared', data };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare checkout summary',
    description:
      'Same as GET /checkout but accepts a body (addressId, notes). Validates cart, address, stock, and hub. Does NOT place an order — use POST /orders to place.',
  })
  @ApiBody({
    type: PrepareCheckoutDto,
    examples: {
      default: {
        value: {
          addressId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          notes: 'Call before delivery',
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: CheckoutResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async prepareCheckout(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: PrepareCheckoutDto,
  ): Promise<{ success: boolean; message: string; data: CheckoutResponseDto }> {
    const data = await this.checkoutService.prepareCheckout(user.id, dto);
    return { success: true, message: 'Checkout summary prepared', data };
  }
}
