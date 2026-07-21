import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  WalletHistoryResponseDto,
  WalletSummaryDto,
  WalletTransactionResponseDto,
} from './dto/wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getWalletSummary(customerId: string): Promise<WalletSummaryDto> {
    const cacheKey = CACHE_KEYS.WALLET(customerId);
    const cached = await this.cache.get<WalletSummaryDto>(cacheKey);
    if (cached) return cached;

    const wallet = await this.ensureWallet(customerId);
    const result = this.mapWallet(wallet);
    await this.cache.set(cacheKey, result, CACHE_TTL.WALLET);
    return result;
  }

  async getWalletHistory(customerId: string): Promise<WalletHistoryResponseDto> {
    const wallet = await this.ensureWallet(customerId);

    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      wallet: this.mapWallet(wallet),
      transactions: transactions.map((t) => this.mapTransaction(t)),
    };
  }

  async getBalance(customerId: string): Promise<number> {
    const summary = await this.getWalletSummary(customerId);
    return summary.balance;
  }

  private async ensureWallet(customerId: string) {
    return this.prisma.wallet.upsert({
      where: { customerId },
      create: { customerId, balance: 0 },
      update: {},
    });
  }

  private mapWallet(wallet: {
    id: string;
    customerId: string;
    balance: unknown;
    updatedAt: Date;
  }): WalletSummaryDto {
    return {
      id: wallet.id,
      customerId: wallet.customerId,
      balance: Number(wallet.balance),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  private mapTransaction(tx: {
    id: string;
    type: WalletTransactionResponseDto['type'];
    amount: unknown;
    reason: string;
    referenceId: string | null;
    referenceType: string | null;
    status: WalletTransactionResponseDto['status'];
    createdAt: Date;
  }): WalletTransactionResponseDto {
    const amount = Number(tx.amount);
    const isCredit = tx.type === 'CREDIT' || tx.type === 'REFUND';

    return {
      id: tx.id,
      type: tx.type,
      credit: isCredit ? amount : 0,
      debit: isCredit ? 0 : amount,
      reason: tx.reason,
      referenceId: tx.referenceId,
      referenceType: tx.referenceType,
      status: tx.status,
      createdAt: tx.createdAt.toISOString(),
    };
  }
}
