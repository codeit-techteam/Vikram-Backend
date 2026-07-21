import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { ApiAdminRoles } from '../decorators/api-admin-roles.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminSupportService } from './admin-support.service';
import {
  AdminSupportNoteDto,
  AdminSupportQueryDto,
  AdminSupportReplyDto,
  AssignSupportExecutiveDto,
  SupportTicketDetailDto,
  SupportTicketListResponseDto,
  UpdateSupportPriorityDto,
  UpdateSupportStatusDto,
} from './dto/admin-support.dto';

@ApiTags('Admin Support')
@Controller({ version: '1', path: 'admin/support' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminSupportController {
  constructor(
    private readonly supportService: AdminSupportService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'List support tickets',
    description:
      'Paginated ticket list with filters for status, priority, executive, customer, and date range.',
  })
  @ApiResponse({ status: 200, type: SupportTicketListResponseDto })
  async findAll(@Query() query: AdminSupportQueryDto) {
    const data = await this.supportService.findAll(query);
    return { success: true, message: 'Support tickets fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Get support ticket details',
    description: 'Returns ticket details with messages, internal notes, and history.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.supportService.findOne(id);
    return { success: true, message: 'Support ticket fetched', data };
  }

  @Patch(':id/assign')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Assign executive to ticket',
    description: 'Assigns a customer executive. Sets status to ASSIGNED when ticket is OPEN.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async assignExecutive(
    @Param('id') id: string,
    @Body() dto: AssignSupportExecutiveDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.assignExecutive(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'ASSIGN',
      resource: 'SupportTicket',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Executive assigned', data };
  }

  @Post(':id/reply')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Reply to support ticket',
    description:
      'Posts a public admin reply visible to the customer. Customer executives can reply; tickets cannot be deleted.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  @ApiResponse({ status: 400, description: 'Ticket is closed or resolved' })
  async reply(
    @Param('id') id: string,
    @Body() dto: AdminSupportReplyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.reply(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      newValue: { action: 'reply', message: dto.message },
    });
    return { success: true, message: 'Reply sent', data };
  }

  @Post(':id/notes')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Add internal note',
    description: 'Adds an internal note visible only to admins, not the customer.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async addNote(
    @Param('id') id: string,
    @Body() dto: AdminSupportNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.addInternalNote(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      newValue: { action: 'internal_note' },
    });
    return { success: true, message: 'Internal note added', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Update ticket status',
    description:
      'Updates ticket status (OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED). Use resolve by setting status to RESOLVED.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupportStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.supportService.findOne(id);
    const data = await this.supportService.updateStatus(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      oldValue: { status: before.status },
      newValue: dto,
    });
    return { success: true, message: 'Ticket status updated', data };
  }

  @Patch(':id/priority')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update ticket priority' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async updatePriority(
    @Param('id') id: string,
    @Body() dto: UpdateSupportPriorityDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.supportService.findOne(id);
    const data = await this.supportService.updatePriority(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      oldValue: { priority: before.priority },
      newValue: dto,
    });
    return { success: true, message: 'Ticket priority updated', data };
  }

  @Patch(':id/close')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Close support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async close(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.supportService.findOne(id);
    const data = await this.supportService.close(id, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      oldValue: { status: before.status },
      newValue: { status: 'CLOSED' },
    });
    return { success: true, message: 'Ticket closed', data };
  }

  @Patch(':id/reopen')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reopen closed or resolved ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async reopen(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.supportService.findOne(id);
    const data = await this.supportService.reopen(id, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      oldValue: { status: before.status },
      newValue: { status: 'OPEN' },
    });
    return { success: true, message: 'Ticket reopened', data };
  }
}
