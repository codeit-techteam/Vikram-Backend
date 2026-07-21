import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { WalletService } from './wallet.service';
import {
  WalletHistoryResponseDto,
  WalletSummaryDto,
} from './dto/wallet.dto';

@ApiTags(SWAGGER_TAGS.WALLET)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'wallet' })
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet summary' })
  @ApiResponse({ status: 200, type: WalletSummaryDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getSummary(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: WalletSummaryDto }> {
    const data = await this.walletService.getWalletSummary(user.id);
    return {
      success: true,
      message: 'Wallet fetched successfully',
      data,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiResponse({ status: 200, type: WalletHistoryResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getHistory(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: WalletHistoryResponseDto }> {
    const data = await this.walletService.getWalletHistory(user.id);
    return {
      success: true,
      message: 'Wallet history fetched successfully',
      data,
    };
  }
}
