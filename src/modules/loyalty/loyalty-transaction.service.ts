import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LoyaltyTier,
  LoyaltyTransactionType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS } from '../../common/cache/cache.constants';
import {
  addMonths,
  calculateEarnPoints,
  calculateMaxRedeemablePoints,
  getNextTierInfo,
  LOYALTY_MIN_REDEEM_POINTS,
  LOYALTY_POINTS_EXPIRY_MONTHS,
  LOYALTY_POINT_VALUE_INR,
  pointsToDiscountAmount,
  resolveTierFromPoints,
} from './loyalty.constants';

export interface LoyaltyLedgerEntryInput {
  customerId: string;
  type: LoyaltyTransactionType;
  points: number;
  reason: string;
  referenceId?: string;
  referenceOrderId?: string;
  expiresAt?: Date | null;
  trackLot?: boolean;
  direction?: 'CREDIT' | 'DEBIT';
}

export interface LoyaltyLedgerEntryResult {
  id: string;
  accountId: string;
  customerId: string;
  type: LoyaltyTransactionType;
  points: number;
  openingPoints: number;
  closingPoints: number;
  reason: string;
  referenceId: string | null;
  referenceOrderId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface LoyaltyRedemptionValidation {
  requestedPoints: number;
  allowedPoints: number;
  discountAmount: number;
  remainingBalance: number;
  maxRedeemablePoints: number;
}

@Injectable()
export class LoyaltyTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async ensureAccount(
    tx: Prisma.TransactionClient,
    customerId: string,
  ) {
    return tx.loyaltyAccount.upsert({
      where: { customerId },
      create: {
        customerId,
        currentPoints: 0,
        redeemedPoints: 0,
        availablePoints: 0,
        tier: LoyaltyTier.BRONZE,
      },
      update: {},
    });
  }

  async getNonExpiredBalance(accountId: string): Promise<number> {
    const now = new Date();
    const lots = await this.prisma.loyaltyTransaction.findMany({
      where: {
        accountId,
        type: LoyaltyTransactionType.EARN,
        remainingPoints: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { remainingPoints: true },
    });

    return lots.reduce((sum, lot) => sum + (lot.remainingPoints ?? 0), 0);
  }

  async getNextExpiry(accountId: string): Promise<Date | null> {
    const now = new Date();
    const lot = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        accountId,
        type: LoyaltyTransactionType.EARN,
        remainingPoints: { gt: 0 },
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    });

    return lot?.expiresAt ?? null;
  }

  validateRedemption(params: {
    requestedPoints: number;
    orderValueInr: number;
    availablePoints: number;
  }): LoyaltyRedemptionValidation {
    const { requestedPoints, orderValueInr, availablePoints } = params;

    if (requestedPoints < 0) {
      throw new BadRequestException('Points must be zero or positive');
    }

    if (requestedPoints === 0) {
      return {
        requestedPoints: 0,
        allowedPoints: 0,
        discountAmount: 0,
        remainingBalance: availablePoints,
        maxRedeemablePoints: calculateMaxRedeemablePoints(
          orderValueInr,
          availablePoints,
        ),
      };
    }

    if (requestedPoints < LOYALTY_MIN_REDEEM_POINTS) {
      throw new BadRequestException(
        `Minimum ${LOYALTY_MIN_REDEEM_POINTS} points required to redeem`,
      );
    }

    if (requestedPoints > availablePoints) {
      throw new BadRequestException('Insufficient loyalty points balance');
    }

    const maxRedeemablePoints = calculateMaxRedeemablePoints(
      orderValueInr,
      availablePoints,
    );

    if (requestedPoints > maxRedeemablePoints) {
      throw new BadRequestException(
        `Maximum ${maxRedeemablePoints} points (${LOYALTY_POINT_VALUE_INR} point = ₹1, capped at 30% of order value)`,
      );
    }

    const discountAmount = pointsToDiscountAmount(requestedPoints);

    return {
      requestedPoints,
      allowedPoints: requestedPoints,
      discountAmount,
      remainingBalance: availablePoints - requestedPoints,
      maxRedeemablePoints,
    };
  }

  async recordEntry(
    input: LoyaltyLedgerEntryInput,
  ): Promise<LoyaltyLedgerEntryResult> {
    const result = await this.prisma.$transaction(async (tx) =>
      this.recordEntryInTx(tx, input),
    );

    await this.cache.del(CACHE_KEYS.LOYALTY(input.customerId));
    return result.entry;
  }

  async recordEntryInTx(
    tx: Prisma.TransactionClient,
    input: LoyaltyLedgerEntryInput,
  ): Promise<{ entry: LoyaltyLedgerEntryResult; accountId: string }> {
    const points = Math.abs(Math.trunc(input.points));
    if (points <= 0) {
      throw new BadRequestException('Points must be greater than zero');
    }

    const account = await this.ensureAccount(tx, input.customerId);
    const openingPoints = account.availablePoints;

    let closingPoints = openingPoints;
    const accountUpdate: Prisma.LoyaltyAccountUpdateInput = {
      tier: resolveTierFromPoints(account.currentPoints),
    };

    const isCredit =
      input.type === LoyaltyTransactionType.EARN ||
      input.type === LoyaltyTransactionType.ADMIN ||
      (input.type === LoyaltyTransactionType.ADJUSTMENT &&
        input.direction !== 'DEBIT');

    const isDebit =
      input.type === LoyaltyTransactionType.REDEEM ||
      input.type === LoyaltyTransactionType.EXPIRE ||
      (input.type === LoyaltyTransactionType.ADJUSTMENT &&
        input.direction === 'DEBIT');

    if (isCredit) {
      closingPoints = openingPoints + points;
      accountUpdate.availablePoints = { increment: points };
      accountUpdate.currentPoints = { increment: points };
      accountUpdate.tier = resolveTierFromPoints(
        account.currentPoints + points,
      );
    } else if (isDebit) {
      if (openingPoints < points) {
        throw new BadRequestException('Insufficient loyalty points');
      }
      closingPoints = openingPoints - points;
      accountUpdate.availablePoints = { decrement: points };
      if (input.type === LoyaltyTransactionType.REDEEM) {
        accountUpdate.redeemedPoints = { increment: points };
      } else if (
        input.type === LoyaltyTransactionType.EXPIRE ||
        (input.type === LoyaltyTransactionType.ADJUSTMENT &&
          input.direction === 'DEBIT')
      ) {
        accountUpdate.currentPoints = { decrement: points };
      }
      accountUpdate.tier = resolveTierFromPoints(
        Math.max(0, account.currentPoints - points),
      );
    } else {
      throw new BadRequestException(`Unsupported transaction type: ${input.type}`);
    }

    if (input.type === LoyaltyTransactionType.REDEEM) {
      const lotBalance = await this.getNonExpiredBalanceInTx(tx, account.id);
      if (lotBalance < points) {
        throw new BadRequestException(
          'Insufficient non-expired loyalty points to redeem',
        );
      }
      await this.consumePointsFromLots(tx, account.id, points);
    }

    if (
      input.type === LoyaltyTransactionType.ADJUSTMENT &&
      input.direction === 'DEBIT'
    ) {
      const lotBalance = await this.getNonExpiredBalanceInTx(tx, account.id);
      if (lotBalance < points) {
        throw new BadRequestException('Insufficient loyalty points for debit');
      }
      await this.consumePointsFromLots(tx, account.id, points);
    }

    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: accountUpdate,
    });

    const transaction = await tx.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        points,
        type: input.type,
        reason: input.reason,
        referenceId: input.referenceId,
        referenceOrderId: input.referenceOrderId,
        openingPoints,
        closingPoints,
        expiresAt: input.expiresAt ?? null,
          remainingPoints:
            input.trackLot &&
            (input.type === LoyaltyTransactionType.EARN ||
              input.type === LoyaltyTransactionType.ADJUSTMENT)
              ? points
              : null,
      },
    });

    return {
      entry: this.mapEntry(transaction, input.customerId),
      accountId: account.id,
    };
  }

  async commitRedemptionForPlacedOrder(params: {
    customerId: string;
    orderId: string;
    orderNumber: string;
    points: number;
    tx: Prisma.TransactionClient;
  }): Promise<void> {
    if (params.points <= 0) return;

    await this.recordEntryInTx(params.tx, {
      customerId: params.customerId,
      type: LoyaltyTransactionType.REDEEM,
      points: params.points,
      reason: `Redeemed for order ${params.orderNumber}`,
      referenceId: params.orderId,
      referenceOrderId: params.orderId,
    });
  }

  async redeemForOrder(params: {
    customerId: string;
    orderId: string;
    points: number;
  }): Promise<LoyaltyLedgerEntryResult & LoyaltyRedemptionValidation> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: params.orderId,
        customerId: params.customerId,
        deletedAt: null,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.loyaltyPointsUsed > 0) {
      throw new BadRequestException('Loyalty points already redeemed for this order');
    }

    const orderValueInr =
      Number(order.subtotal) +
      Number(order.gstAmount) +
      Number(order.deliveryCharge) -
      Number(order.membershipDiscount);

    const availablePoints = await this.getNonExpiredBalanceForCustomer(
      params.customerId,
    );

    const validation = this.validateRedemption({
      requestedPoints: params.points,
      orderValueInr,
      availablePoints,
    });

    if (validation.allowedPoints <= 0) {
      throw new BadRequestException('No loyalty points to redeem');
    }

    const entry = await this.recordEntry({
      customerId: params.customerId,
      type: LoyaltyTransactionType.REDEEM,
      points: validation.allowedPoints,
      reason: `Redeemed for order ${order.orderNumber}`,
      referenceId: order.id,
      referenceOrderId: order.id,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        loyaltyPointsUsed: validation.allowedPoints,
        discountAmount: {
          increment: validation.discountAmount,
        },
        grandTotal: {
          decrement: validation.discountAmount,
        },
      },
    });

    return { ...entry, ...validation };
  }

  async previewRedemption(params: {
    customerId: string;
    orderId: string;
    points: number;
  }): Promise<LoyaltyRedemptionValidation & { orderNumber: string }> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: params.orderId,
        customerId: params.customerId,
        deletedAt: null,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const orderValueInr =
      Number(order.subtotal) +
      Number(order.gstAmount) +
      Number(order.deliveryCharge) -
      Number(order.membershipDiscount);

    const availablePoints = await this.getNonExpiredBalanceForCustomer(
      params.customerId,
    );

    const validation = this.validateRedemption({
      requestedPoints: params.points,
      orderValueInr,
      availablePoints,
    });

    return {
      ...validation,
      orderNumber: order.orderNumber,
    };
  }

  async earnForDeliveredOrder(orderId: string): Promise<LoyaltyLedgerEntryResult | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });

    if (!order || order.orderStatus !== 'DELIVERED') {
      return null;
    }

    const existingEarn = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        referenceOrderId: order.id,
        type: LoyaltyTransactionType.EARN,
      },
    });

    if (existingEarn) {
      return null;
    }

    const points = calculateEarnPoints(Number(order.subtotal));
    if (points <= 0) {
      return null;
    }

    const expiresAt = addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS);

    return this.recordEntry({
      customerId: order.customerId,
      type: LoyaltyTransactionType.EARN,
      points,
      reason: `Points earned on order ${order.orderNumber}`,
      referenceId: order.id,
      referenceOrderId: order.id,
      expiresAt,
      trackLot: true,
    });
  }

  async refundRedemptionForCancelledOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });

    if (!order || order.loyaltyPointsUsed <= 0) {
      return;
    }

    const existingRefund = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        referenceOrderId: order.id,
        type: LoyaltyTransactionType.ADJUSTMENT,
        reason: { contains: 'Refund for cancelled order' },
      },
    });

    if (existingRefund) {
      return;
    }

    const expiresAt = addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS);

    await this.recordEntry({
      customerId: order.customerId,
      type: LoyaltyTransactionType.ADJUSTMENT,
      points: order.loyaltyPointsUsed,
      reason: `Refund for cancelled order ${order.orderNumber}`,
      referenceId: order.id,
      referenceOrderId: order.id,
      expiresAt,
      trackLot: true,
    });
  }

  async getNonExpiredBalanceForCustomer(customerId: string): Promise<number> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (!account) {
      return 0;
    }

    return this.getNonExpiredBalance(account.id);
  }

  async syncAccountBalance(accountId: string): Promise<number> {
    const balance = await this.getNonExpiredBalance(accountId);
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return 0;
    }

    const tier = resolveTierFromPoints(account.currentPoints);
    await this.prisma.loyaltyAccount.update({
      where: { id: accountId },
      data: {
        availablePoints: balance,
        tier,
      },
    });

    return balance;
  }

  buildSummary(account: {
    id: string;
    customerId: string;
    currentPoints: number;
    redeemedPoints: number;
    availablePoints: number;
    tier: LoyaltyTier;
  }, redeemablePoints: number, nextExpiry: Date | null) {
    const tierInfo = getNextTierInfo(account.currentPoints);

    return {
      id: account.id,
      customerId: account.customerId,
      currentPoints: account.currentPoints,
      redeemedPoints: account.redeemedPoints,
      availablePoints: redeemablePoints,
      tier: resolveTierFromPoints(account.currentPoints),
      redeemablePoints,
      nextTier: tierInfo.nextTier,
      pointsToNextTier: tierInfo.pointsToNextTier,
      tierProgress: tierInfo.tierProgress,
      nextExpiry: nextExpiry?.toISOString() ?? null,
      minRedeemPoints: LOYALTY_MIN_REDEEM_POINTS,
      pointValueInr: LOYALTY_POINT_VALUE_INR,
      maxOrderRedeemPercent: 30,
    };
  }

  private async getNonExpiredBalanceInTx(
    tx: Prisma.TransactionClient,
    accountId: string,
  ): Promise<number> {
    const now = new Date();
    const lots = await tx.loyaltyTransaction.findMany({
      where: {
        accountId,
        type: LoyaltyTransactionType.EARN,
        remainingPoints: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { remainingPoints: true },
    });

    return lots.reduce((sum, lot) => sum + (lot.remainingPoints ?? 0), 0);
  }

  private async consumePointsFromLots(
    tx: Prisma.TransactionClient,
    accountId: string,
    pointsToConsume: number,
  ): Promise<void> {
    const now = new Date();
    let remaining = pointsToConsume;

    const lots = await tx.loyaltyTransaction.findMany({
      where: {
        accountId,
        type: LoyaltyTransactionType.EARN,
        remainingPoints: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = lot.remainingPoints ?? 0;
      const deduct = Math.min(available, remaining);

      await tx.loyaltyTransaction.update({
        where: { id: lot.id },
        data: { remainingPoints: available - deduct },
      });

      remaining -= deduct;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        'Insufficient non-expired loyalty points to redeem',
      );
    }
  }

  private mapEntry(
    transaction: {
      id: string;
      accountId: string;
      points: number;
      type: LoyaltyTransactionType;
      reason: string;
      referenceId: string | null;
      referenceOrderId: string | null;
      openingPoints: number | null;
      closingPoints: number | null;
      expiresAt: Date | null;
      createdAt: Date;
    },
    customerId: string,
  ): LoyaltyLedgerEntryResult {
    return {
      id: transaction.id,
      accountId: transaction.accountId,
      customerId,
      type: transaction.type,
      points: transaction.points,
      openingPoints: transaction.openingPoints ?? 0,
      closingPoints: transaction.closingPoints ?? 0,
      reason: transaction.reason,
      referenceId: transaction.referenceId,
      referenceOrderId: transaction.referenceOrderId,
      expiresAt: transaction.expiresAt,
      createdAt: transaction.createdAt,
    };
  }
}
