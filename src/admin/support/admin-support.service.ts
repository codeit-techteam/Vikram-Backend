import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminRole,
  NotificationType,
  Prisma,
  SupportTicketHistoryAction,
  SupportTicketMessageSender,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { NotificationService } from '../../modules/notification/notification.service';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import type {
  AdminSupportNoteDto,
  AdminSupportQueryDto,
  AdminSupportReplyDto,
  AssignSupportExecutiveDto,
  SupportTicketDetailDto,
  SupportTicketListItemDto,
  SupportTicketListResponseDto,
  UpdateSupportPriorityDto,
  UpdateSupportStatusDto,
} from './dto/admin-support.dto';

const ticketInclude = {
  customer: { select: { id: true, phone: true, fullName: true } },
  order: { select: { orderNumber: true } },
  assignedExecutive: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.SupportTicketInclude;

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAll(query: AdminSupportQueryDto): Promise<SupportTicketListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, tickets] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: ticketInclude,
      }),
    ]);

    return {
      items: tickets.map((ticket) => this.mapListItem(ticket)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findOne(id: string): Promise<SupportTicketDetailDto> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...ticketInclude,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            admin: { select: { fullName: true } },
            customer: { select: { fullName: true } },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { admin: { select: { fullName: true } } },
        },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    return this.mapDetail(ticket);
  }

  async assignExecutive(
    id: string,
    dto: AssignSupportExecutiveDto,
    admin: AuthenticatedAdmin,
  ): Promise<SupportTicketDetailDto> {
    const ticket = await this.getTicketOrThrow(id);
    const executive = await this.prisma.adminUser.findFirst({
      where: {
        id: dto.executiveId,
        deletedAt: null,
        isActive: true,
        role: { in: [AdminRole.CUSTOMER_EXECUTIVE, AdminRole.SUPER_ADMIN] },
      },
    });

    if (!executive) {
      throw new NotFoundException('Executive not found or not eligible for assignment');
    }

    const oldExecutiveId = ticket.assignedExecutiveId;

    await this.prisma.$transaction([
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          assignedExecutiveId: dto.executiveId,
          status:
            ticket.status === SupportTicketStatus.OPEN
              ? SupportTicketStatus.ASSIGNED
              : ticket.status,
        },
      }),
      this.prisma.supportTicketHistory.create({
        data: {
          ticketId: id,
          action: SupportTicketHistoryAction.ASSIGNED,
          field: 'assignedExecutiveId',
          oldValue: oldExecutiveId,
          newValue: dto.executiveId,
          adminId: admin.id,
          adminEmail: admin.email,
        },
      }),
    ]);

    await this.invalidateCustomerCache(ticket.customerId);
    return this.findOne(id);
  }

  async reply(
    id: string,
    dto: AdminSupportReplyDto,
    admin: AuthenticatedAdmin,
  ): Promise<SupportTicketDetailDto> {
    const ticket = await this.getTicketOrThrow(id);

    if (
      ticket.status === SupportTicketStatus.CLOSED ||
      ticket.status === SupportTicketStatus.RESOLVED
    ) {
      throw new BadRequestException('Cannot reply to a closed or resolved ticket');
    }

    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId: id,
          senderType: SupportTicketMessageSender.ADMIN,
          adminId: admin.id,
          body: dto.message,
        },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          status:
            ticket.status === SupportTicketStatus.OPEN ||
            ticket.status === SupportTicketStatus.ASSIGNED
              ? SupportTicketStatus.IN_PROGRESS
              : ticket.status,
        },
      }),
      this.prisma.supportTicketHistory.create({
        data: {
          ticketId: id,
          action: SupportTicketHistoryAction.REPLIED,
          newValue: dto.message.slice(0, 500),
          adminId: admin.id,
          adminEmail: admin.email,
        },
      }),
    ]);

    await this.notificationService.createForCustomer({
      customerId: ticket.customerId,
      type: NotificationType.ADMIN_ANNOUNCEMENT,
      label: 'Support Ticket',
      title: `Update on ticket ${ticket.ticketNumber}`,
      body: dto.message.slice(0, 200),
      actionLabel: 'View Ticket',
      actionRoute: `/support/${ticket.id}`,
      actionVariant: 'primary',
    });

    await this.invalidateCustomerCache(ticket.customerId);
    return this.findOne(id);
  }

  async addInternalNote(
    id: string,
    dto: AdminSupportNoteDto,
    admin: AuthenticatedAdmin,
  ): Promise<SupportTicketDetailDto> {
    const ticket = await this.getTicketOrThrow(id);

    await this.prisma.$transaction([
      this.prisma.supportTicketNote.create({
        data: {
          ticketId: id,
          adminId: admin.id,
          body: dto.note,
        },
      }),
      this.prisma.supportTicketHistory.create({
        data: {
          ticketId: id,
          action: SupportTicketHistoryAction.NOTE_ADDED,
          newValue: dto.note.slice(0, 500),
          adminId: admin.id,
          adminEmail: admin.email,
        },
      }),
    ]);

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    dto: UpdateSupportStatusDto,
    admin: AuthenticatedAdmin,
  ): Promise<SupportTicketDetailDto> {
    const ticket = await this.getTicketOrThrow(id);
    this.assertValidStatusTransition(ticket.status, dto.status);

    const now = new Date();
    const data: Prisma.SupportTicketUpdateInput = { status: dto.status };

    if (dto.status === SupportTicketStatus.RESOLVED) {
      data.resolvedAt = now;
      data.closedAt = null;
    } else if (dto.status === SupportTicketStatus.CLOSED) {
      data.closedAt = now;
      data.resolvedAt = ticket.resolvedAt ?? now;
    } else if (
      dto.status === SupportTicketStatus.OPEN ||
      dto.status === SupportTicketStatus.ASSIGNED ||
      dto.status === SupportTicketStatus.IN_PROGRESS
    ) {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const historyAction = this.statusHistoryAction(dto.status);

    await this.prisma.$transaction([
      this.prisma.supportTicket.update({ where: { id }, data }),
      this.prisma.supportTicketHistory.create({
        data: {
          ticketId: id,
          action: historyAction,
          field: 'status',
          oldValue: ticket.status,
          newValue: dto.remark
            ? `${dto.status} — ${dto.remark}`
            : dto.status,
          adminId: admin.id,
          adminEmail: admin.email,
        },
      }),
    ]);

    if (
      dto.status === SupportTicketStatus.RESOLVED ||
      dto.status === SupportTicketStatus.CLOSED
    ) {
      await this.notificationService.createForCustomer({
        customerId: ticket.customerId,
        type: NotificationType.ADMIN_ANNOUNCEMENT,
        label: 'Support Ticket',
        title: `Ticket ${ticket.ticketNumber} ${dto.status.toLowerCase().replace('_', ' ')}`,
        body: dto.remark ?? 'Your support ticket has been updated.',
        actionLabel: 'View Ticket',
        actionRoute: `/support/${ticket.id}`,
        actionVariant: 'primary',
      });
    }

    await this.invalidateCustomerCache(ticket.customerId);
    return this.findOne(id);
  }

  async updatePriority(
    id: string,
    dto: UpdateSupportPriorityDto,
    admin: AuthenticatedAdmin,
  ): Promise<SupportTicketDetailDto> {
    const ticket = await this.getTicketOrThrow(id);

    await this.prisma.$transaction([
      this.prisma.supportTicket.update({
        where: { id },
        data: { priority: dto.priority },
      }),
      this.prisma.supportTicketHistory.create({
        data: {
          ticketId: id,
          action: SupportTicketHistoryAction.PRIORITY_CHANGED,
          field: 'priority',
          oldValue: ticket.priority,
          newValue: dto.priority,
          adminId: admin.id,
          adminEmail: admin.email,
        },
      }),
    ]);

    return this.findOne(id);
  }

  async close(id: string, admin: AuthenticatedAdmin): Promise<SupportTicketDetailDto> {
    return this.updateStatus(
      id,
      { status: SupportTicketStatus.CLOSED },
      admin,
    );
  }

  async reopen(id: string, admin: AuthenticatedAdmin): Promise<SupportTicketDetailDto> {
    const ticket = await this.getTicketOrThrow(id);

    if (
      ticket.status !== SupportTicketStatus.CLOSED &&
      ticket.status !== SupportTicketStatus.RESOLVED
    ) {
      throw new BadRequestException('Only closed or resolved tickets can be reopened');
    }

    await this.prisma.$transaction([
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          status: SupportTicketStatus.OPEN,
          resolvedAt: null,
          closedAt: null,
        },
      }),
      this.prisma.supportTicketHistory.create({
        data: {
          ticketId: id,
          action: SupportTicketHistoryAction.REOPENED,
          field: 'status',
          oldValue: ticket.status,
          newValue: SupportTicketStatus.OPEN,
          adminId: admin.id,
          adminEmail: admin.email,
        },
      }),
    ]);

    await this.invalidateCustomerCache(ticket.customerId);
    return this.findOne(id);
  }

  private buildWhere(query: AdminSupportQueryDto): Prisma.SupportTicketWhereInput {
    const where: Prisma.SupportTicketWhereInput = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.executiveId) where.assignedExecutiveId = query.executiveId;
    if (query.customerId) where.customerId = query.customerId;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { ticketNumber: { contains: term, mode: 'insensitive' } },
        { subject: { contains: term, mode: 'insensitive' } },
        { customer: { phone: { contains: term } } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private async getTicketOrThrow(id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, deletedAt: null },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    return ticket;
  }

  private assertValidStatusTransition(
    current: SupportTicketStatus,
    next: SupportTicketStatus,
  ): void {
    if (current === next) return;

    if (
      current === SupportTicketStatus.CLOSED &&
      next !== SupportTicketStatus.OPEN
    ) {
      throw new BadRequestException(
        'Closed tickets must be reopened before other status changes',
      );
    }
  }

  private statusHistoryAction(
    status: SupportTicketStatus,
  ): SupportTicketHistoryAction {
    if (status === SupportTicketStatus.RESOLVED) {
      return SupportTicketHistoryAction.RESOLVED;
    }
    if (status === SupportTicketStatus.CLOSED) {
      return SupportTicketHistoryAction.CLOSED;
    }
    return SupportTicketHistoryAction.STATUS_CHANGED;
  }

  private async invalidateCustomerCache(customerId: string): Promise<void> {
    await this.cache.invalidateSupport(customerId);
  }

  private mapListItem(
    ticket: Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>,
  ): SupportTicketListItemDto {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      reason: ticket.reason,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      orderId: ticket.orderId,
      orderNumber: ticket.order?.orderNumber ?? null,
      customer: {
        id: ticket.customer.id,
        fullName: ticket.customer.fullName,
        phone: ticket.customer.phone,
      },
      assignedExecutive: ticket.assignedExecutive
        ? {
            id: ticket.assignedExecutive.id,
            fullName: ticket.assignedExecutive.fullName,
            email: ticket.assignedExecutive.email,
          }
        : null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }

  private mapDetail(
    ticket: Prisma.SupportTicketGetPayload<{
      include: typeof ticketInclude & {
        messages: {
          include: {
            admin: { select: { fullName: true } };
            customer: { select: { fullName: true } };
          };
        };
        notes: { include: { admin: { select: { fullName: true } } } };
        history: true;
      };
    }>,
  ): SupportTicketDetailDto {
    return {
      ...this.mapListItem(ticket),
      description: ticket.description,
      messages: ticket.messages.map((message) => ({
        id: message.id,
        senderType: message.senderType,
        body: message.body,
        adminName: message.admin?.fullName ?? null,
        customerName: message.customer?.fullName ?? null,
        createdAt: message.createdAt.toISOString(),
      })),
      notes: ticket.notes.map((note) => ({
        id: note.id,
        body: note.body,
        adminName: note.admin.fullName,
        createdAt: note.createdAt.toISOString(),
      })),
      history: ticket.history.map((entry) => ({
        id: entry.id,
        action: entry.action,
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        adminEmail: entry.adminEmail,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }
}
