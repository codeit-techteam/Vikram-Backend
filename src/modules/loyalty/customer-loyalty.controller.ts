import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { LoyaltyService } from './loyalty.service';
import {
  LoyaltyEarnDto,
  LoyaltyEarnResponseDto,
  LoyaltyHistoryResponseDto,
  LoyaltyRedeemDto,
  LoyaltyRedeemResponseDto,
  LoyaltySummaryDto,
} from './dto/loyalty.dto';

@ApiTags(SWAGGER_TAGS.LOYALTY)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'customer/loyalty' })
export class CustomerLoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get()
  @ApiOperation({
    summary: 'Get loyalty balance, tier, expiry, and next tier progress',
  })
  @ApiResponse({ status: 200, type: LoyaltySummaryDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getSummary(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: LoyaltySummaryDto }> {
    const data = await this.loyaltyService.getLoyaltySummary(user.id);
    return {
      success: true,
      message: 'Loyalty account fetched successfully',
      data,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get loyalty transaction history' })
  @ApiResponse({ status: 200, type: LoyaltyHistoryResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getHistory(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: LoyaltyHistoryResponseDto }> {
    const data = await this.loyaltyService.getLoyaltyHistory(user.id);
    return {
      success: true,
      message: 'Loyalty history fetched successfully',
      data,
    };
  }

  @Post('redeem')
  @ApiOperation({
    summary: 'Redeem loyalty points against an order',
    description:
      'Minimum 500 points. 1 point = ₹1. Maximum 30% of order value. Cannot exceed non-expired balance.',
  })
  @ApiResponse({ status: 201, type: LoyaltyRedeemResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async redeem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: LoyaltyRedeemDto,
  ): Promise<{ success: boolean; message: string; data: LoyaltyRedeemResponseDto }> {
    const data = await this.loyaltyService.redeemPoints(user.id, dto);
    return {
      success: true,
      message: 'Loyalty points redeemed successfully',
      data,
    };
  }

  @Public()
  @UseGuards(InternalApiGuard)
  @Post('earn')
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiOperation({
    summary: 'Credit loyalty points after order delivery (internal)',
    description: 'Requires x-internal-api-key. Awards 1 point per ₹100 subtotal.',
  })
  @ApiResponse({ status: 201, type: LoyaltyEarnResponseDto })
  async earn(
    @Body() dto: LoyaltyEarnDto,
  ): Promise<{ success: boolean; message: string; data: LoyaltyEarnResponseDto }> {
    const data = await this.loyaltyService.earnForOrder(dto);
    return {
      success: true,
      message: data.message,
      data,
    };
  }
}
