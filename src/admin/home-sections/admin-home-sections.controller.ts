import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AdminHomeSectionsService } from './admin-home-sections.service';
import {
  ReorderHomeSectionsDto,
  UpdateHomeSectionDto,
} from './dto/admin-home-sections.dto';

@ApiTags('Admin Home Sections')
@Controller({ version: '1', path: 'admin/home-sections' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminHomeSectionsController {
  constructor(
    private readonly sectionsService: AdminHomeSectionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List homepage sections (layout manager)' })
  async findAll() {
    const data = await this.sectionsService.findAll();
    return { success: true, message: 'Home sections fetched', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder homepage sections (drag-drop)' })
  async reorder(
    @Body() body: ReorderHomeSectionsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.sectionsService.reorder(body.items);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'HomeSection',
      newValue: body,
    });
    return { success: true, message: 'Home sections reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHomeSectionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.sectionsService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'HomeSection',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Home section updated', data };
  }

  @Patch(':id/toggle')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async toggle(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.sectionsService.toggle(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'HomeSection',
      resourceId: id,
    });
    return { success: true, message: 'Home section toggled', data };
  }
}
