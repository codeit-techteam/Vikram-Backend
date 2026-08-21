import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { LoyaltyService } from './loyalty.service';
import {
  LoyaltyHistoryResponseDto,
  LoyaltySummaryDto,
} from './dto/loyalty.dto';

@ApiTags(SWAGGER_TAGS.LOYALTY)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'loyalty' })
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get()
  @ApiOperation({ summary: 'Get current loyalty points' })
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
  async getHistory(@CurrentUser() user: AuthenticatedCustomer): Promise<{
    success: boolean;
    message: string;
    data: LoyaltyHistoryResponseDto;
  }> {
    const data = await this.loyaltyService.getLoyaltyHistory(user.id);
    return {
      success: true,
      message: 'Loyalty history fetched successfully',
      data,
    };
  }
}
