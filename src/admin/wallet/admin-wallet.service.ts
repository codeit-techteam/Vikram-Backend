import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { WalletTransactionStatus, WalletTransactionType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { WalletTransactionDto, WalletQueryDto } from './dto/admin-wallet.dto';

@Injectable()
export class AdminWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWallets(query: WalletQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.wallet.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { customer: { select: { id: true, phone: true, fullName: true } } },
      }),
      this.prisma.wallet.count(),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findWalletByCustomer(customerId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getWalletHistory(query: WalletQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.customerId) {
      const wallet = await this.prisma.wallet.findUnique({ where: { customerId: query.customerId } });
      if (wallet) where['walletId'] = wallet.id;
    }

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { wallet: { include: { customer: { select: { phone: true, fullName: true } } } } },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async creditWallet(customerId: string, dto: WalletTransactionDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { customerId } });
    if (!wallet) throw new NotFoundException('Wallet not found for this customer');

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: dto.amount } },
      });
      return tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT,
          amount: dto.amount,
          reason: dto.reason,
          referenceId: dto.referenceId,
          referenceType: 'ADMIN',
          status: WalletTransactionStatus.SUCCESS,
        },
      });
    });
  }

  async debitWallet(customerId: string, dto: WalletTransactionDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { customerId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (Number(wallet.balance) < dto.amount) throw new BadRequestException('Insufficient wallet balance');

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: dto.amount } },
      });
      return tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.DEBIT,
          amount: dto.amount,
          reason: dto.reason,
          referenceId: dto.referenceId,
          referenceType: 'ADMIN',
          status: WalletTransactionStatus.SUCCESS,
        },
      });
    });
  }

  async refundWallet(customerId: string, dto: WalletTransactionDto) {
    return this.creditWallet(customerId, { ...dto, reason: `REFUND: ${dto.reason}` });
  }
}
