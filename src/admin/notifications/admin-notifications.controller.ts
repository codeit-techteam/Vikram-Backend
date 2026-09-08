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
import { AdminPushCampaignsService } from './admin-push-campaigns.service';
import {
  CreateNotificationDto,
  BroadcastNotificationDto,
  UpdateNotificationDto,
  NotificationQueryDto,
} from './dto/admin-notifications.dto';
import {
  CreatePushCampaignDto,
  PushCampaignQueryDto,
  RegisterAdminDeviceTokenDto,
  SendTestPushDto,
  UpdatePushCampaignDto,
} from './dto/admin-push-campaigns.dto';
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
    private readonly campaigns: AdminPushCampaignsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('campaigns')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List push notification campaigns' })
  async listCampaigns(@Query() query: PushCampaignQueryDto) {
    const data = await this.campaigns.findAll(query);
    return { success: true, message: 'Campaigns fetched', data };
  }

  @Get('campaigns/stats')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Push notification campaign statistics' })
  async campaignStats() {
    const data = await this.campaigns.stats();
    return { success: true, message: 'Campaign stats fetched', data };
  }

  @Get('campaigns/options')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Composer options: hubs, segments, catalog links' })
  async campaignOptions() {
    const data = await this.campaigns.composerOptions();
    return { success: true, message: 'Composer options fetched', data };
  }

  @Get('campaigns/customers')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Search customers for custom audience lists' })
  async searchCampaignCustomers(@Query('q') q?: string) {
    const data = await this.campaigns.searchCustomers(q ?? '');
    return { success: true, message: 'Customers fetched', data };
  }

  @Get('campaigns/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get a push campaign' })
  async getCampaign(@Param('id') id: string) {
    const data = await this.campaigns.findOne(id);
    return { success: true, message: 'Campaign fetched', data };
  }

  @Post('campaigns')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create, schedule, or send a push campaign' })
  async createCampaign(
    @Body() dto: CreatePushCampaignDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.campaigns.create(admin.id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'PushCampaign',
      resourceId: data.id,
      newValue: { title: dto.title, audienceType: dto.audienceType },
    });
    const queued = data.status === 'QUEUED';
    return {
      success: true,
      message: queued
        ? 'Notification queued successfully'
        : data.status === 'SCHEDULED'
          ? 'Notification scheduled'
          : data.status === 'DRAFT'
            ? 'Draft saved'
            : 'Notification created',
      data,
    };
  }

  @Patch('campaigns/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update a draft campaign' })
  async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdatePushCampaignDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.campaigns.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'PushCampaign',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Draft updated', data };
  }

  @Post('campaigns/:id/send')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Queue a draft campaign for send' })
  async sendCampaign(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.campaigns.sendDraft(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'PushCampaign',
      resourceId: id,
      newValue: { status: 'QUEUED' },
    });
    return {
      success: true,
      message: 'Notification queued successfully',
      data,
    };
  }

  @Post('campaigns/:id/cancel')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Cancel a draft or scheduled campaign' })
  async cancelCampaign(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.campaigns.cancel(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'PushCampaign',
      resourceId: id,
      newValue: { status: 'CANCELLED' },
    });
    return { success: true, message: 'Notification cancelled', data };
  }

  @Post('test')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Send a test FCM notification to the admin device' })
  async sendTest(
    @Body() dto: SendTestPushDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.campaigns.sendTest(admin, dto);
    return {
      success: true,
      message:
        data.sent > 0
          ? `Test notification sent (${data.sent} device${data.sent === 1 ? '' : 's'})`
          : 'Test notification failed to deliver',
      data,
    };
  }

  @Post('test-device')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Register an admin device for test notifications' })
  async registerTestDevice(
    @Body() dto: RegisterAdminDeviceTokenDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.campaigns.registerAdminDevice(admin.id, dto);
    return { success: true, message: 'Test device registered', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List in-app notification inbox rows' })
  async findAll(@Query() query: NotificationQueryDto) {
    const data = await this.notificationsService.findAll(query);
    return { success: true, message: 'Notifications fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get in-app notification by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.notificationsService.findOne(id);
    return { success: true, message: 'Notification fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create in-app notification (targeted or global)' })
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
  @ApiOperation({
    summary: 'Broadcast in-app notification to all active customers',
  })
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
  @ApiOperation({ summary: 'Update in-app notification' })
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
  @ApiOperation({ summary: 'Delete in-app notification' })
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
