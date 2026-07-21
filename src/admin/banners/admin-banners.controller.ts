import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminBannersService } from './admin-banners.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/admin-banners.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Banners')
@Controller({ version: '1', path: 'admin/banners' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminBannersController {
  constructor(
    private readonly bannersService: AdminBannersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all banners' })
  async findAll(@Query('placement') placement?: string) {
    const data = await this.bannersService.findAll(placement);
    return { success: true, message: 'Banners fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get banner by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.bannersService.findOne(id);
    return { success: true, message: 'Banner fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create banner' })
  async create(@Body() dto: CreateBannerDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bannersService.create(dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREATE', resource: 'Banner', resourceId: data.id, newValue: dto });
    return { success: true, message: 'Banner created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder banners' })
  async reorder(@Body() body: { items: Array<{ id: string; displayOrder: number }> }) {
    const data = await this.bannersService.reorder(body.items);
    return { success: true, message: 'Banners reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update banner' })
  async update(@Param('id') id: string, @Body() dto: UpdateBannerDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bannersService.update(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'Banner', resourceId: id, newValue: dto });
    return { success: true, message: 'Banner updated', data };
  }

  @Patch(':id/publish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Publish banner' })
  async publish(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bannersService.publish(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'PUBLISH', resource: 'Banner', resourceId: id });
    return { success: true, message: 'Banner published', data };
  }

  @Patch(':id/unpublish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Unpublish banner' })
  async unpublish(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bannersService.unpublish(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UNPUBLISH', resource: 'Banner', resourceId: id });
    return { success: true, message: 'Banner unpublished', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete banner' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bannersService.remove(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DELETE', resource: 'Banner', resourceId: id });
    return { success: true, message: 'Banner deleted', data };
  }
}
