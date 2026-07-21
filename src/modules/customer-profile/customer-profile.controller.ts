import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { ProfileResponseDto } from '../customer/dto/profile.dto';
import { CustomerProfileService } from './customer-profile.service';
import {
  ChangeEmailDto,
  ChangeMobileDto,
  CustomerActivityResponseDto,
  RequestMobileOtpDto,
  RequestMobileOtpResponseDto,
  UpdateProfileImageDto,
} from './dto/customer-profile.dto';

@ApiTags(SWAGGER_TAGS.CUSTOMER_PROFILE)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'customer' })
export class CustomerProfileController {
  constructor(private readonly customerProfileService: CustomerProfileService) {}

  @Patch('profile/image')
  @ApiOperation({ summary: 'Update profile image URL' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async updateProfileImage(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: UpdateProfileImageDto,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerProfileService.updateProfileImage(
      customer.id,
      dto,
    );
    return {
      success: true,
      message: 'Profile image updated successfully',
      data,
    };
  }

  @Post('change-mobile/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP for mobile change',
    description: 'Sends OTP to the new mobile number before change-mobile.',
  })
  @ApiResponse({ status: 200, type: RequestMobileOtpResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Mobile already registered',
    type: ApiErrorResponseDto,
  })
  async requestMobileOtp(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: RequestMobileOtpDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: RequestMobileOtpResponseDto;
  }> {
    const data = await this.customerProfileService.requestMobileChangeOtp(
      customer.id,
      dto.newMobile,
    );
    return {
      success: true,
      message: 'OTP sent to new mobile number',
      data,
    };
  }

  @Patch('change-mobile')
  @ApiOperation({
    summary: 'Change mobile number',
    description: 'Verifies OTP on the new mobile and updates customer phone.',
  })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid OTP', type: ApiErrorResponseDto })
  async changeMobile(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: ChangeMobileDto,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerProfileService.changeMobile(customer.id, dto);
    return {
      success: true,
      message: 'Mobile number updated successfully',
      data,
    };
  }

  @Patch('change-email')
  @ApiOperation({ summary: 'Change email address' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Email already registered',
    type: ApiErrorResponseDto,
  })
  async changeEmail(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: ChangeEmailDto,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerProfileService.changeEmail(customer.id, dto);
    return {
      success: true,
      message: 'Email updated successfully',
      data,
    };
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Customer activity summary',
    description: 'Recent orders, addresses, wishlist count, and cart count.',
  })
  @ApiResponse({ status: 200, type: CustomerActivityResponseDto })
  async getActivity(
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<{
    success: boolean;
    message: string;
    data: CustomerActivityResponseDto;
  }> {
    const data = await this.customerProfileService.getActivity(customer.id);
    return {
      success: true,
      message: 'Customer activity fetched successfully',
      data,
    };
  }
}
