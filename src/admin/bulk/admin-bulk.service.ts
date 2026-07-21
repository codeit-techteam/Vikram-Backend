import { Injectable, NotFoundException } from '@nestjs/common';
import { BulkEnquiryStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { BulkQueryDto, UpdateBulkStatusDto, AssignExecutiveDto } from './dto/admin-bulk.dto';

@Injectable()
export class AdminBulkService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: BulkQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.status) where['status'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.bulkEnquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { id: true, phone: true, fullName: true } } },
      }),
      this.prisma.bulkEnquiry.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const enquiry = await this.prisma.bulkEnquiry.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!enquiry) throw new NotFoundException('Bulk enquiry not found');
    return enquiry;
  }

  async assignExecutive(id: string, dto: AssignExecutiveDto) {
    await this.findOne(id);
    return this.prisma.bulkEnquiry.update({
      where: { id },
      data: { assignedExecutive: dto.assignedExecutive, status: 'IN_PROGRESS' },
    });
  }

  async updateStatus(id: string, dto: UpdateBulkStatusDto) {
    await this.findOne(id);
    return this.prisma.bulkEnquiry.update({
      where: { id },
      data: { status: dto.status as BulkEnquiryStatus, remarks: dto.remarks },
    });
  }

  async reject(id: string, remarks?: string) {
    await this.findOne(id);
    return this.prisma.bulkEnquiry.update({
      where: { id },
      data: { status: BulkEnquiryStatus.CANCELLED, remarks },
    });
  }

  async approve(id: string) {
    await this.findOne(id);
    return this.prisma.bulkEnquiry.update({ where: { id }, data: { status: BulkEnquiryStatus.IN_PROGRESS } });
  }

  async sendQuotation(id: string, remarks?: string) {
    await this.findOne(id);
    return this.prisma.bulkEnquiry.update({
      where: { id },
      data: { status: BulkEnquiryStatus.QUOTED, remarks },
    });
  }

  async complete(id: string) {
    await this.findOne(id);
    return this.prisma.bulkEnquiry.update({ where: { id }, data: { status: BulkEnquiryStatus.COMPLETED } });
  }
}
