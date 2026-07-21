import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  SettlementStatus,
  SettlementType,
  WalletTransactionStatus,
  WalletTransactionType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  CreateRefundDto,
  FinanceDateRangeDto,
  GenerateHubSettlementDto,
  GenerateVendorSettlementDto,
  HubSettlementQueryDto,
  RefundLedgerQueryDto,
  RejectRefundDto,
  RejectSettlementDto,
  VendorSettlementQueryDto,
  WalletSettlementQueryDto,
} from './dto/admin-finance.dto';

const DEFAULT_HUB_COMMISSION_RATE = 5;
const DEFAULT_VENDOR_COMMISSION_RATE = 10;

@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private getPagination(page = 1, limit = 20) {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = limit < 1 ? 20 : limit;
    return { skip: (safePage - 1) * safeLimit, take: safeLimit, page: safePage, limit: safeLimit };
  }

  private getDateRange(fromDate?: string, toDate?: string) {
    if (!fromDate && !toDate) return undefined;
    return {
      ...(fromDate && { gte: new Date(fromDate) }),
      ...(toDate && { lte: new Date(`${toDate}T23:59:59.999Z`) }),
    };
  }

  private getTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private toNumber(value: unknown): number {
    if (value == null) return 0;
    return Number(value);
  }

  private async generateSettlementNumber(type: SettlementType): Promise<string> {
    const prefix = type === SettlementType.HUB ? 'HUB' : 'VND';
    const year = new Date().getFullYear();
    const count = await this.prisma.settlementBatch.count({
      where: {
        type,
        createdAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
    });
    return `SET-${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  private async getSettledOrderIds(): Promise<Set<string>> {
    const approved = await this.prisma.settlementBatch.findMany({
      where: { status: SettlementStatus.APPROVED },
      select: { orderIds: true },
    });
    const ids = new Set<string>();
    for (const batch of approved) {
      const orderIds = batch.orderIds;
      if (Array.isArray(orderIds)) {
        for (const id of orderIds) {
          if (typeof id === 'string') ids.add(id);
        }
      }
    }
    return ids;
  }

  async getDashboardCards() {
    const { start, end } = this.getTodayRange();

    const [
      todaysCollection,
      walletBalance,
      refundPendingAgg,
      hubPendingAgg,
      vendorPendingAgg,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          deletedAt: null,
          paymentStatus: PaymentStatus.PAID,
          createdAt: { gte: start, lt: end },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.walletTransaction.aggregate({
        where: {
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.PENDING,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.settlementBatch.aggregate({
        where: { type: SettlementType.HUB, status: SettlementStatus.PENDING },
        _sum: { netAmount: true },
        _count: { _all: true },
      }),
      this.prisma.settlementBatch.aggregate({
        where: { type: SettlementType.VENDOR, status: SettlementStatus.PENDING },
        _sum: { netAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      todaysCollection: this.toNumber(todaysCollection._sum.grandTotal),
      walletBalance: this.toNumber(walletBalance._sum.balance),
      refundPending: this.toNumber(refundPendingAgg._sum.amount),
      vendorPending: this.toNumber(vendorPendingAgg._sum.netAmount),
      hubPending: this.toNumber(hubPendingAgg._sum.netAmount),
    };
  }

  async getDailyClosing(query?: FinanceDateRangeDto) {
    const { start, end } = query?.fromDate
      ? {
          start: new Date(query.fromDate),
          end: query.toDate
            ? new Date(`${query.toDate}T23:59:59.999Z`)
            : (() => {
                const d = new Date(query.fromDate!);
                d.setDate(d.getDate() + 1);
                return d;
              })(),
        }
      : this.getTodayRange();

    const dateLabel = start.toISOString().slice(0, 10);

    const [
      paidOrders,
      cashOrders,
      manualOrders,
      walletUsage,
      refundApproved,
      refundPending,
      ordersPlaced,
      ordersDelivered,
      ordersCancelled,
      ordersPending,
      hubPending,
      vendorPending,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          deletedAt: null,
          paymentStatus: PaymentStatus.PAID,
          createdAt: { gte: start, lt: end },
        },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: {
          deletedAt: null,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: 'CASH',
          createdAt: { gte: start, lt: end },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: {
          deletedAt: null,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: 'MANUAL',
          createdAt: { gte: start, lt: end },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          type: WalletTransactionType.ORDER_PAYMENT,
          status: WalletTransactionStatus.SUCCESS,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.SUCCESS,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.PENDING,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({
        where: { deletedAt: null, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.CANCELLED,
          cancelledAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.settlementBatch.aggregate({
        where: { type: SettlementType.HUB, status: SettlementStatus.PENDING },
        _sum: { netAmount: true },
        _count: { _all: true },
      }),
      this.prisma.settlementBatch.aggregate({
        where: { type: SettlementType.VENDOR, status: SettlementStatus.PENDING },
        _sum: { netAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      date: dateLabel,
      revenue: {
        total: this.toNumber(paidOrders._sum.grandTotal),
        cash: this.toNumber(cashOrders._sum.grandTotal),
        manual: this.toNumber(manualOrders._sum.grandTotal),
        orderCount: paidOrders._count._all,
      },
      walletUsage: {
        totalUsed: this.toNumber(walletUsage._sum.amount),
        transactionCount: walletUsage._count._all,
      },
      refunds: {
        approved: this.toNumber(refundApproved._sum.amount),
        pending: this.toNumber(refundPending._sum.amount),
        count: refundPending._count._all,
      },
      orders: {
        placed: ordersPlaced,
        delivered: ordersDelivered,
        cancelled: ordersCancelled,
        pending: ordersPending,
      },
      pendingSettlement: {
        hubPendingAmount: this.toNumber(hubPending._sum.netAmount),
        hubPendingCount: hubPending._count._all,
        vendorPendingAmount: this.toNumber(vendorPending._sum.netAmount),
        vendorPendingCount: vendorPending._count._all,
      },
    };
  }

  async listWalletTransactions(query: WalletSettlementQueryDto) {
    const { skip, take, page, limit } = this.getPagination(query.page, query.limit);
    const createdAt = this.getDateRange(query.fromDate, query.toDate);

    const where: Record<string, unknown> = {};
    if (query.type) where['type'] = query.type;
    if (query.status) where['status'] = query.status;
    if (createdAt) where['createdAt'] = createdAt;

    if (query.customerId) {
      const wallet = await this.prisma.wallet.findUnique({
        where: { customerId: query.customerId },
      });
      if (!wallet) {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      where['walletId'] = wallet.id;
    }

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: {
            include: {
              customer: { select: { id: true, phone: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getCustomerWalletLedger(customerId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
      include: {
        customer: { select: { id: true, phone: true, fullName: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found for customer');

    const summary = await this.prisma.walletTransaction.groupBy({
      by: ['type', 'status'],
      where: { walletId: wallet.id },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return { wallet, summary };
  }

  async listRefunds(query: RefundLedgerQueryDto) {
    const { skip, take, page, limit } = this.getPagination(query.page, query.limit);
    const createdAt = this.getDateRange(query.fromDate, query.toDate);

    const where: Record<string, unknown> = { type: WalletTransactionType.REFUND };
    if (query.status) where['status'] = query.status;
    if (createdAt) where['createdAt'] = createdAt;

    if (query.customerId) {
      const wallet = await this.prisma.wallet.findUnique({
        where: { customerId: query.customerId },
      });
      if (!wallet) {
        return { data: [], summary: { pending: 0, approved: 0, rejected: 0 }, meta: { page, limit, total: 0, totalPages: 0 } };
      }
      where['walletId'] = wallet.id;
    }

    const [data, total, statusSummary] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: {
            include: {
              customer: { select: { id: true, phone: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.walletTransaction.count({ where }),
      this.prisma.walletTransaction.groupBy({
        by: ['status'],
        where: { type: WalletTransactionType.REFUND },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of statusSummary) {
      const amount = this.toNumber(row._sum.amount);
      if (row.status === WalletTransactionStatus.PENDING) summary.pending = amount;
      if (row.status === WalletTransactionStatus.SUCCESS) summary.approved = amount;
      if (row.status === WalletTransactionStatus.FAILED) summary.rejected = amount;
    }

    return { data, summary, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async createRefund(dto: CreateRefundDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId: dto.customerId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found for customer');

    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, customerId: dto.customerId, deletedAt: null },
      });
      if (!order) throw new NotFoundException('Order not found for customer');

      const existing = await this.prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          type: WalletTransactionType.REFUND,
          referenceId: dto.orderId,
          referenceType: 'ORDER',
          status: { in: [WalletTransactionStatus.PENDING, WalletTransactionStatus.SUCCESS] },
        },
      });
      if (existing) {
        throw new BadRequestException('A refund already exists for this order');
      }
    }

    return this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.REFUND,
        amount: dto.amount,
        reason: dto.reason,
        referenceId: dto.orderId,
        referenceType: dto.orderId ? 'ORDER' : 'ADMIN',
        status: WalletTransactionStatus.PENDING,
      },
      include: {
        wallet: {
          include: {
            customer: { select: { id: true, phone: true, fullName: true } },
          },
        },
      },
    });
  }

  async approveRefund(id: string) {
    const refund = await this.prisma.walletTransaction.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!refund || refund.type !== WalletTransactionType.REFUND) {
      throw new NotFoundException('Refund not found');
    }
    if (refund.status !== WalletTransactionStatus.PENDING) {
      throw new BadRequestException('Refund is not pending approval');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: refund.walletId },
        data: {
          balance: { increment: refund.amount },
          totalCredits: { increment: refund.amount },
        },
      });

      const updated = await tx.walletTransaction.update({
        where: { id },
        data: { status: WalletTransactionStatus.SUCCESS },
        include: {
          wallet: {
            include: {
              customer: { select: { id: true, phone: true, fullName: true } },
            },
          },
        },
      });

      if (refund.referenceId && refund.referenceType === 'ORDER') {
        await tx.order.updateMany({
          where: { id: refund.referenceId },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        });
        await tx.invoice.updateMany({
          where: { orderId: refund.referenceId },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        });
      }

      return updated;
    });
  }

  async rejectRefund(id: string, dto: RejectRefundDto) {
    const refund = await this.prisma.walletTransaction.findUnique({ where: { id } });
    if (!refund || refund.type !== WalletTransactionType.REFUND) {
      throw new NotFoundException('Refund not found');
    }
    if (refund.status !== WalletTransactionStatus.PENDING) {
      throw new BadRequestException('Refund is not pending approval');
    }

    return this.prisma.walletTransaction.update({
      where: { id },
      data: {
        status: WalletTransactionStatus.FAILED,
        reason: `${refund.reason} [REJECTED: ${dto.reason}]`,
      },
      include: {
        wallet: {
          include: {
            customer: { select: { id: true, phone: true, fullName: true } },
          },
        },
      },
    });
  }

  async listHubSettlements(query: HubSettlementQueryDto) {
    const { skip, take, page, limit } = this.getPagination(query.page, query.limit);
    const createdAt = this.getDateRange(query.fromDate, query.toDate);

    const where: Record<string, unknown> = { type: SettlementType.HUB };
    if (query.status) where['status'] = query.status;
    if (query.hubId) where['hubId'] = query.hubId;
    if (createdAt) where['createdAt'] = createdAt;

    const [data, total, summary] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          hub: { select: { id: true, code: true, name: true, city: true } },
          generatedBy: { select: { id: true, fullName: true, email: true } },
          approvedBy: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.settlementBatch.count({ where }),
      this.prisma.settlementBatch.groupBy({
        by: ['status'],
        where: { type: SettlementType.HUB },
        _sum: { grossAmount: true, netAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      data,
      summary,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getHubSettlementDetails(id: string) {
    const settlement = await this.prisma.settlementBatch.findFirst({
      where: { id, type: SettlementType.HUB },
      include: {
        hub: { select: { id: true, code: true, name: true, city: true, phone: true } },
        generatedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!settlement) throw new NotFoundException('Hub settlement not found');

    const orderIds = Array.isArray(settlement.orderIds)
      ? settlement.orderIds.filter((v): v is string => typeof v === 'string')
      : [];

    const orders = orderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true,
            orderNumber: true,
            grandTotal: true,
            paymentStatus: true,
            paymentMethod: true,
            deliveredAt: true,
            customer: { select: { phone: true, fullName: true } },
          },
          orderBy: { deliveredAt: 'desc' },
        })
      : [];

    return { settlement, orders };
  }

  async generateHubSettlement(dto: GenerateHubSettlementDto, adminId: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id: dto.hubId, deletedAt: null },
    });
    if (!hub) throw new NotFoundException('Hub not found');

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(`${dto.periodEnd}T23:59:59.999Z`);
    if (periodStart > periodEnd) {
      throw new BadRequestException('periodStart must be before periodEnd');
    }

    const settledOrderIds = await this.getSettledOrderIds();

    const orders = await this.prisma.order.findMany({
      where: {
        hubId: dto.hubId,
        orderStatus: OrderStatus.DELIVERED,
        deletedAt: null,
        deliveredAt: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, orderNumber: true, grandTotal: true, deliveredAt: true },
      orderBy: { deliveredAt: 'asc' },
    });

    const eligibleOrders = orders.filter((o) => !settledOrderIds.has(o.id));
    if (eligibleOrders.length === 0) {
      throw new BadRequestException('No unsettled delivered orders found for this hub and period');
    }

    const grossAmount = eligibleOrders.reduce((sum, o) => sum + this.toNumber(o.grandTotal), 0);
    const commissionRate = dto.commissionRate ?? DEFAULT_HUB_COMMISSION_RATE;
    const commissionAmount = (grossAmount * commissionRate) / 100;
    const netAmount = grossAmount - commissionAmount;
    const settlementNumber = await this.generateSettlementNumber(SettlementType.HUB);

    return this.prisma.settlementBatch.create({
      data: {
        settlementNumber,
        type: SettlementType.HUB,
        hubId: dto.hubId,
        periodStart,
        periodEnd,
        orderCount: eligibleOrders.length,
        grossAmount,
        commissionRate,
        commissionAmount,
        netAmount,
        status: SettlementStatus.PENDING,
        orderIds: eligibleOrders.map((o) => o.id),
        breakdown: eligibleOrders.map((o) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          amount: this.toNumber(o.grandTotal),
          deliveredAt: o.deliveredAt,
        })),
        notes: dto.notes,
        generatedById: adminId,
      },
      include: {
        hub: { select: { id: true, code: true, name: true, city: true } },
        generatedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async approveHubSettlement(id: string, adminId: string) {
    const settlement = await this.prisma.settlementBatch.findFirst({
      where: { id, type: SettlementType.HUB },
    });
    if (!settlement) throw new NotFoundException('Hub settlement not found');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('Settlement is not pending approval');
    }

    return this.prisma.settlementBatch.update({
      where: { id },
      data: {
        status: SettlementStatus.APPROVED,
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: {
        hub: { select: { id: true, code: true, name: true, city: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async rejectHubSettlement(id: string, dto: RejectSettlementDto) {
    const settlement = await this.prisma.settlementBatch.findFirst({
      where: { id, type: SettlementType.HUB },
    });
    if (!settlement) throw new NotFoundException('Hub settlement not found');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('Settlement is not pending approval');
    }

    return this.prisma.settlementBatch.update({
      where: { id },
      data: {
        status: SettlementStatus.REJECTED,
        rejectedAt: new Date(),
        rejectReason: dto.reason,
      },
      include: {
        hub: { select: { id: true, code: true, name: true, city: true } },
      },
    });
  }

  async listVendorSettlements(query: VendorSettlementQueryDto) {
    const { skip, take, page, limit } = this.getPagination(query.page, query.limit);
    const createdAt = this.getDateRange(query.fromDate, query.toDate);

    const where: Record<string, unknown> = { type: SettlementType.VENDOR };
    if (query.status) where['status'] = query.status;
    if (query.vendorKey) where['vendorKey'] = query.vendorKey;
    if (createdAt) where['createdAt'] = createdAt;

    const [data, total, summary] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          generatedBy: { select: { id: true, fullName: true, email: true } },
          approvedBy: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.settlementBatch.count({ where }),
      this.prisma.settlementBatch.groupBy({
        by: ['status'],
        where: { type: SettlementType.VENDOR },
        _sum: { grossAmount: true, netAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      data,
      summary,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getVendorSettlementDetails(id: string) {
    const settlement = await this.prisma.settlementBatch.findFirst({
      where: { id, type: SettlementType.VENDOR },
      include: {
        generatedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!settlement) throw new NotFoundException('Vendor settlement not found');

    const orderIds = Array.isArray(settlement.orderIds)
      ? settlement.orderIds.filter((v): v is string => typeof v === 'string')
      : [];

    const orders = orderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true,
            orderNumber: true,
            grandTotal: true,
            deliveredAt: true,
            items: {
              select: {
                name: true,
                quantity: true,
                subtotal: true,
                product: { select: { brand: true } },
              },
            },
          },
        })
      : [];

    return { settlement, orders };
  }

  async generateVendorSettlement(dto: GenerateVendorSettlementDto, adminId: string) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(`${dto.periodEnd}T23:59:59.999Z`);
    if (periodStart > periodEnd) {
      throw new BadRequestException('periodStart must be before periodEnd');
    }

    const settledOrderIds = await this.getSettledOrderIds();

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        product: { brand: dto.vendorKey },
        order: {
          orderStatus: OrderStatus.DELIVERED,
          deletedAt: null,
          deliveredAt: { gte: periodStart, lte: periodEnd },
        },
      },
      select: {
        orderId: true,
        subtotal: true,
        order: {
          select: {
            orderNumber: true,
            deliveredAt: true,
          },
        },
      },
    });

    const orderMap = new Map<string, { orderNumber: string; amount: number; deliveredAt: Date | null }>();
    for (const item of orderItems) {
      if (settledOrderIds.has(item.orderId)) continue;
      const existing = orderMap.get(item.orderId);
      const subtotal = this.toNumber(item.subtotal);
      if (existing) {
        existing.amount += subtotal;
      } else {
        orderMap.set(item.orderId, {
          orderNumber: item.order.orderNumber,
          amount: subtotal,
          deliveredAt: item.order.deliveredAt,
        });
      }
    }

    if (orderMap.size === 0) {
      throw new BadRequestException('No unsettled delivered orders found for this vendor and period');
    }

    const breakdown = [...orderMap.entries()].map(([orderId, info]) => ({
      orderId,
      orderNumber: info.orderNumber,
      amount: info.amount,
      deliveredAt: info.deliveredAt,
    }));

    const grossAmount = breakdown.reduce((sum, row) => sum + row.amount, 0);
    const commissionRate = dto.commissionRate ?? DEFAULT_VENDOR_COMMISSION_RATE;
    const commissionAmount = (grossAmount * commissionRate) / 100;
    const netAmount = grossAmount - commissionAmount;
    const settlementNumber = await this.generateSettlementNumber(SettlementType.VENDOR);

    return this.prisma.settlementBatch.create({
      data: {
        settlementNumber,
        type: SettlementType.VENDOR,
        vendorKey: dto.vendorKey,
        periodStart,
        periodEnd,
        orderCount: breakdown.length,
        grossAmount,
        commissionRate,
        commissionAmount,
        netAmount,
        status: SettlementStatus.PENDING,
        orderIds: breakdown.map((row) => row.orderId),
        breakdown,
        notes: dto.notes,
        generatedById: adminId,
      },
      include: {
        generatedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async approveVendorSettlement(id: string, adminId: string) {
    const settlement = await this.prisma.settlementBatch.findFirst({
      where: { id, type: SettlementType.VENDOR },
    });
    if (!settlement) throw new NotFoundException('Vendor settlement not found');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('Settlement is not pending approval');
    }

    return this.prisma.settlementBatch.update({
      where: { id },
      data: {
        status: SettlementStatus.APPROVED,
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: {
        approvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async rejectVendorSettlement(id: string, dto: RejectSettlementDto) {
    const settlement = await this.prisma.settlementBatch.findFirst({
      where: { id, type: SettlementType.VENDOR },
    });
    if (!settlement) throw new NotFoundException('Vendor settlement not found');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('Settlement is not pending approval');
    }

    return this.prisma.settlementBatch.update({
      where: { id },
      data: {
        status: SettlementStatus.REJECTED,
        rejectedAt: new Date(),
        rejectReason: dto.reason,
      },
    });
  }
}
