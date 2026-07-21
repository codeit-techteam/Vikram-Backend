import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  BulkEnquiryListResponseDto,
  BulkEnquiryResponseDto,
  CreateBulkEnquiryDto,
} from './dto/bulk.dto';

@Injectable()
export class BulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async createEnquiry(
    customerId: string,
    dto: CreateBulkEnquiryDto,
  ): Promise<BulkEnquiryResponseDto> {
    const enquiry = await this.prisma.bulkEnquiry.create({
      data: {
        customerId,
        companyName: dto.companyName,
        projectName: dto.projectName,
        location: dto.location,
        remarks: dto.remarks ?? null,
        expectedQuantity: dto.expectedQuantity,
      },
    });

    await this.cache.del(CACHE_KEYS.BULK(customerId));
    return this.mapEnquiry(enquiry);
  }

  async listEnquiries(customerId: string): Promise<BulkEnquiryListResponseDto> {
    const cacheKey = CACHE_KEYS.BULK(customerId);
    const cached = await this.cache.get<BulkEnquiryListResponseDto>(cacheKey);
    if (cached) return cached;

    const [items, total] = await Promise.all([
      this.prisma.bulkEnquiry.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bulkEnquiry.count({ where: { customerId } }),
    ]);

    const result: BulkEnquiryListResponseDto = {
      items: items.map((e) => this.mapEnquiry(e)),
      total,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.BULK);
    return result;
  }

  async getEnquiryById(
    customerId: string,
    id: string,
  ): Promise<BulkEnquiryResponseDto> {
    const cacheKey = CACHE_KEYS.BULK_DETAIL(customerId, id);
    const cached = await this.cache.get<BulkEnquiryResponseDto>(cacheKey);
    if (cached) return cached;

    const enquiry = await this.prisma.bulkEnquiry.findFirst({
      where: { id, customerId },
    });

    if (!enquiry) {
      throw new NotFoundException('Bulk enquiry not found');
    }

    const result = this.mapEnquiry(enquiry);
    await this.cache.set(cacheKey, result, CACHE_TTL.BULK);
    return result;
  }

  private mapEnquiry(enquiry: {
    id: string;
    customerId: string;
    companyName: string;
    projectName: string;
    location: string;
    remarks: string | null;
    expectedQuantity: number;
    status: BulkEnquiryResponseDto['status'];
    assignedExecutive: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): BulkEnquiryResponseDto {
    return {
      id: enquiry.id,
      customerId: enquiry.customerId,
      companyName: enquiry.companyName,
      projectName: enquiry.projectName,
      location: enquiry.location,
      remarks: enquiry.remarks,
      expectedQuantity: enquiry.expectedQuantity,
      status: enquiry.status,
      assignedExecutive: enquiry.assignedExecutive,
      createdAt: enquiry.createdAt.toISOString(),
      updatedAt: enquiry.updatedAt.toISOString(),
    };
  }
}
