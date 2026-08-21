import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminNotificationsService } from './admin-notifications.service';
import {
  CreateNotificationDto,
  BroadcastNotificationDto,
  UpdateNotificationDto,
  NotificationQueryDto,
} from './dto/admin-notifications.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Notifications')
@Controller({ version: '1', path: 'admin/notifications' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: AdminNotificationsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all notifications' })
  async findAll(@Query() query: NotificationQueryDto) {
    const data = await this.notificationsService.findAll(query);
    return { success: true, message: 'Notifications fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get notification by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.notificationsService.findOne(id);
    return { success: true, message: 'Notification fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create notification (targeted or global)' })
  async create(
    @Body() dto: CreateNotificationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.notificationsService.create(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Notification',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Notification created', data };
  }

  @Post('broadcast')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Broadcast notification to all active customers' })
  async broadcast(
    @Body() dto: BroadcastNotificationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.notificationsService.broadcast(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Notification',
      newValue: { broadcast: true, ...dto },
    });
    return {
      success: true,
      message: `Notification broadcast to ${data.sentTo} customers`,
      data,
    };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update notification' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.notificationsService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Notification',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Notification updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete notification' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.notificationsService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Notification',
      resourceId: id,
    });
    return { success: true, message: 'Notification deleted', data };
  }
}
