import { Injectable } from '@nestjs/common';
import { ExpertCallbackStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import {
  CreateExpertCallbackDto,
  ExpertCallbackListResponseDto,
  ExpertCallbackResponseDto,
} from './dto/expert-callback.dto';

@Injectable()
export class ExpertCallbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    customerId: string,
    dto: CreateExpertCallbackDto,
  ): Promise<ExpertCallbackResponseDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        fullName: true,
        assignedExecutiveId: true,
      },
    });

    const row = await this.prisma.expertCallbackRequest.create({
      data: {
        customerId,
        contactName: dto.name.trim(),
        needs: dto.needs.trim(),
        phoneSnapshot: customer?.phone ?? null,
        categorySlug: dto.categorySlug?.trim() || null,
        categoryName: dto.categoryName?.trim() || null,
        status: ExpertCallbackStatus.NEW,
        assignedExecutiveId: customer?.assignedExecutiveId ?? null,
      },
    });

    return this.toResponse(row);
  }

  async listForCustomer(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<ExpertCallbackListResponseDto> {
    const skip = (page - 1) * limit;
    const where = { customerId };
    const [rows, total] = await Promise.all([
      this.prisma.expertCallbackRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.expertCallbackRequest.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toResponse(r)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private toResponse(row: {
    id: string;
    contactName: string;
    needs: string;
    phoneSnapshot: string | null;
    categorySlug: string | null;
    categoryName: string | null;
    status: ExpertCallbackStatus;
    createdAt: Date;
  }): ExpertCallbackResponseDto {
    return {
      id: row.id,
      contactName: row.contactName,
      needs: row.needs,
      phoneSnapshot: row.phoneSnapshot,
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
