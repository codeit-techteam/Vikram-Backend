import {
  Body,
  Controller,
  Delete,
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
import { AdminQuickActionsService } from './admin-quick-actions.service';
import {
  CreateQuickActionDto,
  UpdateQuickActionDto,
} from './dto/admin-quick-actions.dto';

@ApiTags('Admin Quick Actions')
@Controller({ version: '1', path: 'admin/quick-actions' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminQuickActionsController {
  constructor(
    private readonly quickActionsService: AdminQuickActionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List homepage quick action buttons' })
  async findAll() {
    const data = await this.quickActionsService.findAll();
    return { success: true, message: 'Quick actions fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async findOne(@Param('id') id: string) {
    const data = await this.quickActionsService.findOne(id);
    return { success: true, message: 'Quick action fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async create(
    @Body() dto: CreateQuickActionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.quickActionsService.create(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'QuickAction',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Quick action created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async reorder(
    @Body() body: { items: Array<{ id: string; displayOrder: number }> },
  ) {
    const data = await this.quickActionsService.reorder(body.items);
    return { success: true, message: 'Quick actions reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuickActionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.quickActionsService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'QuickAction',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Quick action updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.quickActionsService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'QuickAction',
      resourceId: id,
    });
    return { success: true, message: 'Quick action deleted', data };
  }
}
