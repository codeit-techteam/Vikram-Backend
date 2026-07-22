import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { ApiAdminRoles } from '../decorators/api-admin-roles.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import {
  AddInternalNoteDto,
  MarkMessagesReadResponseDto,
  SendSupportMessageDto,
  SupportConversationResponseDto,
  SupportMessageResponseDto,
  SupportUnreadCountResponseDto,
} from '../../modules/support/dto/support-message.dto';
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

class AdminMessageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

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
      'Paginated ticket list with filters. Customer executives only see assigned tickets. Search includes ticket number, customer name, subject, and message content.',
  })
  @ApiResponse({ status: 200, type: SupportTicketListResponseDto })
  async findAll(
    @Query() query: AdminSupportQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.findAll(query, admin);
    return { success: true, message: 'Support tickets fetched', data };
  }

  @Get(':id/unread-count')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Get unread message count',
    description: 'Returns unread customer messages for this ticket.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportUnreadCountResponseDto })
  async getUnreadCount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.getUnreadCount(id, admin);
    return { success: true, message: 'Unread count fetched', data };
  }

  @Get(':id/messages')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Get ticket conversation',
    description:
      'Returns ticket info, participants, and paginated messages (oldest first). Marks customer messages as read.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: SupportConversationResponseDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminMessageQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.getMessages(
      id,
      query.page ?? 1,
      query.limit ?? 50,
      admin,
    );
    return { success: true, message: 'Conversation fetched', data };
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Reply to support ticket',
    description:
      'Posts a public admin/executive reply. Sets status to WAITING_FOR_CUSTOMER and notifies the customer.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 201, type: SupportMessageResponseDto })
  @ApiResponse({ status: 400, description: 'Ticket is closed', type: ApiErrorResponseDto })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendSupportMessageDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.sendMessage(id, dto, admin);
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

  @Patch(':id/messages/read')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Mark customer messages as read',
    description: 'Marks all unread customer messages as read when admin opens the ticket.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: MarkMessagesReadResponseDto })
  async markMessagesRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.markMessagesRead(id, admin);
    return { success: true, message: 'Messages marked as read', data };
  }

  @Post(':id/internal-note')
  @HttpCode(HttpStatus.CREATED)
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Add internal note',
    description:
      'Adds an internal note visible only to admins and customer executives. Never visible to customers.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 201, type: SupportTicketDetailDto })
  async addInternalNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddInternalNoteDto,
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

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Get support ticket details',
    description:
      'Returns ticket details with messages, internal notes, and history. Marks customer messages as read.',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async findOne(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.supportService.findOne(id, admin);
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
    summary: 'Reply to support ticket (legacy)',
    description:
      'Deprecated — use POST /admin/support/:id/messages. Posts a public admin reply visible to the customer.',
    deprecated: true,
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
    summary: 'Add internal note (legacy)',
    description:
      'Deprecated — use POST /admin/support/:id/internal-note. Adds an internal note visible only to admins.',
    deprecated: true,
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
      'Updates ticket status (OPEN, ASSIGNED, IN_PROGRESS, WAITING_FOR_CUSTOMER, WAITING_FOR_ADMIN, RESOLVED, CLOSED, REOPENED).',
  })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketDetailDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupportStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.supportService.findOne(id, admin);
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
    const before = await this.supportService.findOne(id, admin);
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
    const before = await this.supportService.findOne(id, admin);
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
    const before = await this.supportService.findOne(id, admin);
    const data = await this.supportService.reopen(id, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'SupportTicket',
      resourceId: id,
      oldValue: { status: before.status },
      newValue: { status: 'REOPENED' },
    });
    return { success: true, message: 'Ticket reopened', data };
  }
}
