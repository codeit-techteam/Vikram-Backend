import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  AdminRole,
  AuditAction,
  BulkEnquiryStatus,
  ExpertCallbackStatus,
  LoyaltyTier,
  NotificationType,
  OrderStatus,
  PaymentLinkStatus,
  PaymentStatus,
  Prisma,
  RegistrationSource,
  SupportTicketStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/database/redis.service';
import {
  isValidIndianMobile,
  normalizePhone,
} from '../../common/utils/phone.util';
import { NotificationService } from '../../modules/notification/notification.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { CartService } from '../../modules/cart/cart.service';
import { OtpService } from '../../auth/otp/otp.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AdminBulkService } from '../bulk/admin-bulk.service';
import { AdminCustomersService } from '../customers/admin-customers.service';
import { AdminEmergencyService } from '../emergency/admin-emergency.service';
import { AdminLoyaltyService } from '../loyalty/admin-loyalty.service';
import { AdminMembershipService } from '../membership/admin-membership.service';
import { AdminOrdersService } from '../orders/admin-orders.service';
import { LoyaltyTransactionService } from '../../modules/loyalty/loyalty-transaction.service';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
import { DeliveryBenefitService } from '../../modules/delivery/delivery-benefit.service';
import {
  BULK_CANCELLED_STATUSES,
  BULK_COMPLETED_STATUSES,
  BULK_IN_PROGRESS_STATUSES,
  BULK_QUOTED_PIPELINE_STATUSES,
  BULK_TERMINAL_STATUSES,
  decimalToNumber,
  optionalDecimalToNumber,
} from '../../modules/bulk/bulk.constants';
import type {
  CeBulkAssignDto,
  CeBulkConvertDto,
  CeBulkFollowUpDto,
  CeBulkFollowUpStatusDto,
  CeBulkNoteDto,
  CeBulkQueryDto,
  CeBulkQuotationDto,
  CeBulkQuotationStatusDto,
  CeBulkRejectDto,
  CeBulkStatusDto,
  CeCancelOrderDto,
  CeCreateOrderDto,
  CeCreateTicketDto,
  CeCustomerSearchQueryDto,
  CeEmergencyStatusDto,
  CeExpertCallbackQueryDto,
  CeLookupCustomerDto,
  CeOrdersQueryDto,
  CePaginationQueryDto,
  CePaymentQueryDto,
  CePaymentReminderDto,
  CeRegisterCustomerDto,
  CeRenewMembershipDto,
  CeSendOtpDto,
  CeSendPaymentLinkDto,
  CeTicketQueryDto,
  CeTrackingSearchQueryDto,
  CeUpdateCustomerDto,
  CeUpdateCustomerNoteDto,
  CeUpdateExpertCallbackDto,
  CeUpdateOrderAddressDto,
  CeUpdateOrderPaymentDto,
  CeUpdateTicketDto,
  CeVerifyOtpDto,
} from './dto/customer-executive.dto';

const CE_REG_VERIFIED_PREFIX = 'ce:reg:verified:';
const CE_REG_VERIFIED_TTL_SECONDS = 900;

type RecentActivity = {
  id: string;
  type: string;
  title: string;
  description: string;
  customerId?: string;
  orderId?: string;
  createdAt: Date;
};

@Injectable()
export class CustomerExecutiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: AdminCustomersService,
    private readonly ordersService: AdminOrdersService,
    private readonly membershipService: AdminMembershipService,
    private readonly loyaltyService: AdminLoyaltyService,
    private readonly bulkService: AdminBulkService,
    private readonly emergencyService: AdminEmergencyService,
    private readonly customerOrdersService: OrdersService,
    private readonly notificationService: NotificationService,
    private readonly otpService: OtpService,
    private readonly cartService: CartService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
    private readonly deliveryBenefitService: DeliveryBenefitService,
  ) {}

  private isSuperAdmin(admin: AuthenticatedAdmin): boolean {
    return admin.role === AdminRole.SUPER_ADMIN;
  }

  private assignedWhere(
    admin: AuthenticatedAdmin,
  ): Prisma.CustomerWhereInput {
    if (this.isSuperAdmin(admin)) return {};
    return { assignedExecutiveId: admin.id };
  }

  private async scopeCustomerIds(
    admin: AuthenticatedAdmin,
  ): Promise<string[] | null> {
    if (this.isSuperAdmin(admin)) return null;
    const rows = await this.prisma.customer.findMany({
      where: { deletedAt: null, assignedExecutiveId: admin.id },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertCustomerAccess(
    customerId: string,
    admin: AuthenticatedAdmin,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (this.isSuperAdmin(admin)) return customer;

    // Allow CE to access unassigned customers (e.g. phone lookup → place order).
    if (
      customer.assignedExecutiveId &&
      customer.assignedExecutiveId !== admin.id
    ) {
      throw new ForbiddenException('You do not have access to this customer');
    }
    return customer;
  }

  private async assertOrderAccess(orderId: string, admin: AuthenticatedAdmin) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        customer: {
          select: { id: true, assignedExecutiveId: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      !this.isSuperAdmin(admin) &&
      order.customer.assignedExecutiveId !== admin.id
    ) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return order;
  }

  private mapCustomerTypeSlug(input?: string): string | undefined {
    if (!input?.trim()) return undefined;
    const upper = input.trim().toUpperCase().replace(/-/g, '_');
    const slugMap: Record<string, string> = {
      CONTRACTOR: 'contractor',
      BUILDER: 'builder',
      INDIVIDUAL: 'individual',
      ARCHITECT: 'interior-designer',
      DEALER: 'contractor',
      INTERIOR_DESIGNER: 'interior-designer',
    };
    if (slugMap[upper]) return slugMap[upper];
    return input.trim().toLowerCase().replace(/_/g, '-');
  }

  private async resolveRoleId(customerType?: string): Promise<string | null> {
    const slug = this.mapCustomerTypeSlug(customerType);
    if (!slug) return null;
    const role = await this.prisma.role.findFirst({
      where: { slug, isActive: true },
    });
    return role?.id ?? null;
  }

  private async buildOrderCustomerScope(
    admin: AuthenticatedAdmin,
  ): Promise<Prisma.OrderWhereInput> {
    const ids = await this.scopeCustomerIds(admin);
    if (ids === null) return {};
    return { customerId: { in: ids } };
  }

  private buildPaymentUrl(publicToken: string): string {
    const base =
      this.configService.get<string>('payment.linkBaseUrl') ??
      'https://pay.bajriwala.com';
    return `${base.replace(/\/$/, '')}/p/${publicToken}`;
  }

  async getDashboard(admin: AuthenticatedAdmin) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const customerScope = this.assignedWhere(admin);
    const customerWhere: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...customerScope,
    };
    const scopedCustomerIds = await this.scopeCustomerIds(admin);
    const orderCustomerFilter =
      scopedCustomerIds === null
        ? {}
        : { customerId: { in: scopedCustomerIds } };

    const pendingStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.HUB_ASSIGNED,
      OrderStatus.AWAITING_HUB_ALLOCATION,
    ];

    const openTicketStatuses: SupportTicketStatus[] = [
      SupportTicketStatus.OPEN,
      SupportTicketStatus.ASSIGNED,
      SupportTicketStatus.IN_PROGRESS,
      SupportTicketStatus.WAITING_FOR_ADMIN,
      SupportTicketStatus.WAITING_FOR_CUSTOMER,
      SupportTicketStatus.REOPENED,
    ];

    const ticketWhere: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
      status: { in: openTicketStatuses },
      ...(scopedCustomerIds !== null && {
        customerId: { in: scopedCustomerIds },
      }),
    };

    const [
      assignedCustomers,
      openComplaints,
      pendingPaymentsAgg,
      todayOrders,
      pendingOrders,
      processingOrders,
      readyToDispatch,
      completedOrders,
      cancelledOrders,
      emergencyOrders,
      bulkEnquiries,
      customersHelped,
      resolvedTickets,
      recentOrders,
      recentTickets,
      recentRegistrations,
    ] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere }),
      this.prisma.supportTicket.count({ where: ticketWhere }),
      this.prisma.order.aggregate({
        where: {
          deletedAt: null,
          paymentStatus: PaymentStatus.PENDING,
          ...orderCustomerFilter,
        },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          createdAt: { gte: todayStart },
          ...orderCustomerFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: { in: pendingStatuses },
          ...orderCustomerFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: { in: [OrderStatus.PROCESSING, OrderStatus.PACKED] },
          ...orderCustomerFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.READY_FOR_DISPATCH,
          ...orderCustomerFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.DELIVERED,
          ...orderCustomerFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.CANCELLED,
          ...orderCustomerFilter,
        },
      }),
      this.prisma.emergencyOrder.count({
        where: {
          status: { in: ['NEW', 'APPROVED', 'ASSIGNED'] },
          ...(scopedCustomerIds !== null && {
            customerId: { in: scopedCustomerIds },
          }),
        },
      }),
      this.prisma.bulkEnquiry.count({
        where: {
          status: { in: ['NEW', 'IN_PROGRESS'] },
          ...(scopedCustomerIds !== null && {
            customerId: { in: scopedCustomerIds },
          }),
        },
      }),
      this.prisma.customer.count({
        where: {
          deletedAt: null,
          createdAt: { gte: todayStart },
          OR: [
            { registeredByUserId: admin.id },
            ...(scopedCustomerIds !== null
              ? [{ assignedExecutiveId: admin.id }]
              : []),
          ],
        },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          deletedAt: null,
          resolvedAt: { not: null },
          ...(scopedCustomerIds !== null && {
            customerId: { in: scopedCustomerIds },
          }),
        },
        select: { createdAt: true, resolvedAt: true },
        take: 200,
        orderBy: { resolvedAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: { deletedAt: null, ...orderCustomerFilter },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          orderStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          deletedAt: null,
          ...(scopedCustomerIds !== null && {
            customerId: { in: scopedCustomerIds },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          ticketNumber: true,
          customerId: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          registeredByUserId: admin.id,
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          fullName: true,
          phone: true,
          createdAt: true,
        },
      }),
    ]);

    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        if (!t.resolvedAt) return sum;
        return (
          sum +
          (t.resolvedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60)
        );
      }, 0);
      avgResolutionHours = Math.round((totalHours / resolvedTickets.length) * 10) / 10;
    }

    const recentActivities: RecentActivity[] = [
      ...recentOrders.map((o) => ({
        id: o.id,
        type: 'ORDER',
        title: `Order ${o.orderNumber}`,
        description: `Order status: ${o.orderStatus}`,
        customerId: o.customerId,
        orderId: o.id,
        createdAt: o.createdAt,
      })),
      ...recentTickets.map((t) => ({
        id: t.id,
        type: 'TICKET',
        title: t.subject ?? t.ticketNumber,
        description: `Ticket ${t.ticketNumber} — ${t.status}`,
        customerId: t.customerId,
        createdAt: t.createdAt,
      })),
      ...recentRegistrations.map((c) => ({
        id: c.id,
        type: 'REGISTRATION',
        title: c.fullName ?? c.phone,
        description: 'New customer registered',
        customerId: c.id,
        createdAt: c.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 15);

    return {
      assignedCustomers,
      openComplaints,
      pendingPayments: pendingPaymentsAgg._count._all,
      pendingPaymentsAmount: pendingPaymentsAgg._sum.grandTotal ?? 0,
      avgResolutionHours,
      todayOrders,
      pendingOrders,
      processingOrders,
      readyToDispatch,
      completedOrders,
      cancelledOrders,
      emergencyOrders,
      bulkEnquiries,
      customerIssues: openComplaints,
      customersHelped,
      recentActivities,
    };
  }

  async lookupCustomer(dto: CeLookupCustomerDto, admin: AuthenticatedAdmin) {
    if (!isValidIndianMobile(dto.phone)) {
      throw new BadRequestException('Invalid Indian mobile number');
    }
    const phone = normalizePhone(dto.phone);
    const digits = dto.phone.replace(/\D/g, '');
    const last10 = digits.slice(-10);

    const customer = await this.prisma.customer.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { phone },
          { phone: last10 },
          { phone: { endsWith: last10 } },
        ],
      },
      include: {
        profile: true,
        role: { select: { id: true, name: true, slug: true } },
        addresses: { where: { deletedAt: null, isDefault: true }, take: 1 },
      },
    });

    if (!customer) {
      return { exists: false };
    }

    const assignedToOther =
      !this.isSuperAdmin(admin) &&
      !!customer.assignedExecutiveId &&
      customer.assignedExecutiveId !== admin.id;

    if (assignedToOther) {
      return {
        exists: true,
        customer: {
          id: customer.id,
          phone: customer.phone,
          assignedToOtherExecutive: true,
        },
      };
    }

    return {
      exists: true,
      customer: {
        id: customer.id,
        phone: customer.phone,
        fullName: customer.fullName,
        email: customer.email,
        status: customer.status,
        companyName: customer.profile?.companyName ?? null,
        customerType: customer.role?.slug ?? null,
        defaultAddress: customer.addresses[0] ?? null,
        assignedExecutiveId: customer.assignedExecutiveId,
      },
    };
  }

  async sendRegistrationOtp(dto: CeSendOtpDto) {
    if (!isValidIndianMobile(dto.phone)) {
      throw new BadRequestException('Invalid Indian mobile number');
    }
    const phone = normalizePhone(dto.phone);
    const existing = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Customer already registered with this phone number',
      );
    }

    const result = await this.otpService.sendOtp(phone);
    const isProd =
      this.configService.get<string>('app.env') === 'production';

    return {
      expiresIn: result.expiresIn,
      ...(isProd ? {} : { otp: result.otp }),
    };
  }

  async verifyRegistrationOtp(dto: CeVerifyOtpDto) {
    if (!isValidIndianMobile(dto.phone)) {
      throw new BadRequestException('Invalid Indian mobile number');
    }
    const phone = normalizePhone(dto.phone);
    await this.otpService.verifyOtp(phone, dto.otp);

    const verificationToken = randomBytes(24).toString('hex');
    await this.redisService
      .getClient()
      .setex(
        `${CE_REG_VERIFIED_PREFIX}${phone}`,
        CE_REG_VERIFIED_TTL_SECONDS,
        verificationToken,
      );

    return { verified: true, verificationToken };
  }

  async registerCustomer(dto: CeRegisterCustomerDto, admin: AuthenticatedAdmin) {
    if (!isValidIndianMobile(dto.phone)) {
      throw new BadRequestException('Invalid Indian mobile number');
    }
    const phone = normalizePhone(dto.phone);
    const redisKey = `${CE_REG_VERIFIED_PREFIX}${phone}`;
    const storedToken = await this.redisService.getClient().get(redisKey);

    if (!storedToken || storedToken !== dto.verificationToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const existing = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Customer already registered with this phone number',
      );
    }

    if (dto.email) {
      const emailTaken = await this.prisma.customer.findFirst({
        where: { email: dto.email, deletedAt: null },
      });
      if (emailTaken) {
        throw new BadRequestException('Email already in use');
      }
    }

    const roleId = await this.resolveRoleId(dto.customerType);

    const customerId = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          phone,
          fullName: dto.fullName,
          email: dto.email ?? null,
          isVerified: true,
          status: 'ACTIVE',
          profileCompleted: true,
          roleSelected: !!roleId,
          roleId,
          assignedExecutiveId: admin.id,
          registeredByUserId: admin.id,
          registrationSource: RegistrationSource.CUSTOMER_EXECUTIVE,
          profile: {
            create: {
              companyName: dto.companyName ?? null,
              gstNumber: dto.gstNumber ?? null,
              registeredAddress: dto.address,
            },
          },
          addresses: {
            create: {
              label: 'Primary',
              line1: dto.address,
              city: dto.city,
              state: dto.state,
              pincode: dto.pincode,
              latitude: 0,
              longitude: 0,
              isDefault: true,
            },
          },
        },
      });

      const loyalty = await tx.loyaltyAccount.create({
        data: {
          customerId: customer.id,
          currentPoints: 0,
          redeemedPoints: 0,
          availablePoints: 0,
          tier: LoyaltyTier.BRONZE,
        },
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: { loyaltyAccountId: loyalty.id },
      });

      await tx.customerExecutiveAssignmentHistory.create({
        data: {
          customerId: customer.id,
          executiveId: admin.id,
          action: 'ASSIGNED',
          reason: 'Customer registered by customer executive',
          assignedById: admin.id,
        },
      });

      return customer.id;
    });

    await this.redisService.getClient().del(redisKey);

    await this.loyaltyTransactionService.creditWelcomeBonus(customerId);
    await this.deliveryBenefitService.ensureBenefit(customerId);

    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.CREATE,
      resource: 'Customer',
      resourceId: customerId,
      newValue: { phone, fullName: dto.fullName, registeredBy: admin.id },
    });

    return this.findCustomer(customerId, admin);
  }

  async updateCustomer(
    id: string,
    dto: CeUpdateCustomerDto,
    admin: AuthenticatedAdmin,
  ) {
    const before = await this.assertCustomerAccess(id, admin);

    if (dto.email) {
      const emailTaken = await this.prisma.customer.findFirst({
        where: { email: dto.email, deletedAt: null, NOT: { id } },
      });
      if (emailTaken) {
        throw new BadRequestException('Email already in use');
      }
    }

    const roleId =
      dto.customerType !== undefined
        ? await this.resolveRoleId(dto.customerType)
        : undefined;

    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(roleId !== undefined && {
          roleId,
          roleSelected: !!roleId,
        }),
        ...(dto.companyName !== undefined ||
        dto.gstNumber !== undefined ||
        dto.address !== undefined
          ? {
              profile: {
                upsert: {
                  create: {
                    companyName: dto.companyName,
                    gstNumber: dto.gstNumber,
                    registeredAddress: dto.address,
                  },
                  update: {
                    ...(dto.companyName !== undefined && {
                      companyName: dto.companyName,
                    }),
                    ...(dto.gstNumber !== undefined && {
                      gstNumber: dto.gstNumber,
                    }),
                    ...(dto.address !== undefined && {
                      registeredAddress: dto.address,
                    }),
                  },
                },
              },
            }
          : {}),
      },
    });

    if (dto.address || dto.city || dto.state || dto.pincode) {
      const defaultAddress = await this.prisma.address.findFirst({
        where: { customerId: id, isDefault: true, deletedAt: null },
      });

      if (defaultAddress) {
        await this.prisma.address.update({
          where: { id: defaultAddress.id },
          data: {
            ...(dto.address !== undefined && { line1: dto.address }),
            ...(dto.city !== undefined && { city: dto.city }),
            ...(dto.state !== undefined && { state: dto.state }),
            ...(dto.pincode !== undefined && { pincode: dto.pincode }),
          },
        });
      } else if (dto.address && dto.city && dto.state && dto.pincode) {
        await this.prisma.address.create({
          data: {
            customerId: id,
            label: 'Primary',
            line1: dto.address,
            city: dto.city,
            state: dto.state,
            pincode: dto.pincode,
            latitude: 0,
            longitude: 0,
            isDefault: true,
          },
        });
      }
    }

    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'Customer',
      resourceId: id,
      oldValue: { fullName: before.fullName, email: before.email },
      newValue: dto,
    });

    return this.findCustomer(id, admin);
  }

  async findCustomers(query: CeCustomerSearchQueryDto, admin: AuthenticatedAdmin) {
    const searchTerm = query.q ?? query.search;
    const executiveId = this.isSuperAdmin(admin)
      ? query.executiveId
      : admin.id;

    if (query.city || query.customerType) {
      return this.searchCustomersScoped(query, admin);
    }

    return this.customersService.findAll({
      page: query.page,
      limit: query.limit,
      search: searchTerm,
      status: query.status,
      executiveId,
    });
  }

  async searchCustomers(
    query: CeCustomerSearchQueryDto,
    admin: AuthenticatedAdmin,
  ) {
    return this.findCustomers(query, admin);
  }

  private async searchCustomersScoped(
    query: CeCustomerSearchQueryDto,
    admin: AuthenticatedAdmin,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const searchTerm = query.q ?? query.search;

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...this.assignedWhere(admin),
    };

    if (query.status) where.status = query.status as never;
    if (query.city) {
      where.addresses = {
        some: {
          deletedAt: null,
          city: { contains: query.city, mode: 'insensitive' },
        },
      };
    }
    if (query.customerType) {
      const slug = this.mapCustomerTypeSlug(query.customerType);
      if (slug) {
        where.role = { slug };
      }
    }
    if (searchTerm?.trim()) {
      const term = searchTerm.trim();
      where.OR = [
        { phone: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        ...(isUuid(term) ? [{ id: { equals: term } }] : []),
        {
          profile: {
            companyName: { contains: term, mode: 'insensitive' },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          role: { select: { slug: true, name: true } },
          loyaltyAccount: {
            select: { availablePoints: true, tier: true },
          },
          assignedExecutive: {
            select: { id: true, fullName: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findCustomer(id: string, admin: AuthenticatedAdmin) {
    await this.assertCustomerAccess(id, admin);
    return this.customersService.findOne(id);
  }

  async updateCustomerNote(
    id: string,
    dto: CeUpdateCustomerNoteDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.assertCustomerAccess(id, admin);

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

  async getCustomerMembership(customerId: string, admin: AuthenticatedAdmin) {
    await this.assertCustomerAccess(customerId, admin);
    const membership = await this.prisma.customerMembership.findFirst({
      where: { customerId, status: 'ACTIVE' },
      include: {
        plan: true,
        customer: { select: { id: true, phone: true, fullName: true } },
      },
      orderBy: { expiryDate: 'desc' },
    });
    if (!membership) throw new NotFoundException('Active membership not found');
    return membership;
  }

  async renewCustomerMembership(
    customerId: string,
    dto: CeRenewMembershipDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.assertCustomerAccess(customerId, admin);
    const membership = await this.prisma.customerMembership.findFirst({
      where: { customerId, status: 'ACTIVE' },
      orderBy: { expiryDate: 'desc' },
    });
    if (!membership) throw new NotFoundException('Active membership not found');

    if (dto.planId && dto.planId !== membership.planId) {
      throw new BadRequestException(
        'Plan change not supported via customer executive renew',
      );
    }

    return this.membershipService.renewMembership(membership.id);
  }

  async getCustomerLoyalty(customerId: string, admin: AuthenticatedAdmin) {
    await this.assertCustomerAccess(customerId, admin);
    return this.loyaltyService.findByCustomer(customerId);
  }

  async getCustomerLoyaltyHistory(
    customerId: string,
    query: CePaginationQueryDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.assertCustomerAccess(customerId, admin);
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
      this.prisma.loyaltyTransaction.count({
        where: { accountId: account.id },
      }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOrders(query: CeOrdersQueryDto, admin: AuthenticatedAdmin) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(await this.buildOrderCustomerScope(admin)),
    };

    if (query.customerId) {
      await this.assertCustomerAccess(query.customerId, admin);
      where.customerId = query.customerId;
    }
    if (query.status) where.orderStatus = query.status as OrderStatus;
    if (query.orderSource) where.orderSource = query.orderSource;
    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { phone: { contains: term } } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          items: { select: { id: true, name: true, quantity: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOrder(id: string, admin: AuthenticatedAdmin) {
    await this.assertOrderAccess(id, admin);
    return this.ordersService.findOne(id);
  }

  async createOrder(dto: CeCreateOrderDto, admin: AuthenticatedAdmin) {
    await this.assertCustomerAccess(dto.customerId, admin);

    let addressId = dto.addressId;

    if (!addressId && dto.deliveryAddress) {
      if (!dto.deliveryCity || !dto.deliveryState || !dto.deliveryPincode) {
        throw new BadRequestException(
          'deliveryCity, deliveryState, and deliveryPincode are required with deliveryAddress',
        );
      }
      const created = await this.prisma.address.create({
        data: {
          customerId: dto.customerId,
          label: 'Delivery',
          line1: dto.deliveryAddress,
          city: dto.deliveryCity,
          state: dto.deliveryState,
          pincode: dto.deliveryPincode,
          latitude: 0,
          longitude: 0,
          isDefault: false,
        },
      });
      addressId = created.id;
    }

    if (!addressId) {
      const defaultAddress = await this.prisma.address.findFirst({
        where: {
          customerId: dto.customerId,
          deletedAt: null,
          isDefault: true,
        },
      });
      addressId = defaultAddress?.id;
    }

    if (!addressId) {
      throw new BadRequestException('Delivery address is required');
    }

    if (dto.items?.length) {
      await this.cartService.clearCart(dto.customerId);
      for (const item of dto.items) {
        await this.cartService.addItem(dto.customerId, {
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        });
      }
    } else {
      const cart = await this.cartService.getCartForCheckout(dto.customerId);
      if (!cart.items?.length) {
        throw new BadRequestException(
          'Cart is empty. Add items or provide items in the request.',
        );
      }
    }

    const order = await this.customerOrdersService.placeOrder(dto.customerId, {
      addressId,
      paymentMethod: dto.paymentMethod as 'CASH' | 'MANUAL' | undefined,
      notes: dto.notes,
      loyaltyPointsToRedeem: dto.loyaltyPointsToRedeem,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderSource: 'CUSTOMER_EXECUTIVE',
        createdByAdminId: admin.id,
      },
    });

    await this.prisma.orderTimeline.create({
      data: {
        orderId: order.id,
        status: OrderStatus.CONFIRMED,
        remarks: `Order placed by customer executive (${admin.email})`,
        updatedBy: admin.id,
        updatedByRole: admin.role,
      },
    });

    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.CREATE,
      resource: 'Order',
      resourceId: order.id,
      newValue: {
        customerId: dto.customerId,
        orderSource: 'CUSTOMER_EXECUTIVE',
      },
    });

    return this.ordersService.findOne(order.id);
  }

  async cancelOrder(
    id: string,
    dto: CeCancelOrderDto,
    admin: AuthenticatedAdmin,
  ) {
    const order = await this.assertOrderAccess(id, admin);
    if (!['PENDING', 'CONFIRMED'].includes(order.orderStatus)) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }
    return this.ordersService.cancelOrder(
      id,
      { reason: dto.reason ?? 'Cancelled by customer executive' },
      admin.id,
    );
  }

  async updateOrderAddress(
    id: string,
    dto: CeUpdateOrderAddressDto,
    admin: AuthenticatedAdmin,
  ) {
    const order = await this.assertOrderAccess(id, admin);
    const address = await this.prisma.address.findFirst({
      where: {
        id: dto.addressId,
        customerId: order.customerId,
        deletedAt: null,
      },
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

  async updateOrderPayment(
    id: string,
    dto: CeUpdateOrderPaymentDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.assertOrderAccess(id, admin);
    return this.prisma.order.update({
      where: { id },
      data: { paymentMethod: dto.paymentMethod as never },
    });
  }

  async getOrderTracking(id: string, admin: AuthenticatedAdmin) {
    await this.assertOrderAccess(id, admin);
    const order = await this.ordersService.findOne(id);
    const timeline = await this.ordersService.getTimeline(id);
    return { order, timeline };
  }

  async findPayments(query: CePaymentQueryDto, admin: AuthenticatedAdmin) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      paymentStatus: query.status
        ? (query.status as PaymentStatus)
        : PaymentStatus.PENDING,
      ...(await this.buildOrderCustomerScope(admin)),
    };

    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { phone: { contains: term } } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          paymentLinks: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    let data = orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer,
      amount: o.grandTotal,
      paymentStatus: o.paymentStatus,
      latestPaymentLink: o.paymentLinks[0] ?? null,
      createdAt: o.createdAt,
    }));

    if (query.linkStatus) {
      data = data.filter(
        (row) => row.latestPaymentLink?.status === query.linkStatus,
      );
    }

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async sendPaymentLink(dto: CeSendPaymentLinkDto, admin: AuthenticatedAdmin) {
    const order = await this.assertOrderAccess(dto.orderId, admin);
    const publicToken = randomBytes(32).toString('hex');
    const paymentUrl = this.buildPaymentUrl(publicToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const link = await this.prisma.paymentLink.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        amount: order.grandTotal,
        status: PaymentLinkStatus.CREATED,
        paymentUrl,
        publicToken,
        createdById: admin.id,
        expiresAt,
      },
    });

    await this.notificationService.createForCustomer({
      customerId: order.customerId,
      type: NotificationType.PAYMENT,
      label: 'Payment Link',
      title: `Payment pending for order ${order.orderNumber}`,
      body:
        dto.message ??
        'Please complete your payment using the link below.',
      actionLabel: 'Pay Now',
      actionRoute: paymentUrl,
      actionVariant: 'primary',
    });

    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: {
        status: PaymentLinkStatus.SENT,
        sentAt: new Date(),
        notificationStatus: 'SENT',
      },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentUrl,
      paymentLinkId: link.id,
      sent: true,
    };
  }

  async sendPaymentReminder(
    dto: CePaymentReminderDto,
    admin: AuthenticatedAdmin,
  ) {
    const order = await this.assertOrderAccess(dto.orderId, admin);
    if (order.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException('Order payment is not pending');
    }

    const latestLink = await this.prisma.paymentLink.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    const paymentUrl =
      latestLink?.paymentUrl ?? this.buildPaymentUrl(randomBytes(32).toString('hex'));

    await this.notificationService.createForCustomer({
      customerId: order.customerId,
      type: NotificationType.PAYMENT,
      label: 'Payment Reminder',
      title: `Reminder: Payment pending for ${order.orderNumber}`,
      body: 'Your order is awaiting payment. Please complete payment to proceed.',
      actionLabel: 'Pay Now',
      actionRoute: paymentUrl,
      actionVariant: 'primary',
    });

    if (latestLink) {
      await this.prisma.paymentLink.update({
        where: { id: latestLink.id },
        data: { reminderCount: { increment: 1 } },
      });
    }

    return { orderId: order.id, reminded: true };
  }

  /**
   * Idempotent payment webhook handler.
   * Confirms payment by publicToken; safe to call multiple times.
   */
  async confirmPaymentWebhook(input: {
    publicToken: string;
    providerRef?: string;
    amount?: number;
  }) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { publicToken: input.publicToken },
    });
    if (!link) throw new NotFoundException('Payment link not found');

    if (link.status === PaymentLinkStatus.PAID) {
      return {
        idempotent: true,
        paymentLinkId: link.id,
        orderId: link.orderId,
        status: link.status,
      };
    }

    if (link.expiresAt.getTime() < Date.now()) {
      await this.prisma.paymentLink.update({
        where: { id: link.id },
        data: { status: PaymentLinkStatus.EXPIRED },
      });
      throw new BadRequestException('Payment link expired');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: link.orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (
      input.amount !== undefined &&
      Number(input.amount) < Number(link.amount)
    ) {
      await this.prisma.paymentLink.update({
        where: { id: link.id },
        data: {
          status: PaymentLinkStatus.PARTIALLY_PAID,
          metadata: {
            ...(typeof link.metadata === 'object' && link.metadata
              ? (link.metadata as object)
              : {}),
            providerRef: input.providerRef,
            paidAmount: input.amount,
          },
        },
      });
      return {
        idempotent: false,
        paymentLinkId: link.id,
        orderId: link.orderId,
        status: PaymentLinkStatus.PARTIALLY_PAID,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentLink.update({
        where: { id: link.id },
        data: {
          status: PaymentLinkStatus.PAID,
          paidAt: new Date(),
          metadata: {
            ...(typeof link.metadata === 'object' && link.metadata
              ? (link.metadata as object)
              : {}),
            providerRef: input.providerRef,
          },
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentCollectedAt: new Date(),
        },
      });
    });

    await this.notificationService.createForCustomer({
      customerId: order.customerId,
      type: NotificationType.PAYMENT,
      label: 'Payment Received',
      title: `Payment received for ${order.orderNumber}`,
      body: 'Thank you. Your payment has been confirmed.',
      actionLabel: 'View Order',
      actionRoute: `/orders/${order.id}`,
      actionVariant: 'primary',
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      resource: 'PaymentLink',
      resourceId: link.id,
      newValue: {
        status: PaymentLinkStatus.PAID,
        orderId: order.id,
        providerRef: input.providerRef,
      },
    });

    return {
      idempotent: false,
      paymentLinkId: link.id,
      orderId: link.orderId,
      status: PaymentLinkStatus.PAID,
    };
  }

  async searchTracking(
    query: CeTrackingSearchQueryDto,
    admin: AuthenticatedAdmin,
  ) {
    const term = query.q.trim();
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(await this.buildOrderCustomerScope(admin)),
      OR: [
        { id: term },
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { phone: { contains: term } } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
      ],
    };

    const orders = await this.prisma.order.findMany({
      where,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        timeline: { orderBy: { createdAt: 'asc' }, take: 10 },
      },
    });

    return { data: orders };
  }

  async getActivity(admin: AuthenticatedAdmin, limit = 20) {
    const scopedCustomerIds = await this.scopeCustomerIds(admin);
    const orderFilter =
      scopedCustomerIds === null
        ? {}
        : { customerId: { in: scopedCustomerIds } };

    const [orders, tickets, registrations] = await Promise.all([
      this.prisma.order.findMany({
        where: { deletedAt: null, ...orderFilter },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          orderStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          deletedAt: null,
          ...(scopedCustomerIds !== null && {
            customerId: { in: scopedCustomerIds },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          customerId: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          registeredByUserId: admin.id,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          fullName: true,
          phone: true,
          createdAt: true,
        },
      }),
    ]);

    const activities: RecentActivity[] = [
      ...orders.map((o) => ({
        id: o.id,
        type: 'ORDER',
        title: `Order ${o.orderNumber}`,
        description: o.orderStatus,
        customerId: o.customerId,
        orderId: o.id,
        createdAt: o.createdAt,
      })),
      ...tickets.map((t) => ({
        id: t.id,
        type: 'TICKET',
        title: t.subject ?? t.ticketNumber,
        description: t.status,
        customerId: t.customerId,
        createdAt: t.createdAt,
      })),
      ...registrations.map((c) => ({
        id: c.id,
        type: 'REGISTRATION',
        title: c.fullName ?? c.phone,
        description: 'Customer registered',
        customerId: c.id,
        createdAt: c.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return { data: activities };
  }

  private async assertBulkEnquiryAccess(
    enquiry: { customerId: string; assignedExecutiveId?: string | null },
    admin: AuthenticatedAdmin,
  ) {
    if (this.isSuperAdmin(admin)) return;
    if (enquiry.assignedExecutiveId === admin.id) return;
    await this.assertCustomerAccess(enquiry.customerId, admin);
  }

  private buildBulkScopeWhere(
    admin: AuthenticatedAdmin,
    customerIds: string[] | null,
  ): Prisma.BulkEnquiryWhereInput {
    if (customerIds === null) return {};
    return {
      OR: [
        {
          customerId: {
            in: customerIds.length ? customerIds : ['__none__'],
          },
        },
        { assignedExecutiveId: admin.id },
      ],
    };
  }

  async findBulkEnquiries(query: CeBulkQueryDto, admin: AuthenticatedAdmin) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const customerIds = await this.scopeCustomerIds(admin);
    const search = (query.search ?? query.q)?.trim();

    const where: Prisma.BulkEnquiryWhereInput = {
      ...this.buildBulkScopeWhere(admin, customerIds),
    };

    if (query.status) where.status = query.status;
    if (query.materialCategorySlug) {
      where.materialCategorySlug = query.materialCategorySlug;
    }
    if (query.deliveryRequirement) {
      where.deliveryRequirement = query.deliveryRequirement;
    }
    if (query.city?.trim()) {
      where.city = { contains: query.city.trim(), mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo
          ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
          : {}),
      };
    }

    if (query.assignedExecutiveId) {
      if (
        !this.isSuperAdmin(admin) &&
        query.assignedExecutiveId !== admin.id
      ) {
        throw new ForbiddenException(
          'You can only filter bulk enquiries assigned to yourself',
        );
      }
      where.assignedExecutiveId = query.assignedExecutiveId;
    }

    if (search) {
      const searchOr: Prisma.BulkEnquiryWhereInput[] = [
        { enquiryNumber: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { projectName: { contains: search, mode: 'insensitive' } },
        { materialCategoryName: { contains: search, mode: 'insensitive' } },
        { materialTypeLabel: { contains: search, mode: 'insensitive' } },
        { assignedExecutive: { contains: search, mode: 'insensitive' } },
        { customerNameSnapshot: { contains: search, mode: 'insensitive' } },
        { customerPhoneSnapshot: { contains: search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              {
                profile: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          },
        },
      ];
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        { OR: searchOr },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.bulkEnquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              phone: true,
              fullName: true,
              email: true,
              assignedExecutiveId: true,
              profile: { select: { companyName: true, gstNumber: true } },
            },
          },
          assignedExecutiveUser: {
            select: { id: true, fullName: true },
          },
          materialCategory: {
            select: { id: true, slug: true, name: true },
          },
        },
      }),
      this.prisma.bulkEnquiry.count({ where }),
    ]);

    const data = rows.map((row) => ({
      ...row,
      expectedQuantity: decimalToNumber(row.expectedQuantity),
      estimatedValue: optionalDecimalToNumber(row.estimatedValue),
      quotedValue: optionalDecimalToNumber(row.quotedValue),
      latitude: optionalDecimalToNumber(row.latitude),
      longitude: optionalDecimalToNumber(row.longitude),
    }));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async getBulkStats(admin: AuthenticatedAdmin, query: CeBulkQueryDto = {}) {
    const customerIds = await this.scopeCustomerIds(admin);
    const base: Prisma.BulkEnquiryWhereInput = {
      ...this.buildBulkScopeWhere(admin, customerIds),
      ...(query.assignedExecutiveId && this.isSuperAdmin(admin)
        ? { assignedExecutiveId: query.assignedExecutiveId }
        : {}),
      ...(query.city?.trim()
        ? { city: { contains: query.city.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo
                ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };

    const [
      openRequests,
      assigned,
      inProgress,
      completed,
      cancelled,
      estimatedAgg,
      quotedAgg,
      convertedAgg,
    ] = await Promise.all([
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: BulkEnquiryStatus.NEW },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: BulkEnquiryStatus.ASSIGNED },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: { in: BULK_IN_PROGRESS_STATUSES } },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: { in: BULK_COMPLETED_STATUSES } },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: { in: BULK_CANCELLED_STATUSES } },
      }),
      this.prisma.bulkEnquiry.aggregate({
        where: {
          ...base,
          status: { notIn: BULK_TERMINAL_STATUSES },
          estimatedValue: { not: null },
        },
        _sum: { estimatedValue: true },
      }),
      this.prisma.bulkEnquiry.aggregate({
        where: {
          ...base,
          status: { in: BULK_QUOTED_PIPELINE_STATUSES },
          quotedValue: { not: null },
        },
        _sum: { quotedValue: true },
      }),
      this.prisma.bulkEnquiry.aggregate({
        where: {
          ...base,
          status: {
            in: [
              BulkEnquiryStatus.CONVERTED,
              BulkEnquiryStatus.ORDER_CREATED,
              BulkEnquiryStatus.COMPLETED,
            ],
          },
        },
        _sum: { quotedValue: true, estimatedValue: true },
      }),
    ]);

    return {
      openRequests,
      assigned,
      inProgress,
      completed,
      cancelled,
      estimatedPipeline: decimalToNumber(estimatedAgg._sum.estimatedValue),
      quotedPipeline: decimalToNumber(quotedAgg._sum.quotedValue),
      convertedValue:
        decimalToNumber(convertedAgg._sum.quotedValue) ||
        decimalToNumber(convertedAgg._sum.estimatedValue),
    };
  }

  async findBulkEnquiry(id: string, admin: AuthenticatedAdmin) {
    const enquiry = await this.bulkService.findOne(id);
    await this.assertBulkEnquiryAccess(
      {
        customerId: String(enquiry['customerId']),
        assignedExecutiveId:
          (enquiry['assignedExecutiveId'] as string | null | undefined) ?? null,
      },
      admin,
    );
    return enquiry;
  }

  async updateBulkStatus(
    id: string,
    dto: CeBulkStatusDto,
    admin: AuthenticatedAdmin,
  ) {
    const enquiry = await this.findBulkEnquiry(id, admin);
    const updated = await this.bulkService.updateStatus(
      id,
      { status: dto.status, remarks: dto.remarks },
      admin,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'BulkEnquiry',
      resourceId: id,
      oldValue: { status: enquiry['status'] },
      newValue: { status: dto.status, remarks: dto.remarks },
    });
    return updated;
  }

  async assignBulkEnquiry(
    id: string,
    dto: CeBulkAssignDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    const payload = {
      executiveId: dto.executiveId ?? (this.isSuperAdmin(admin) ? undefined : admin.id),
      assignedExecutive: dto.assignedExecutive,
    };
    if (!payload.executiveId && !payload.assignedExecutive) {
      payload.executiveId = admin.id;
    }
    const updated = await this.bulkService.assignExecutive(id, payload, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.ASSIGN,
      resource: 'BulkEnquiry',
      resourceId: id,
      newValue: payload,
    });
    return updated;
  }

  async addBulkFollowUp(
    id: string,
    dto: CeBulkFollowUpDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.addFollowUp(id, dto, admin);
  }

  async updateBulkFollowUpStatus(
    id: string,
    followUpId: string,
    dto: CeBulkFollowUpStatusDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.updateFollowUpStatus(id, followUpId, dto, admin);
  }

  async addBulkNote(id: string, dto: CeBulkNoteDto, admin: AuthenticatedAdmin) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.addInternalNote(id, dto, admin);
  }

  async createBulkQuotation(
    id: string,
    dto: CeBulkQuotationDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.createQuotation(id, dto, admin);
  }

  async updateBulkQuotationStatus(
    id: string,
    quotationId: string,
    dto: CeBulkQuotationStatusDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.updateQuotationStatus(id, quotationId, dto, admin);
  }

  async convertBulkEnquiry(
    id: string,
    dto: CeBulkConvertDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    const result = await this.bulkService.convertToOrder(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'BulkEnquiry',
      resourceId: id,
      newValue: {
        convertedOrderId: result.order.id,
        orderNumber: result.order.orderNumber,
      },
    });
    return result;
  }

  async rejectBulkEnquiry(
    id: string,
    dto: CeBulkRejectDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.reject(id, dto, admin);
  }

  async cancelBulkEnquiry(
    id: string,
    dto: CeBulkRejectDto,
    admin: AuthenticatedAdmin,
  ) {
    await this.findBulkEnquiry(id, admin);
    return this.bulkService.cancel(id, dto, admin);
  }

  async findEmergencyOrders(query: CePaginationQueryDto) {
    return this.emergencyService.findAll({
      page: query.page,
      limit: query.limit,
    });
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

  async createTicket(dto: CeCreateTicketDto, admin: AuthenticatedAdmin) {
    await this.assertCustomerAccess(dto.customerId, admin);

    if (dto.orderId) {
      await this.assertOrderAccess(dto.orderId, admin);
    }

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
        assignedExecutiveId: admin.id,
        reason: dto.reason,
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority,
      },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        order: { select: { orderNumber: true } },
      },
    });
  }

  async findTickets(query: CeTicketQueryDto, admin: AuthenticatedAdmin) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const scopedCustomerIds = await this.scopeCustomerIds(admin);
    const where: Prisma.SupportTicketWhereInput = { deletedAt: null };

    if (scopedCustomerIds !== null) {
      where.customerId = { in: scopedCustomerIds };
    }
    if (query.status) where.status = query.status as SupportTicketStatus;
    if (query.priority) where.priority = query.priority as never;
    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { ticketNumber: { contains: term, mode: 'insensitive' } },
        { subject: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

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

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findTicket(id: string, admin: AuthenticatedAdmin) {
    const scopedCustomerIds = await this.scopeCustomerIds(admin);
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        order: { select: { id: true, orderNumber: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { admin: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Support ticket not found');

    if (
      scopedCustomerIds !== null &&
      !scopedCustomerIds.includes(ticket.customerId)
    ) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    return ticket;
  }

  async updateTicket(
    id: string,
    dto: CeUpdateTicketDto,
    admin: AuthenticatedAdmin,
  ) {
    const ticket = await this.findTicket(id, admin);

    const status = dto.status ?? ticket.status;
    if (
      status === SupportTicketStatus.RESOLVED &&
      !dto.resolution?.trim()
    ) {
      throw new BadRequestException(
        'Resolution is required when resolving a ticket',
      );
    }

    const resolvedAt =
      status === SupportTicketStatus.RESOLVED ||
      status === SupportTicketStatus.CLOSED
        ? new Date()
        : ticket.resolvedAt;

    const closedAt =
      status === SupportTicketStatus.CLOSED ? new Date() : ticket.closedAt;

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        priority: dto.priority ?? ticket.priority,
        resolvedAt,
        closedAt,
        ...(dto.resolution && {
          description: `${ticket.description}\n\n--- Resolution ---\n${dto.resolution}`,
        }),
      },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        order: { select: { orderNumber: true } },
      },
    });

    if (dto.note?.trim()) {
      await this.prisma.supportTicketNote.create({
        data: {
          ticketId: id,
          adminId: admin.id,
          body: dto.note.trim(),
        },
      });
    }

    return updated;
  }

  async findExpertCallbacks(query: CeExpertCallbackQueryDto, admin: AuthenticatedAdmin) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const scopedCustomerIds = await this.scopeCustomerIds(admin);
    const where: Prisma.ExpertCallbackRequestWhereInput = {};

    if (scopedCustomerIds !== null) {
      where.customerId = { in: scopedCustomerIds };
    }
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { contactName: { contains: term, mode: 'insensitive' } },
        { needs: { contains: term, mode: 'insensitive' } },
        { phoneSnapshot: { contains: term, mode: 'insensitive' } },
        { categoryName: { contains: term, mode: 'insensitive' } },
        { categorySlug: { contains: term, mode: 'insensitive' } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [data, total, newCount, contactedCount, closedCount] = await Promise.all([
      this.prisma.expertCallbackRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          assignedExecutive: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.expertCallbackRequest.count({ where }),
      this.prisma.expertCallbackRequest.count({
        where: { ...where, status: ExpertCallbackStatus.NEW },
      }),
      this.prisma.expertCallbackRequest.count({
        where: { ...where, status: ExpertCallbackStatus.CONTACTED },
      }),
      this.prisma.expertCallbackRequest.count({
        where: { ...where, status: ExpertCallbackStatus.CLOSED },
      }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
      stats: {
        total,
        new: newCount,
        contacted: contactedCount,
        closed: closedCount,
      },
    };
  }

  async findExpertCallback(id: string, admin: AuthenticatedAdmin) {
    const scopedCustomerIds = await this.scopeCustomerIds(admin);
    const row = await this.prisma.expertCallbackRequest.findFirst({
      where: { id },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        assignedExecutive: { select: { id: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Expert callback request not found');
    if (scopedCustomerIds !== null && !scopedCustomerIds.includes(row.customerId)) {
      throw new ForbiddenException('You do not have access to this request');
    }
    return row;
  }

  async updateExpertCallback(
    id: string,
    dto: CeUpdateExpertCallbackDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.findExpertCallback(id, admin);
    const now = new Date();
    const nextStatus = dto.status ?? existing.status;

    const updated = await this.prisma.expertCallbackRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        executiveNotes:
          dto.executiveNotes !== undefined
            ? dto.executiveNotes.trim() || null
            : existing.executiveNotes,
        assignedExecutiveId: existing.assignedExecutiveId ?? admin.id,
        contactedAt:
          nextStatus === ExpertCallbackStatus.CONTACTED && !existing.contactedAt
            ? now
            : existing.contactedAt,
        closedAt:
          nextStatus === ExpertCallbackStatus.CLOSED
            ? existing.closedAt ?? now
            : nextStatus === ExpertCallbackStatus.NEW
              ? null
              : existing.closedAt,
      },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        assignedExecutive: { select: { id: true, fullName: true } },
      },
    });

    return updated;
  }
}
