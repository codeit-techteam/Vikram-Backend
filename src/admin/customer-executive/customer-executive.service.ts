import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  PaymentStatus,
  SupportTicketStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationService } from '../../modules/notification/notification.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { AdminBulkService } from '../bulk/admin-bulk.service';
import { AdminCustomersService } from '../customers/admin-customers.service';
import { AdminEmergencyService } from '../emergency/admin-emergency.service';
import { AdminLoyaltyService } from '../loyalty/admin-loyalty.service';
import { AdminMembershipService } from '../membership/admin-membership.service';
import { AdminOrdersService } from '../orders/admin-orders.service';
import { AdminWalletService } from '../wallet/admin-wallet.service';
import type {
  CeBulkStatusDto,
  CeCancelOrderDto,
  CeCreateOrderDto,
  CeCreateTicketDto,
  CeCustomerSearchQueryDto,
  CeEmergencyStatusDto,
  CePaginationQueryDto,
  CePaymentReminderDto,
  CeRenewMembershipDto,
  CeSendPaymentLinkDto,
  CeUpdateCustomerNoteDto,
  CeUpdateOrderAddressDto,
  CeUpdateOrderPaymentDto,
  CeUpdateTicketDto,
} from './dto/customer-executive.dto';

@Injectable()
export class CustomerExecutiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: AdminCustomersService,
    private readonly ordersService: AdminOrdersService,
    private readonly walletService: AdminWalletService,
    private readonly membershipService: AdminMembershipService,
    private readonly loyaltyService: AdminLoyaltyService,
    private readonly bulkService: AdminBulkService,
    private readonly emergencyService: AdminEmergencyService,
    private readonly customerOrdersService: OrdersService,
    private readonly notificationService: NotificationService,
  ) {}

  async getDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      todayOrders,
      pendingOrders,
      pendingPayments,
      emergencyOrders,
      bulkEnquiries,
      openTickets,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { createdAt: { gte: todayStart }, deletedAt: null },
      }),
      this.prisma.order.count({
        where: {
          orderStatus: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
          deletedAt: null,
        },
      }),
      this.prisma.order.count({
        where: { paymentStatus: PaymentStatus.PENDING, deletedAt: null },
      }),
      this.prisma.emergencyOrder.count({
        where: { status: { in: ['NEW', 'APPROVED', 'ASSIGNED'] } },
      }),
      this.prisma.bulkEnquiry.count({
        where: { status: { in: ['NEW', 'IN_PROGRESS'] } },
      }),
      this.prisma.supportTicket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, deletedAt: null },
      }),
    ]);

    return {
      todayOrders,
      pendingOrders,
      pendingPayments,
      emergencyOrders,
      bulkEnquiries,
      customerIssues: openTickets,
      customersHelped: todayOrders,
    };
  }

  async findCustomers(query: CeCustomerSearchQueryDto) {
    return this.customersService.findAll({
      page: query.page,
      limit: query.limit,
      search: query.q,
    });
  }

  async searchCustomers(query: CeCustomerSearchQueryDto) {
    return this.findCustomers(query);
  }

  async findCustomer(id: string) {
    return this.customersService.findOne(id);
  }

  async updateCustomerNote(id: string, dto: CeUpdateCustomerNoteDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: { profile: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer.profile) {
      return this.prisma.customerProfile.update({
        where: { customerId: id },
        data: { adminNotes: dto.note },
      });
    }

    return this.prisma.customerProfile.create({
      data: { customerId: id, adminNotes: dto.note },
    });
  }

  async getCustomerWallet(customerId: string) {
    return this.walletService.findWalletByCustomer(customerId);
  }

  async getCustomerWalletHistory(customerId: string, query: CePaginationQueryDto) {
    return this.walletService.getWalletHistory({
      page: query.page,
      limit: query.limit,
      customerId,
    });
  }

  async getCustomerMembership(customerId: string) {
    const membership = await this.prisma.customerMembership.findFirst({
      where: { customerId, status: 'ACTIVE' },
      include: { plan: true, customer: { select: { id: true, phone: true, fullName: true } } },
      orderBy: { expiryDate: 'desc' },
    });
    if (!membership) throw new NotFoundException('Active membership not found');
    return membership;
  }

  async renewCustomerMembership(customerId: string, dto: CeRenewMembershipDto) {
    const membership = await this.prisma.customerMembership.findFirst({
      where: { customerId, status: 'ACTIVE' },
      orderBy: { expiryDate: 'desc' },
    });
    if (!membership) throw new NotFoundException('Active membership not found');

    if (dto.planId && dto.planId !== membership.planId) {
      throw new BadRequestException('Plan change not supported via customer executive renew');
    }

    return this.membershipService.renewMembership(membership.id);
  }

  async getCustomerLoyalty(customerId: string) {
    return this.loyaltyService.findByCustomer(customerId);
  }

  async getCustomerLoyaltyHistory(customerId: string, query: CePaginationQueryDto) {
    const account = await this.loyaltyService.findByCustomer(customerId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where: { accountId: account.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loyaltyTransaction.count({ where: { accountId: account.id } }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOrders(query: CePaginationQueryDto & { customerId?: string }) {
    return this.ordersService.findAll({
      page: query.page,
      limit: query.limit,
      customerId: query.customerId,
    });
  }

  async findOrder(id: string) {
    return this.ordersService.findOne(id);
  }

  async createOrder(dto: CeCreateOrderDto, executiveId: string) {
    const order = await this.customerOrdersService.placeOrder(dto.customerId, {
      addressId: dto.addressId,
      paymentMethod: dto.paymentMethod as 'CASH' | 'MANUAL' | undefined,
      notes: dto.notes,
    });

    await this.prisma.orderTimeline.create({
      data: {
        orderId: order.id,
        status: OrderStatus.CONFIRMED,
        remarks: `Order placed by customer executive (${executiveId})`,
        updatedBy: executiveId,
      },
    });

    return order;
  }

  async cancelOrder(id: string, dto: CeCancelOrderDto, executiveId: string) {
    const order = await this.ordersService.findOne(id);
    if (!['PENDING', 'CONFIRMED'].includes(order.orderStatus)) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }
    return this.ordersService.cancelOrder(
      id,
      { reason: dto.reason ?? 'Cancelled by customer executive' },
      executiveId,
    );
  }

  async updateOrderAddress(id: string, dto: CeUpdateOrderAddressDto) {
    const order = await this.ordersService.findOne(id);
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, customerId: order.customerId, deletedAt: null },
    });
    if (!address) throw new NotFoundException('Address not found for customer');

    return this.prisma.order.update({
      where: { id },
      data: {
        addressId: dto.addressId,
        deliveryAddress: {
          id: address.id,
          label: address.label,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          latitude: address.latitude,
          longitude: address.longitude,
        },
      },
    });
  }

  async updateOrderPayment(id: string, dto: CeUpdateOrderPaymentDto) {
    await this.ordersService.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: { paymentMethod: dto.paymentMethod as never },
    });
  }

  async getOrderTracking(id: string) {
    const order = await this.ordersService.findOne(id);
    const timeline = await this.ordersService.getTimeline(id);
    return { order, timeline };
  }

  async findBulkEnquiries(query: CePaginationQueryDto) {
    return this.bulkService.findAll({ page: query.page, limit: query.limit });
  }

  async findBulkEnquiry(id: string) {
    return this.bulkService.findOne(id);
  }

  async updateBulkStatus(id: string, dto: CeBulkStatusDto) {
    return this.bulkService.updateStatus(id, {
      status: dto.status,
      remarks: dto.remarks,
    });
  }

  async findEmergencyOrders(query: CePaginationQueryDto) {
    return this.emergencyService.findAll({ page: query.page, limit: query.limit });
  }

  async findEmergencyOrder(id: string) {
    return this.emergencyService.findOne(id);
  }

  async updateEmergencyStatus(id: string, dto: CeEmergencyStatusDto) {
    const status = dto.status.toUpperCase();
    if (status === 'APPROVED') return this.emergencyService.approve(id);
    if (status === 'REJECTED') return this.emergencyService.reject(id);
    throw new BadRequestException(`Unsupported emergency status: ${dto.status}`);
  }

  async sendPaymentLink(dto: CeSendPaymentLinkDto) {
    const order = await this.ordersService.findOne(dto.orderId);
    const paymentUrl = `https://pay.bajriwala.com/order/${order.id}`;

    await this.notificationService.createForCustomer({
      customerId: order.customerId,
      type: NotificationType.PAYMENT,
      label: 'Payment Link',
      title: `Payment pending for order ${order.orderNumber}`,
      body: dto.message ?? 'Please complete your payment using the link below.',
      actionLabel: 'Pay Now',
      actionRoute: paymentUrl,
      actionVariant: 'primary',
    });

    return { orderId: order.id, orderNumber: order.orderNumber, paymentUrl, sent: true };
  }

  async sendPaymentReminder(dto: CePaymentReminderDto) {
    const order = await this.ordersService.findOne(dto.orderId);
    if (order.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException('Order payment is not pending');
    }

    await this.notificationService.createForCustomer({
      customerId: order.customerId,
      type: NotificationType.PAYMENT,
      label: 'Payment Reminder',
      title: `Reminder: Payment pending for ${order.orderNumber}`,
      body: 'Your order is awaiting payment. Please complete payment to proceed.',
      actionLabel: 'Pay Now',
      actionRoute: `https://pay.bajriwala.com/order/${order.id}`,
      actionVariant: 'primary',
    });

    return { orderId: order.id, reminded: true };
  }

  async createTicket(dto: CeCreateTicketDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const year = new Date().getFullYear();
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
    const ticketNumber = `TKT-${year}-${String(next).padStart(6, '0')}`;

    return this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        customerId: dto.customerId,
        orderId: dto.orderId,
        reason: dto.reason,
        subject: dto.subject,
        description: dto.description,
      },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        order: { select: { orderNumber: true } },
      },
    });
  }

  async findTickets(query: CePaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async updateTicket(id: string, dto: CeUpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, deletedAt: null },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');

    const status = dto.status ?? ticket.status;
    const resolvedAt =
      status === SupportTicketStatus.RESOLVED || status === SupportTicketStatus.CLOSED
        ? new Date()
        : ticket.resolvedAt;

    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        resolvedAt,
        ...(dto.resolution && {
          description: `${ticket.description}\n\n--- Resolution ---\n${dto.resolution}`,
        }),
      },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        order: { select: { orderNumber: true } },
      },
    });
  }
}
