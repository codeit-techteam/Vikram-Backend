import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
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
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedCustomer } from '../jwt/jwt-payload.interface';
import { CustomerAuthService } from './customer-auth.service';
import {
  AuthResponseDto,
  AuthTokensDto,
  CustomerMeDto,
  SendOtpResponseDto,
} from './dto/customer-auth-response.dto';
import {
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/customer-auth.dto';

@ApiTags(SWAGGER_TAGS.AUTH)
@Controller({ version: '1', path: 'auth/customer' })
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send OTP to customer mobile number',
    description:
      'Step 1 of auth. Call this first. In development the response includes `otp` (default 123456). Then call login or verify-otp within 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: SendOtpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
    type: ApiErrorResponseDto,
  })
  async sendOtp(
    @Body() dto: SendOtpDto,
  ): Promise<{ success: boolean; message: string; data: SendOtpResponseDto }> {
    const data = await this.customerAuthService.sendOtp(dto.mobile);
    return {
      success: true,
      message: 'OTP sent successfully',
      data,
    };
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and authenticate (creates customer if new)',
    description:
      'Step 2 of auth. Requires a prior send-otp. Creates the customer on first success and returns JWT + refresh token.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, tokens issued',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
    type: ApiErrorResponseDto,
  })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
  ): Promise<{ success: boolean; message: string; data: AuthResponseDto }> {
    const data = await this.customerAuthService.verifyOtp(dto.mobile, dto.otp, {
      deviceId: dto.deviceId,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
    });
    return {
      success: true,
      message: data.isNewCustomer
        ? 'Account created and authenticated successfully'
        : 'OTP verified successfully',
      data,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with mobile + OTP',
    description:
      'Same as verify-otp: call send-otp first, then login with the OTP. Creates the customer if they do not exist yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'OTP expired or invalid — call send-otp first',
    type: ApiErrorResponseDto,
  })
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ success: boolean; message: string; data: AuthResponseDto }> {
    const data = await this.customerAuthService.login(dto.mobile, dto.otp, {
      deviceId: dto.deviceId,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
    });
    return {
      success: true,
      message: 'Login successful',
      data,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed',
    type: AuthTokensDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
    type: ApiErrorResponseDto,
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<{ success: boolean; message: string; data: AuthTokensDto }> {
    const data = await this.customerAuthService.refresh(
      dto.refreshToken,
      dto.deviceId,
    );
    return {
      success: true,
      message: 'Token refreshed successfully',
      data,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ApiErrorResponseDto,
  })
  async logout(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: LogoutDto,
  ): Promise<{ success: boolean; message: string; data: null }> {
    await this.customerAuthService.logout(user.id, dto.refreshToken);
    return {
      success: true,
      message: 'Logged out successfully',
      data: null,
    };
  }

  @Get('me')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Get current authenticated customer profile' })
  @ApiResponse({
    status: 200,
    description: 'Customer profile fetched',
    type: CustomerMeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ApiErrorResponseDto,
  })
  async me(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: CustomerMeDto }> {
    const data = await this.customerAuthService.getMe(user.id);
    return {
      success: true,
      message: 'Customer profile fetched successfully',
      data,
    };
  }
}
