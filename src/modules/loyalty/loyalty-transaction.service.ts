import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LoyaltyTransactionType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS } from '../../common/cache/cache.constants';
import {
  addMonths,
  availableValueInr,
  calculateEarnPoints,
  calculateMaxRedeemablePoints,
  isRedemptionEligible,
  LOYALTY_EARN_CASHBACK_PERCENT,
  LOYALTY_EARN_POINTS_PER_100_INR,
  LOYALTY_FIRST_ORDER_BONUS_POINTS,
  LOYALTY_MAX_ORDER_REDEEM_PERCENT,
  LOYALTY_MIN_REDEEM_ORDER_VALUE,
  LOYALTY_POINTS_EXPIRY_MONTHS,
  LOYALTY_POINT_VALUE_INR,
  LOYALTY_REF,
  LOYALTY_WELCOME_BONUS_POINTS,
  pointsToDiscountAmount,
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
  redemptionEligible: boolean;
  minOrderValue: number;
  pointValueInr: number;
  availableValue: number;
  message?: string;
}

@Injectable()
export class LoyaltyTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async ensureAccount(tx: Prisma.TransactionClient, customerId: string) {
    return tx.loyaltyAccount.upsert({
      where: { customerId },
      create: {
        customerId,
        currentPoints: 0,
        redeemedPoints: 0,
        availablePoints: 0,
      },
      update: {},
    });
  }

  /** Credit lots that can still be redeemed (EARN / ADJUSTMENT / ADMIN with remainingPoints). */
  private creditLotWhere(
    accountId: string,
    now: Date,
  ): Prisma.LoyaltyTransactionWhereInput {
    return {
      accountId,
      remainingPoints: { gt: 0 },
      type: {
        in: [
          LoyaltyTransactionType.EARN,
          LoyaltyTransactionType.ADJUSTMENT,
          LoyaltyTransactionType.ADMIN,
        ],
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }

  async getNonExpiredBalance(accountId: string): Promise<number> {
    const now = new Date();
    const lots = await this.prisma.loyaltyTransaction.findMany({
      where: this.creditLotWhere(accountId, now),
      select: { remainingPoints: true },
    });

    return lots.reduce((sum, lot) => sum + (lot.remainingPoints ?? 0), 0);
  }

  async getNextExpiry(accountId: string): Promise<Date | null> {
    const now = new Date();
    const lot = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        ...this.creditLotWhere(accountId, now),
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
    soft?: boolean;
  }): LoyaltyRedemptionValidation {
    const {
      requestedPoints,
      orderValueInr,
      availablePoints,
      soft = false,
    } = params;

    const base: LoyaltyRedemptionValidation = {
      requestedPoints,
      allowedPoints: 0,
      discountAmount: 0,
      remainingBalance: availablePoints,
      maxRedeemablePoints: calculateMaxRedeemablePoints(
        orderValueInr,
        availablePoints,
      ),
      redemptionEligible: isRedemptionEligible(orderValueInr),
      minOrderValue: LOYALTY_MIN_REDEEM_ORDER_VALUE,
      pointValueInr: LOYALTY_POINT_VALUE_INR,
      availableValue: availableValueInr(availablePoints),
    };

    if (requestedPoints < 0) {
      if (soft) {
        return {
          ...base,
          message: 'Points must be zero or positive',
        };
      }
      throw new BadRequestException('Points must be zero or positive');
    }

    if (requestedPoints === 0) {
      return {
        ...base,
        message: base.redemptionEligible
          ? undefined
          : `Loyalty points can be redeemed on orders of ₹${LOYALTY_MIN_REDEEM_ORDER_VALUE} or more.`,
      };
    }

    if (!base.redemptionEligible) {
      const message = `Loyalty points can be redeemed on orders of ₹${LOYALTY_MIN_REDEEM_ORDER_VALUE} or more.`;
      if (soft) {
        return { ...base, message };
      }
      throw new BadRequestException(message);
    }

    if (requestedPoints > availablePoints) {
      if (soft) {
        return { ...base, message: 'Insufficient loyalty points balance' };
      }
      throw new BadRequestException('Insufficient loyalty points balance');
    }

    const maxRedeemablePoints = base.maxRedeemablePoints;

    if (requestedPoints > maxRedeemablePoints) {
      const message = `Maximum ${maxRedeemablePoints} points can be redeemed (₹${LOYALTY_POINT_VALUE_INR}/pt, capped at ${LOYALTY_MAX_ORDER_REDEEM_PERCENT * 100}% of order value)`;
      if (soft) {
        return { ...base, message };
      }
      throw new BadRequestException(message);
    }

    const discountAmount = pointsToDiscountAmount(requestedPoints);

    return {
      ...base,
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
    try {
      const result = await this.prisma.$transaction(async (tx) =>
        this.recordEntryInTx(tx, input),
      );

      await this.cache.del(CACHE_KEYS.LOYALTY(input.customerId));
      return result.entry;
    } catch (error) {
      if (
        input.referenceId &&
        error instanceof BadRequestException &&
        String(error.message).includes('Duplicate loyalty ledger entry')
      ) {
        const account = await this.prisma.loyaltyAccount.findUnique({
          where: { customerId: input.customerId },
        });
        if (account) {
          const existing = await this.prisma.loyaltyTransaction.findFirst({
            where: {
              accountId: account.id,
              referenceId: input.referenceId,
            },
          });
          if (existing) {
            return this.mapEntry(existing, input.customerId);
          }
        }
      }
      throw error;
    }
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

    // Row-level lock prevents concurrent double-spend on the same loyalty account.
    await tx.$queryRaw`
      SELECT id FROM loyalty_accounts WHERE id = ${account.id}::uuid FOR UPDATE
    `;

    const lockedAccount = await tx.loyaltyAccount.findUniqueOrThrow({
      where: { id: account.id },
    });

    if (input.referenceId) {
      const existing = await tx.loyaltyTransaction.findFirst({
        where: {
          accountId: lockedAccount.id,
          referenceId: input.referenceId,
        },
      });
      if (existing) {
        return {
          entry: this.mapEntry(existing, input.customerId),
          accountId: existing.accountId,
        };
      }
    }
    const openingPoints = lockedAccount.availablePoints;

    let closingPoints = openingPoints;
    const accountUpdate: Prisma.LoyaltyAccountUpdateInput = {};

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
    } else {
      throw new BadRequestException(
        `Unsupported transaction type: ${input.type}`,
      );
    }

    if (input.type === LoyaltyTransactionType.REDEEM) {
      const lotBalance = await this.getNonExpiredBalanceInTx(
        tx,
        lockedAccount.id,
      );
      if (lotBalance < points) {
        throw new BadRequestException(
          'Insufficient non-expired loyalty points to redeem',
        );
      }
      await this.consumePointsFromLots(tx, lockedAccount.id, points);
    }

    if (
      input.type === LoyaltyTransactionType.ADJUSTMENT &&
      input.direction === 'DEBIT'
    ) {
      const lotBalance = await this.getNonExpiredBalanceInTx(
        tx,
        lockedAccount.id,
      );
      if (lotBalance < points) {
        throw new BadRequestException('Insufficient loyalty points for debit');
      }
      await this.consumePointsFromLots(tx, lockedAccount.id, points);
    }

    await tx.loyaltyAccount.update({
      where: { id: lockedAccount.id },
      data: accountUpdate,
    });

    try {
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
              input.type === LoyaltyTransactionType.ADJUSTMENT ||
              input.type === LoyaltyTransactionType.ADMIN)
              ? points
              : null,
        },
      });

      return {
        entry: this.mapEntry(transaction, input.customerId),
        accountId: account.id,
      };
    } catch (error) {
      // Abort the interactive transaction so balance updates roll back on race.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        input.referenceId
      ) {
        throw new BadRequestException(
          `Duplicate loyalty ledger entry: ${input.referenceId}`,
        );
      }
      throw error;
    }
  }

  /** Registration welcome bonus (+50 BajriPro Points, once). Idempotent via WELCOME_BONUS ref. */
  async creditWelcomeBonus(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LoyaltyLedgerEntryResult | null> {
    if (LOYALTY_WELCOME_BONUS_POINTS <= 0) {
      return null;
    }
    const expiresAt = addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS);
    const input: LoyaltyLedgerEntryInput = {
      customerId,
      type: LoyaltyTransactionType.EARN,
      points: LOYALTY_WELCOME_BONUS_POINTS,
      reason: 'Welcome BajriPro Points bonus',
      referenceId: LOYALTY_REF.WELCOME_BONUS,
      expiresAt,
      trackLot: true,
    };

    if (tx) {
      const result = await this.recordEntryInTx(tx, input);
      return result.entry;
    }

    return this.recordEntry(input);
  }

  /** First successfully completed (DELIVERED) order bonus. Disabled when points = 0. Idempotent. */
  async creditFirstOrderBonus(
    customerId: string,
    orderId: string,
    orderNumber: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LoyaltyLedgerEntryResult | null> {
    if (LOYALTY_FIRST_ORDER_BONUS_POINTS <= 0) {
      return null;
    }
    const expiresAt = addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS);
    const input: LoyaltyLedgerEntryInput = {
      customerId,
      type: LoyaltyTransactionType.EARN,
      points: LOYALTY_FIRST_ORDER_BONUS_POINTS,
      reason: `First order BajriPro Points bonus (${orderNumber})`,
      referenceId: LOYALTY_REF.FIRST_ORDER_BONUS,
      referenceOrderId: orderId,
      expiresAt,
      trackLot: true,
    };

    if (tx) {
      const result = await this.recordEntryInTx(tx, input);
      return result.entry;
    }

    return this.recordEntry(input);
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
      referenceId: LOYALTY_REF.redeem(params.orderId),
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
      throw new BadRequestException(
        'Loyalty points already redeemed for this order',
      );
    }

    const orderValueInr = this.eligibleOrderValue(order);

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
      referenceId: LOYALTY_REF.redeem(order.id),
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

    const orderValueInr = this.eligibleOrderValue(order);

    const availablePoints = await this.getNonExpiredBalanceForCustomer(
      params.customerId,
    );

    const validation = this.validateRedemption({
      requestedPoints: params.points,
      orderValueInr,
      availablePoints,
      soft: true,
    });

    return {
      ...validation,
      orderNumber: order.orderNumber,
    };
  }

  /**
   * Eligible spend for earn: product subtotal after membership discount.
   * Excludes loyalty discount (not in subtotal), delivery, and GST — avoids circular rewards.
   */
  eligibleEarnAmount(order: {
    subtotal: Prisma.Decimal | number;
    membershipDiscount: Prisma.Decimal | number;
  }): number {
    const subtotal = Number(order.subtotal);
    const membershipDiscount = Number(order.membershipDiscount);
    return Math.max(0, subtotal - membershipDiscount);
  }

  eligibleOrderValue(order: {
    subtotal: Prisma.Decimal | number;
    gstAmount: Prisma.Decimal | number;
    deliveryCharge: Prisma.Decimal | number;
    membershipDiscount: Prisma.Decimal | number;
    loadingCharges?: Prisma.Decimal | number;
    unloadingCharges?: Prisma.Decimal | number;
  }): number {
    return (
      Number(order.subtotal) +
      Number(order.gstAmount) +
      Number(order.deliveryCharge) +
      Number(order.loadingCharges ?? 0) +
      Number(order.unloadingCharges ?? 0) -
      Number(order.membershipDiscount)
    );
  }

  async earnForDeliveredOrder(orderId: string): Promise<{
    orderEarned: LoyaltyLedgerEntryResult | null;
    firstOrderBonus: LoyaltyLedgerEntryResult | null;
  }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });

    if (!order || order.orderStatus !== 'DELIVERED') {
      return { orderEarned: null, firstOrderBonus: null };
    }

    const earnAmount = this.eligibleEarnAmount(order);
    const points = calculateEarnPoints(earnAmount);
    const expiresAt = addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS);

    let orderEarned: LoyaltyLedgerEntryResult | null = null;

    if (points > 0) {
      orderEarned = await this.recordEntry({
        customerId: order.customerId,
        type: LoyaltyTransactionType.EARN,
        points,
        reason: `Points earned on order ${order.orderNumber}`,
        referenceId: LOYALTY_REF.orderEarned(order.id),
        referenceOrderId: order.id,
        expiresAt,
        trackLot: true,
      });
    }

    const firstOrderBonus = await this.maybeCreditFirstOrderBonus(order);

    return { orderEarned, firstOrderBonus };
  }

  private async maybeCreditFirstOrderBonus(order: {
    id: string;
    customerId: string;
    orderNumber: string;
  }): Promise<LoyaltyLedgerEntryResult | null> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId: order.customerId },
    });

    if (account) {
      const existing = await this.prisma.loyaltyTransaction.findFirst({
        where: {
          accountId: account.id,
          referenceId: LOYALTY_REF.FIRST_ORDER_BONUS,
        },
      });
      if (existing) return null;
    }

    const priorDelivered = await this.prisma.order.count({
      where: {
        customerId: order.customerId,
        orderStatus: 'DELIVERED',
        deletedAt: null,
        id: { not: order.id },
      },
    });

    if (priorDelivered > 0) {
      return null;
    }

    return this.creditFirstOrderBonus(
      order.customerId,
      order.id,
      order.orderNumber,
    );
  }

  async refundRedemptionForCancelledOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });

    if (!order) return;

    if (order.loyaltyPointsUsed > 0) {
      const expiresAt = addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS);
      await this.recordEntry({
        customerId: order.customerId,
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: order.loyaltyPointsUsed,
        reason: `Refund for cancelled order ${order.orderNumber}`,
        referenceId: LOYALTY_REF.refundRestore(order.id),
        referenceOrderId: order.id,
        expiresAt,
        trackLot: true,
      });
    }

    await this.reverseEarnedPointsForOrder(order);
  }

  private async reverseEarnedPointsForOrder(order: {
    id: string;
    customerId: string;
    orderNumber: string;
  }): Promise<void> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId: order.customerId },
    });
    if (!account) return;

    const earnTx = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        accountId: account.id,
        referenceId: LOYALTY_REF.orderEarned(order.id),
        type: LoyaltyTransactionType.EARN,
      },
    });

    if (earnTx && earnTx.points > 0) {
      await this.recordEntry({
        customerId: order.customerId,
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: earnTx.points,
        reason: `Earn reversal for cancelled order ${order.orderNumber}`,
        referenceId: LOYALTY_REF.earnReversal(order.id),
        referenceOrderId: order.id,
        direction: 'DEBIT',
      });
    }

    const firstBonus = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        accountId: account.id,
        referenceId: LOYALTY_REF.FIRST_ORDER_BONUS,
        referenceOrderId: order.id,
        type: LoyaltyTransactionType.EARN,
      },
    });

    if (firstBonus && firstBonus.points > 0) {
      await this.recordEntry({
        customerId: order.customerId,
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: firstBonus.points,
        reason: `First-order bonus reversal for cancelled order ${order.orderNumber}`,
        referenceId: LOYALTY_REF.firstOrderReversal(order.id),
        referenceOrderId: order.id,
        direction: 'DEBIT',
      });
    }
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

    await this.prisma.loyaltyAccount.update({
      where: { id: accountId },
      data: {
        availablePoints: balance,
      },
    });

    return balance;
  }

  buildSummary(
    account: {
      id: string;
      customerId: string;
      currentPoints: number;
      redeemedPoints: number;
      availablePoints: number;
    },
    redeemablePoints: number,
    nextExpiry: Date | null,
  ) {
    return {
      id: account.id,
      customerId: account.customerId,
      currentPoints: account.currentPoints,
      lifetimeEarned: account.currentPoints,
      redeemedPoints: account.redeemedPoints,
      lifetimeRedeemed: account.redeemedPoints,
      availablePoints: redeemablePoints,
      availableValue: availableValueInr(redeemablePoints),
      redeemablePoints,
      nextExpiry: nextExpiry?.toISOString() ?? null,
      minRedeemPoints: LOYALTY_MIN_REDEEM_ORDER_VALUE,
      minRedeemOrderValue: LOYALTY_MIN_REDEEM_ORDER_VALUE,
      pointValueInr: LOYALTY_POINT_VALUE_INR,
      maxOrderRedeemPercent: LOYALTY_MAX_ORDER_REDEEM_PERCENT * 100,
      welcomeBonus: LOYALTY_WELCOME_BONUS_POINTS,
      firstOrderBonus: LOYALTY_FIRST_ORDER_BONUS_POINTS,
      earnCashbackPercent: LOYALTY_EARN_CASHBACK_PERCENT,
      earnPointsPer100Inr: LOYALTY_EARN_POINTS_PER_100_INR,
    };
  }

  private async getNonExpiredBalanceInTx(
    tx: Prisma.TransactionClient,
    accountId: string,
  ): Promise<number> {
    const now = new Date();
    const lots = await tx.loyaltyTransaction.findMany({
      where: this.creditLotWhere(accountId, now),
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
      where: this.creditLotWhere(accountId, now),
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
