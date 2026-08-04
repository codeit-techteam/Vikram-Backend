import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminCmsService } from './admin-cms.service';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin CMS')
@Controller({ version: '1', path: 'admin/cms' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminCmsController {
  constructor(
    private readonly cmsService: AdminCmsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('home-sequence')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Get homepage section sequence and content overview',
  })
  async homeSequence() {
    const data = await this.cmsService.getHomeSequence();
    return { success: true, message: 'Home sequence fetched', data };
  }

  @Post('home-sequence/reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder homepage sections' })
  async reorderHomeSequence(
    @Body() body: { items: Array<{ id: string; displayOrder: number }> },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.cmsService.reorderHomeSequence(body.items);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'HomeSection',
      newValue: body,
    });
    return { success: true, message: 'Home sequence reordered', data };
  }

  @Get('emergency-banners')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get emergency delivery / alert banners' })
  async emergencyBanners() {
    const data = await this.cmsService.getEmergencyBanners();
    return { success: true, message: 'Emergency banners fetched', data };
  }

  @Get('membership-banners')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get membership section banners' })
  async membershipBanners() {
    const data = await this.cmsService.getMembershipBanners();
    return { success: true, message: 'Membership banners fetched', data };
  }

  @Get('bulk-procurement')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get bulk procurement section banners' })
  async bulkProcurement() {
    const data = await this.cmsService.getBulkProcurementSection();
    return { success: true, message: 'Bulk procurement section fetched', data };
  }

  @Get('recommended-products')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get recommended / featured products for homepage' })
  async recommendedProducts() {
    const data = await this.cmsService.getRecommendedProducts();
    return { success: true, message: 'Recommended products fetched', data };
  }

  @Get('promotional-cards')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get promotional offer cards for homepage' })
  async promotionalCards() {
    const data = await this.cmsService.getPromotionalCards();
    return { success: true, message: 'Promotional cards fetched', data };
  }
}
