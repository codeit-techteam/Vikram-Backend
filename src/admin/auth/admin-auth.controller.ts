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
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { Public } from '../../common/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from './admin-jwt.strategy';
import { AdminAuthService } from './admin-auth.service';
import {
  AdminLoginDto,
  AdminRefreshTokenDto,
  AdminLogoutDto,
  AdminLoginResponseDto,
  AdminTokenResponseDto,
  AdminMeDto,
} from './dto/admin-auth.dto';

@ApiTags('Admin Auth')
@Controller({ version: '1', path: 'admin/auth' })
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AdminLoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: AdminLoginDto,
  ): Promise<{ success: boolean; message: string; data: AdminLoginResponseDto }> {
    const data = await this.adminAuthService.login(dto.email, dto.password);
    return { success: true, message: 'Login successful', data };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh admin access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed', type: AdminTokenResponseDto })
  async refresh(
    @Body() dto: AdminRefreshTokenDto,
  ): Promise<{ success: boolean; message: string; data: AdminTokenResponseDto }> {
    const data = await this.adminAuthService.refresh(dto.refreshToken);
    return { success: true, message: 'Token refreshed successfully', data };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Admin logout' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: AdminLogoutDto,
  ): Promise<{ success: boolean; message: string; data: null }> {
    await this.adminAuthService.logout(admin.id, dto.refreshToken);
    return { success: true, message: 'Logged out successfully', data: null };
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Get current admin profile' })
  @ApiResponse({ status: 200, description: 'Admin profile', type: AdminMeDto })
  async me(
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<{ success: boolean; message: string; data: AdminMeDto }> {
    const data = await this.adminAuthService.getMe(admin.id);
    return { success: true, message: 'Admin profile fetched', data };
  }
}
