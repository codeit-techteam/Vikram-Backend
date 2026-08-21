import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  SupportMessageSenderType,
  SupportTicketHistoryAction,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { NotificationService } from '../notification/notification.service';
import {
  CreateSupportTicketDto,
  SupportTicketListResponseDto,
  SupportTicketResponseDto,
} from './dto/support.dto';
import { SupportMessageService } from './support-message.service';
import type { SendSupportMessageDto } from './dto/support-message.dto';
import {
  MarkMessagesReadResponseDto,
  SupportConversationResponseDto,
  SupportMessageListResponseDto,
  SupportUnreadCountResponseDto,
} from './dto/support-message.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly messageService: SupportMessageService,
  ) {}

  async create(
    customerId: string,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicketResponseDto> {
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
    }

    const year = new Date().getFullYear();
    const ticketNumber = await this.nextTicketNumber(year);

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          customerId,
          orderId: dto.orderId,
          reason: dto.reason,
          subject: dto.subject,
          description: dto.description,
          lastMessage: dto.description.slice(0, 500),
          lastMessageAt: new Date(),
          unreadAdminCount: 1,
          history: {
            create: {
              action: SupportTicketHistoryAction.CREATED,
              field: 'status',
              newValue: 'OPEN',
            },
          },
        },
        include: {
          order: { select: { orderNumber: true } },
        },
      });

      await tx.supportMessage.create({
        data: {
          ticketId: created.id,
          senderType: SupportMessageSenderType.CUSTOMER,
          senderId: customerId,
          message: dto.description,
          customerId,
        },
      });

      return created;
    });

    await this.notificationService.createForCustomer({
      customerId,
      type: NotificationType.ADMIN_ANNOUNCEMENT,
      label: 'Support Ticket',
      title: `Ticket ${ticket.ticketNumber} created`,
      body: 'Our team will review your request shortly.',
      actionLabel: 'View Ticket',
      actionRoute: `/support/${ticket.id}`,
      actionVariant: 'primary',
    });

    await this.cache.invalidateSupport(customerId);

    return this.mapTicket(ticket);
  }

  async findAll(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<SupportTicketListResponseDto> {
    const cacheKey = CACHE_KEYS.SUPPORT(customerId) + `:list:${page}:${limit}`;
    const cached = await this.cache.get<SupportTicketListResponseDto>(cacheKey);
    if (cached) return cached;

    const where: Prisma.SupportTicketWhereInput = {
      customerId,
      deletedAt: null,
    };

    const [total, tickets] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: { select: { orderNumber: true } },
          assignedExecutive: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const result: SupportTicketListResponseDto = {
      items: tickets.map((t) => this.mapTicket(t)),
      meta: buildPaginationMeta(page, limit, total),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.SUPPORT);
    return result;
  }

  async findOne(
    customerId: string,
    ticketId: string,
  ): Promise<SupportTicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, customerId, deletedAt: null },
      include: {
        order: { select: { orderNumber: true } },
        assignedExecutive: { select: { id: true, fullName: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    await this.messageService.markMessagesRead(ticketId, 'customer', {
      customerId,
    });

    return this.mapTicket(ticket);
  }

  async sendMessage(
    customerId: string,
    ticketId: string,
    dto: SendSupportMessageDto,
  ) {
    return this.messageService.sendMessage(
      {
        ticketId,
        senderType: SupportMessageSenderType.CUSTOMER,
        senderId: customerId,
      },
      dto,
    );
  }

  async getMessages(
    customerId: string,
    ticketId: string,
    page = 1,
    limit = 50,
  ): Promise<SupportMessageListResponseDto> {
    return this.messageService.getMessages(ticketId, page, limit, {
      customerId,
    });
  }

  async getConversation(
    customerId: string,
    ticketId: string,
    page = 1,
    limit = 50,
  ): Promise<SupportConversationResponseDto> {
    const conversation = await this.messageService.getConversation(
      ticketId,
      page,
      limit,
      { customerId },
    );

    await this.messageService.markMessagesRead(ticketId, 'customer', {
      customerId,
    });

    return conversation;
  }

  async markMessagesRead(
    customerId: string,
    ticketId: string,
  ): Promise<MarkMessagesReadResponseDto> {
    return this.messageService.markMessagesRead(ticketId, 'customer', {
      customerId,
    });
  }

  async getUnreadCount(
    customerId: string,
    ticketId: string,
  ): Promise<SupportUnreadCountResponseDto> {
    return this.messageService.getUnreadCount(ticketId, 'customer', {
      customerId,
    });
  }

  private async nextTicketNumber(year: number): Promise<string> {
    const last = await this.prisma.supportTicket.findFirst({
      where: { ticketNumber: { startsWith: `TKT-${year}-` } },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });

    let next = 1;
    if (last) {
      const n = parseInt(last.ticketNumber.split('-')[2] ?? '0', 10);
      next = Number.isFinite(n) ? n + 1 : 1;
    }

    return `TKT-${year}-${String(next).padStart(6, '0')}`;
  }

  private mapTicket(ticket: {
    id: string;
    ticketNumber: string;
    orderId: string | null;
    reason: SupportTicketResponseDto['reason'];
    subject: string | null;
    description: string;
    status: SupportTicketResponseDto['status'];
    priority: SupportTicketResponseDto['priority'];
    resolvedAt: Date | null;
    closedAt: Date | null;
    lastMessage: string | null;
    lastMessageAt: Date | null;
    unreadCustomerCount: number;
    unreadAdminCount: number;
    createdAt: Date;
    updatedAt: Date;
    order?: { orderNumber: string } | null;
    assignedExecutive?: { id: string; fullName: string } | null;
  }): SupportTicketResponseDto {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      orderId: ticket.orderId,
      orderNumber: ticket.order?.orderNumber ?? null,
      reason: ticket.reason,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      assignedExecutiveName: ticket.assignedExecutive?.fullName ?? null,
      lastMessage: ticket.lastMessage,
      lastMessageAt: ticket.lastMessageAt?.toISOString() ?? null,
      unreadCount: ticket.unreadCustomerCount,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }
}
