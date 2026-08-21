import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminRole,
  NotificationType,
  Prisma,
  SupportMessageSenderType,
  SupportTicketHistoryAction,
  SupportTicketStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { NotificationService } from '../notification/notification.service';
import type { AuthenticatedAdmin } from '../../admin/auth/admin-jwt.strategy';
import {
  MarkMessagesReadResponseDto,
  SendSupportMessageDto,
  SupportConversationResponseDto,
  SupportConversationParticipantDto,
  SupportMessageListResponseDto,
  SupportMessageResponseDto,
  SupportUnreadCountResponseDto,
} from './dto/support-message.dto';

const messageInclude = {
  admin: { select: { fullName: true } },
  customer: { select: { fullName: true } },
} satisfies Prisma.SupportMessageInclude;

const ADMIN_SENDER_TYPES: SupportMessageSenderType[] = [
  SupportMessageSenderType.ADMIN,
  SupportMessageSenderType.CUSTOMER_EXECUTIVE,
];

export interface SendMessageContext {
  ticketId: string;
  senderType: SupportMessageSenderType;
  senderId: string;
  isInternal?: boolean;
}

@Injectable()
export class SupportMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  async sendMessage(
    ctx: SendMessageContext,
    dto: SendSupportMessageDto,
  ): Promise<SupportMessageResponseDto> {
    const ticket = await this.getActiveTicketOrThrow(ctx.ticketId);

    if (ctx.isInternal) {
      if (!ADMIN_SENDER_TYPES.includes(ctx.senderType)) {
        throw new ForbiddenException('Only admins can add internal notes');
      }
    } else if (ctx.senderType === SupportMessageSenderType.CUSTOMER) {
      if (ticket.status === SupportTicketStatus.CLOSED) {
        throw new BadRequestException('Cannot reply to a closed ticket');
      }
    } else if (
      ticket.status === SupportTicketStatus.CLOSED &&
      !ctx.isInternal
    ) {
      throw new BadRequestException('Cannot reply to a closed ticket');
    }

    const preview = dto.message.slice(0, 500);
    const now = new Date();
    const nextStatus = this.resolveStatusAfterMessage(
      ticket.status,
      ctx.senderType,
      ctx.isInternal ?? false,
    );

    const isCustomerMessage =
      ctx.senderType === SupportMessageSenderType.CUSTOMER;
    const isAdminMessage = ADMIN_SENDER_TYPES.includes(ctx.senderType);

    const adminId = isAdminMessage ? ctx.senderId : null;
    const customerId = isCustomerMessage ? ctx.senderId : null;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId: ctx.ticketId,
          senderType: ctx.senderType,
          senderId: ctx.senderId,
          message: dto.message,
          attachmentUrl: dto.attachmentUrl,
          attachmentType: dto.attachmentType,
          isInternal: ctx.isInternal ?? false,
          adminId,
          customerId,
        },
        include: messageInclude,
      });

      const ticketUpdate: Prisma.SupportTicketUpdateInput = {
        lastMessage: preview,
        lastMessageAt: now,
      };

      if (!ctx.isInternal) {
        if (isCustomerMessage) {
          ticketUpdate.unreadAdminCount = { increment: 1 };
        } else if (isAdminMessage) {
          ticketUpdate.unreadCustomerCount = { increment: 1 };
        }
        ticketUpdate.status = nextStatus;

        if (nextStatus === SupportTicketStatus.REOPENED) {
          ticketUpdate.resolvedAt = null;
          ticketUpdate.closedAt = null;
        } else if (nextStatus !== SupportTicketStatus.CLOSED) {
          ticketUpdate.resolvedAt = null;
          ticketUpdate.closedAt = null;
        }
      }

      await tx.supportTicket.update({
        where: { id: ctx.ticketId },
        data: ticketUpdate,
      });

      if (isAdminMessage && !ctx.isInternal) {
        await tx.supportTicketHistory.create({
          data: {
            ticketId: ctx.ticketId,
            action: SupportTicketHistoryAction.REPLIED,
            newValue: preview,
            adminId: ctx.senderId,
          },
        });
      } else if (ctx.isInternal) {
        await tx.supportTicketHistory.create({
          data: {
            ticketId: ctx.ticketId,
            action: SupportTicketHistoryAction.NOTE_ADDED,
            newValue: preview,
            adminId: ctx.senderId,
          },
        });
      } else if (isCustomerMessage) {
        await tx.supportTicketHistory.create({
          data: {
            ticketId: ctx.ticketId,
            action: SupportTicketHistoryAction.REPLIED,
            newValue: preview,
          },
        });
      }

      return created;
    });

    if (!ctx.isInternal) {
      if (isCustomerMessage) {
        await this.notifyAssignedExecutive(ticket, dto.message);
      } else if (isAdminMessage) {
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
      }
    }

    await this.cache.invalidateSupport(ticket.customerId);
    return this.mapMessage(message);
  }

  async getMessages(
    ticketId: string,
    page = 1,
    limit = 50,
    options: { includeInternal?: boolean; customerId?: string } = {},
  ): Promise<SupportMessageListResponseDto> {
    await this.assertTicketAccess(ticketId, options);

    const where: Prisma.SupportMessageWhereInput = {
      ticketId,
      ...(options.includeInternal ? {} : { isInternal: false }),
    };

    const [total, messages] = await this.prisma.$transaction([
      this.prisma.supportMessage.count({ where }),
      this.prisma.supportMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: messageInclude,
      }),
    ]);

    return {
      items: messages.map((m) => this.mapMessage(m)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getConversation(
    ticketId: string,
    page = 1,
    limit = 50,
    options: {
      includeInternal?: boolean;
      customerId?: string;
      admin?: AuthenticatedAdmin;
    } = {},
  ): Promise<SupportConversationResponseDto> {
    await this.assertTicketAccess(ticketId, {
      customerId: options.customerId,
      admin: options.admin,
    });

    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, deletedAt: null },
      include: {
        customer: { select: { id: true, fullName: true } },
        assignedExecutive: { select: { id: true, fullName: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    const messagesResult = await this.getMessages(ticketId, page, limit, {
      includeInternal: options.includeInternal,
      customerId: options.customerId,
    });

    const unreadCount = options.customerId
      ? ticket.unreadCustomerCount
      : ticket.unreadAdminCount;

    const participants = this.buildParticipants(ticket);

    return {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      reason: ticket.reason,
      subject: ticket.subject,
      lastMessage: ticket.lastMessage,
      lastMessageAt: ticket.lastMessageAt?.toISOString() ?? null,
      unreadCount,
      assignedExecutive: ticket.assignedExecutive
        ? {
            id: ticket.assignedExecutive.id,
            name: ticket.assignedExecutive.fullName,
            role: 'CUSTOMER_EXECUTIVE',
          }
        : null,
      participants,
      messages: messagesResult.items,
      meta: messagesResult.meta,
    };
  }

  async markMessagesRead(
    ticketId: string,
    reader: 'customer' | 'admin',
    options: { customerId?: string; admin?: AuthenticatedAdmin } = {},
  ): Promise<MarkMessagesReadResponseDto> {
    await this.assertTicketAccess(ticketId, options);

    const senderTypesToMark =
      reader === 'customer'
        ? ADMIN_SENDER_TYPES
        : [SupportMessageSenderType.CUSTOMER];

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportMessage.updateMany({
        where: {
          ticketId,
          isInternal: false,
          senderType: { in: senderTypesToMark },
          readAt: null,
        },
        data: { readAt: now },
      });

      const resetField =
        reader === 'customer'
          ? { unreadCustomerCount: 0 }
          : { unreadAdminCount: 0 };

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: resetField,
      });

      return updated.count;
    });

    const ticket = await this.getActiveTicketOrThrow(ticketId);
    const unreadCount =
      reader === 'customer'
        ? ticket.unreadCustomerCount
        : ticket.unreadAdminCount;

    if (options.customerId) {
      await this.cache.invalidateSupport(options.customerId);
    }

    return { markedCount: result, unreadCount };
  }

  async getUnreadCount(
    ticketId: string,
    reader: 'customer' | 'admin',
    options: { customerId?: string; admin?: AuthenticatedAdmin } = {},
  ): Promise<SupportUnreadCountResponseDto> {
    const ticket = await this.assertTicketAccess(ticketId, options);

    return {
      unreadCount:
        reader === 'customer'
          ? ticket.unreadCustomerCount
          : ticket.unreadAdminCount,
    };
  }

  async createInitialMessage(
    ticketId: string,
    customerId: string,
    message: string,
  ): Promise<void> {
    const preview = message.slice(0, 500);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          ticketId,
          senderType: SupportMessageSenderType.CUSTOMER,
          senderId: customerId,
          message,
          customerId,
        },
      }),
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          lastMessage: preview,
          lastMessageAt: now,
          unreadAdminCount: { increment: 1 },
        },
      }),
    ]);
  }

  resolveAdminSenderType(admin: AuthenticatedAdmin): SupportMessageSenderType {
    return admin.role === AdminRole.CUSTOMER_EXECUTIVE
      ? SupportMessageSenderType.CUSTOMER_EXECUTIVE
      : SupportMessageSenderType.ADMIN;
  }

  assertExecutiveAccess(
    ticket: { assignedExecutiveId: string | null },
    admin: AuthenticatedAdmin,
  ): void {
    if (admin.role === AdminRole.SUPER_ADMIN) return;

    if (admin.role === AdminRole.CUSTOMER_EXECUTIVE) {
      if (ticket.assignedExecutiveId !== admin.id) {
        throw new ForbiddenException(
          'You can only access tickets assigned to you',
        );
      }
    }
  }

  private resolveStatusAfterMessage(
    current: SupportTicketStatus,
    senderType: SupportMessageSenderType,
    isInternal: boolean,
  ): SupportTicketStatus {
    if (isInternal) return current;

    if (senderType === SupportMessageSenderType.CUSTOMER) {
      if (current === SupportTicketStatus.RESOLVED) {
        return SupportTicketStatus.REOPENED;
      }
      return SupportTicketStatus.WAITING_FOR_ADMIN;
    }

    if (ADMIN_SENDER_TYPES.includes(senderType)) {
      return SupportTicketStatus.WAITING_FOR_CUSTOMER;
    }

    return current;
  }

  private async notifyAssignedExecutive(
    ticket: {
      id: string;
      ticketNumber: string;
      customerId: string;
      assignedExecutiveId: string | null;
    },
    messageBody: string,
  ): Promise<void> {
    if (!ticket.assignedExecutiveId) return;

    // Admin inbox notifications are tracked via unreadAdminCount on the ticket.
    // Push/in-app admin notifications can be wired here when that module exists.
    void messageBody;
    void ticket;
  }

  private async getActiveTicketOrThrow(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, deletedAt: null },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    return ticket;
  }

  private async assertTicketAccess(
    ticketId: string,
    options: { customerId?: string; admin?: AuthenticatedAdmin } = {},
  ) {
    const ticket = await this.getActiveTicketOrThrow(ticketId);

    if (options.customerId && ticket.customerId !== options.customerId) {
      throw new NotFoundException('Support ticket not found');
    }

    if (options.admin) {
      if (options.admin.role === AdminRole.WAREHOUSE_MANAGER) {
        throw new ForbiddenException(
          'Warehouse managers cannot access support',
        );
      }
      this.assertExecutiveAccess(ticket, options.admin);
    }

    return ticket;
  }

  private buildParticipants(ticket: {
    customer: { id: string; fullName: string | null };
    assignedExecutive: { id: string; fullName: string } | null;
  }) {
    const participants: SupportConversationParticipantDto[] = [
      {
        id: ticket.customer.id,
        name: ticket.customer.fullName ?? 'Customer',
        role: 'CUSTOMER',
      },
    ];

    if (ticket.assignedExecutive) {
      participants.push({
        id: ticket.assignedExecutive.id,
        name: ticket.assignedExecutive.fullName,
        role: 'CUSTOMER_EXECUTIVE',
      });
    }

    return participants;
  }

  mapMessage(
    message: Prisma.SupportMessageGetPayload<{
      include: typeof messageInclude;
    }>,
  ): SupportMessageResponseDto {
    return {
      id: message.id,
      senderType: message.senderType,
      senderId: message.senderId,
      message: message.message,
      attachmentUrl: message.attachmentUrl,
      attachmentType: message.attachmentType,
      isInternal: message.isInternal,
      readAt: message.readAt?.toISOString() ?? null,
      adminName: message.admin?.fullName ?? null,
      customerName: message.customer?.fullName ?? null,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    };
  }
}
