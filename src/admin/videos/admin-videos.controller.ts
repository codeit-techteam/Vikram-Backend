import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminVideosService } from './admin-videos.service';
import { CreateVideoDto, UpdateVideoDto } from './dto/admin-videos.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Videos')
@Controller({ version: '1', path: 'admin/videos' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminVideosController {
  constructor(
    private readonly videosService: AdminVideosService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all videos' })
  async findAll(@Query('placement') placement?: string) {
    const data = await this.videosService.findAll(placement);
    return { success: true, message: 'Videos fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get video by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.videosService.findOne(id);
    return { success: true, message: 'Video fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create video' })
  async create(@Body() dto: CreateVideoDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.videosService.create(dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREATE', resource: 'Video', resourceId: data.id, newValue: dto });
    return { success: true, message: 'Video created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder videos' })
  async reorder(@Body() body: { items: Array<{ id: string; displayOrder: number }> }) {
    const data = await this.videosService.reorder(body.items);
    return { success: true, message: 'Videos reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update video' })
  async update(@Param('id') id: string, @Body() dto: UpdateVideoDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.videosService.update(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'Video', resourceId: id, newValue: dto });
    return { success: true, message: 'Video updated', data };
  }

  @Patch(':id/publish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Publish video' })
  async publish(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.videosService.publish(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'PUBLISH', resource: 'Video', resourceId: id });
    return { success: true, message: 'Video published', data };
  }

  @Patch(':id/unpublish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Unpublish video' })
  async unpublish(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.videosService.unpublish(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UNPUBLISH', resource: 'Video', resourceId: id });
    return { success: true, message: 'Video unpublished', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete video' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.videosService.remove(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DELETE', resource: 'Video', resourceId: id });
    return { success: true, message: 'Video deleted', data };
  }
}
