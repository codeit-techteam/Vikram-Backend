import { Injectable, Logger } from '@nestjs/common';
import {
  WalletCreditStatus,
  WalletCreditType,
  WalletTransactionStatus,
  WalletTransactionType,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { CACHE_KEYS } from '../../../common/cache/cache.constants';
import type { JobRunResult } from './scheduler-log.service';

@Injectable()
export class WalletCleanupService {
  private readonly logger = new Logger(WalletCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Expire cashback + promotional credit lots.
   * Purchase wallet credits (expiresAt = null / type = PURCHASE) are never touched.
   */
  async cleanupExpiredCredits(): Promise<JobRunResult> {
    const now = new Date();
    const lots = await this.prisma.walletCreditLot.findMany({
      where: {
        status: WalletCreditStatus.ACTIVE,
        type: {
          in: [WalletCreditType.CASHBACK, WalletCreditType.PROMOTIONAL],
        },
        expiresAt: { lte: now },
        remainingAmount: { gt: 0 },
      },
      include: {
        wallet: { select: { id: true, customerId: true, balance: true } },
      },
      take: 500,
    });

    let successCount = 0;
    let failedCount = 0;

    for (const lot of lots) {
      try {
        const amount = Number(lot.remainingAmount);
        if (amount <= 0) continue;

        await this.prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findUnique({
            where: { id: lot.walletId },
          });
          if (!wallet) return;

          const debitAmount = Math.min(amount, Number(wallet.balance));

          if (debitAmount > 0) {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                balance: { decrement: debitAmount },
                totalDebits: { increment: debitAmount },
              },
            });

            await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                type: WalletTransactionType.DEBIT,
                amount: debitAmount,
                reason: 'Expired Promotional Credit',
                referenceId: lot.id,
                referenceType: 'WALLET_CREDIT_LOT',
                status: WalletTransactionStatus.SUCCESS,
              },
            });
          }

          await tx.walletCreditLot.update({
            where: { id: lot.id },
            data: {
              remainingAmount: 0,
              status: WalletCreditStatus.EXPIRED,
            },
          });
        });

        await this.cache.del(CACHE_KEYS.WALLET(lot.wallet.customerId));
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to expire wallet credit lot ${lot.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      processedCount: lots.length,
      successCount,
      failedCount,
      metadata: { batchSize: lots.length },
    };
  }
}
