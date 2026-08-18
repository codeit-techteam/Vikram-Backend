import { Body, Controller, Get, Param, Post, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminLoyaltyService } from './admin-loyalty.service';
import { LoyaltyAdjustDto, LoyaltyRewardDto, LoyaltyRedeemDto, LoyaltyQueryDto } from './dto/admin-loyalty.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Loyalty')
@Controller({ version: '1', path: 'admin/loyalty' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminLoyaltyController {
  constructor(
    private readonly loyaltyService: AdminLoyaltyService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all loyalty accounts' })
  async findAll(@Query() query: LoyaltyQueryDto) {
    const data = await this.loyaltyService.findAll(query);
    return { success: true, message: 'Loyalty accounts fetched', data };
  }

  @Get('stats')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Loyalty dashboard stats' })
  async getStats() {
    const data = await this.loyaltyService.getStats();
    return { success: true, message: 'Loyalty stats fetched', data };
  }

  @Get('leaderboard')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Top customers by loyalty points' })
  async getLeaderboard(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const data = await this.loyaltyService.getLeaderboard(parsedLimit);
    return { success: true, message: 'Loyalty leaderboard fetched', data };
  }

  @Get(':customerId')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get loyalty account by customer ID' })
  async findOne(@Param('customerId') customerId: string) {
    const data = await this.loyaltyService.findByCustomer(customerId);
    return { success: true, message: 'Loyalty account fetched', data };
  }

  @Patch(':customerId/adjust')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Adjust loyalty points (credit or debit)' })
  async adjust(@Param('customerId') customerId: string, @Body() dto: LoyaltyAdjustDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.loyaltyService.adjustPoints(customerId, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'LoyaltyAccount', resourceId: customerId, newValue: dto });
    return { success: true, message: 'Points adjusted', data };
  }

  @Post(':customerId/reward')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Credit loyalty points to customer' })
  async reward(@Param('customerId') customerId: string, @Body() dto: LoyaltyRewardDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.loyaltyService.rewardPoints(customerId, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREDIT', resource: 'LoyaltyAccount', resourceId: customerId, newValue: dto });
    return { success: true, message: 'Points rewarded', data };
  }

  @Post(':customerId/redeem')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Debit loyalty points for customer' })
  async redeem(@Param('customerId') customerId: string, @Body() dto: LoyaltyRedeemDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.loyaltyService.redeemPoints(customerId, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DEBIT', resource: 'LoyaltyAccount', resourceId: customerId, newValue: dto });
    return { success: true, message: 'Points redeemed', data };
  }
}
