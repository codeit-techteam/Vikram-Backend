import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { HubAuthService } from './hub-auth.service';
import {
  HubLoginDto,
  HubRefreshTokenDto,
  HubLogoutDto,
  HubForgotPasswordDto,
  HubLoginResponseDto,
  HubTokenResponseDto,
  HubManagerProfileDto,
} from './dto/hub-auth.dto';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from './hub-jwt.strategy';

@ApiTags(SWAGGER_TAGS.HUB_AUTH)
@Controller({ version: '1', path: 'hub/auth' })
export class HubAuthController {
  constructor(private readonly hubAuthService: HubAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hub manager login with employee ID and password' })
  @ApiResponse({ status: 200, type: HubLoginResponseDto })
  @ApiResponse({ status: 403, description: 'Account disabled' })
  async login(
    @Body() dto: HubLoginDto,
  ): Promise<{ success: boolean; message: string; data: HubLoginResponseDto }> {
    const data = await this.hubAuthService.login(dto.employeeId, dto.password);
    return { success: true, message: 'Login successful', data };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh hub access token' })
  @ApiResponse({ status: 200, type: HubTokenResponseDto })
  async refresh(
    @Body() dto: HubRefreshTokenDto,
  ): Promise<{ success: boolean; message: string; data: HubTokenResponseDto }> {
    const data = await this.hubAuthService.refresh(dto.refreshToken);
    return { success: true, message: 'Token refreshed successfully', data };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset (admin will process)' })
  async forgotPassword(@Body() dto: HubForgotPasswordDto): Promise<{
    success: boolean;
    message: string;
    data: { requested: boolean };
  }> {
    const data = await this.hubAuthService.requestPasswordReset(dto.employeeId);
    return {
      success: true,
      message: 'Password reset request sent to administrator',
      data,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HubJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Hub logout' })
  async logout(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubLogoutDto,
  ): Promise<{ success: boolean; message: string; data: null }> {
    await this.hubAuthService.logout(user.id, dto.refreshToken);
    return { success: true, message: 'Logged out successfully', data: null };
  }

  @Get('me')
  @UseGuards(HubJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Get current hub manager profile' })
  @ApiResponse({ status: 200, type: HubManagerProfileDto })
  async me(@CurrentHubUser() user: AuthenticatedHubUser): Promise<{
    success: boolean;
    message: string;
    data: HubManagerProfileDto;
  }> {
    const data = await this.hubAuthService.getMe(user.id);
    return { success: true, message: 'Hub profile fetched', data };
  }
}
