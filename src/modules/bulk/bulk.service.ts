import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BulkActivityType,
  BulkEnquiryStatus,
  BulkPreferredContact,
  BulkQuotationStatus,
  NotificationType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { NotificationService } from '../notification/notification.service';
import { CATEGORY_SLUGS } from '../catalog/catalog.constants';
import {
  BULK_COMMON_UNITS,
  MIXED_LOAD_SLUG,
  brickFormOptions,
  customerFacingBulkStatus,
  decimalToNumber,
  deliveryRequirementOptions,
  formatBulkEnquiryNumber,
  isBricksCategorySlug,
  normalizeContactPhone,
  normalizeUnit,
  optionalDecimalToNumber,
  preferredContactOptions,
  validateBrickGrade,
  validateBrickProductType,
} from './bulk.constants';
import {
  BulkEnquiryListQueryDto,
  BulkEnquiryListResponseDto,
  BulkEnquiryResponseDto,
  BulkFormConfigDto,
  CreateBulkEnquiryDto,
} from './dto/bulk.dto';

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string | null;
};

type EnquiryWithRelations = Prisma.BulkEnquiryGetPayload<{
  include: {
    assignedExecutiveUser: { select: { id: true; fullName: true } };
    quotations: true;
  };
}>;

@Injectable()
export class BulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  async getFormConfig(): Promise<BulkFormConfigDto> {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        isVisible: true,
        parentId: null,
        status: 'ACTIVE',
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        imageUrl: true,
      },
    });

    const bricks = brickFormOptions();

    const mapped = categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      imageUrl: c.imageUrl,
    }));

    // Virtual Mixed Load option (not a catalog category row)
    if (!mapped.some((c) => c.slug === MIXED_LOAD_SLUG)) {
      mapped.push({
        id: MIXED_LOAD_SLUG,
        slug: MIXED_LOAD_SLUG,
        name: 'Mixed Load',
        imageUrl: null,
      });
    }

    return {
      deliveryRequirements: deliveryRequirementOptions(),
      preferredContacts: preferredContactOptions(),
      units: [...BULK_COMMON_UNITS],
      brickProductTypes: bricks.productTypes,
      brickGrades: bricks.grades,
      categories: mapped,
    };
  }

  async createEnquiry(
    customerId: string,
    dto: CreateBulkEnquiryDto,
  ): Promise<BulkEnquiryResponseDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: {
        assignedExecutive: {
          select: { id: true, fullName: true },
        },
        profile: {
          select: {
            companyName: true,
            gstNumber: true,
            businessType: true,
          },
        },
        role: { select: { slug: true, name: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.addressId) {
      const address = await this.prisma.address.findFirst({
        where: {
          id: dto.addressId,
          customerId,
          deletedAt: null,
        },
      });
      if (!address) {
        throw new BadRequestException(
          'addressId does not belong to this customer',
        );
      }
    }

    const resolved = await this.resolveCategories(dto);
    this.validateBrickFields(resolved.primarySlug, dto, resolved.categoriesJson);

    const companyName =
      dto.companyName?.trim() ||
      customer.profile?.companyName ||
      customer.fullName ||
      'Customer';
    const projectName =
      dto.projectName?.trim() || 'Bulk Procurement Enquiry';

    const mixedCategories = Array.isArray(resolved.categoriesJson)
      ? (resolved.categoriesJson as Array<{ slug: string }>)
      : [];
    const bricksSelected =
      isBricksCategorySlug(resolved.primarySlug) ||
      mixedCategories.some((c) => isBricksCategorySlug(c.slug));

    let productType: string | null = null;
    let grade: string | null = null;
    if (bricksSelected) {
      productType = validateBrickProductType(dto.productType);
      grade = validateBrickGrade(dto.grade);
    } else {
      productType = dto.productType?.trim() || null;
      grade = dto.grade?.trim() || null;
    }

    const contactPhone =
      normalizeContactPhone(dto.contactPhone) || customer.phone;
    const contactEmail =
      dto.contactEmail?.trim() || customer.email || null;

    const autoAssign = customer.assignedExecutive;
    const initialStatus = autoAssign
      ? BulkEnquiryStatus.ASSIGNED
      : BulkEnquiryStatus.NEW;

    const enquiry = await this.prisma.$transaction(async (tx) => {
      const enquiryNumber = await this.nextEnquiryNumber(tx);

      const created = await tx.bulkEnquiry.create({
        data: {
          enquiryNumber,
          customerId,
          customerNameSnapshot: customer.fullName ?? null,
          customerPhoneSnapshot: contactPhone,
          customerEmailSnapshot: contactEmail,
          customerTypeSnapshot:
            customer.role?.name ??
            customer.role?.slug ??
            customer.profile?.businessType ??
            null,
          gstNumberSnapshot: customer.profile?.gstNumber ?? null,
          companyName,
          projectName,
          siteType: dto.siteType?.trim() || null,
          expectedStartDate: dto.expectedStartDate
            ? new Date(dto.expectedStartDate)
            : null,
          materialCategoryId: resolved.primary?.id ?? null,
          materialCategorySlug: resolved.primarySlug,
          materialCategoryName: resolved.primary?.name ?? null,
          isMixedLoad: resolved.isMixedLoad,
          materialCategoriesJson:
            resolved.categoriesJson === null
              ? undefined
              : resolved.categoriesJson,
          productType,
          grade,
          materialTypeLabel: dto.materialTypeLabel?.trim() || null,
          location: dto.location.trim(),
          addressLine: dto.addressLine?.trim() || null,
          city: dto.city?.trim() || null,
          state: dto.state?.trim() || null,
          pincode: dto.pincode?.trim() || null,
          latitude:
            dto.latitude !== undefined ? dto.latitude : undefined,
          longitude:
            dto.longitude !== undefined ? dto.longitude : undefined,
          addressId: dto.addressId ?? null,
          additionalNotes: dto.additionalNotes?.trim() || null,
          remarks: dto.additionalNotes?.trim() || null,
          expectedQuantity: dto.estimatedQuantity,
          expectedUnit: normalizeUnit(dto.unit),
          deliveryRequirement: dto.deliveryRequirement,
          deliveryDate: dto.deliveryDate
            ? new Date(dto.deliveryDate)
            : null,
          preferredContact:
            dto.preferredContact ?? BulkPreferredContact.BOTH,
          status: initialStatus,
          assignedExecutiveId: autoAssign?.id ?? null,
          assignedExecutive: autoAssign?.fullName ?? null,
          activities: {
            create: [
              {
                type: BulkActivityType.ENQUIRY_CREATED,
                message: `Bulk enquiry ${enquiryNumber} submitted`,
                performedBy: customer.fullName ?? 'Customer',
              },
              ...(autoAssign
                ? [
                    {
                      type: BulkActivityType.EXECUTIVE_ASSIGNED,
                      message: `Auto-assigned to ${autoAssign.fullName}`,
                      performedBy: 'SYSTEM',
                      metadata: {
                        executiveId: autoAssign.id,
                        auto: true,
                      } as Prisma.InputJsonValue,
                    },
                  ]
                : []),
            ],
          },
        },
        include: {
          assignedExecutiveUser: {
            select: { id: true, fullName: true },
          },
          quotations: {
            where: {
              status: {
                in: [
                  BulkQuotationStatus.SENT,
                  BulkQuotationStatus.ACCEPTED,
                ],
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      return created;
    });

    await this.cache.del(CACHE_KEYS.BULK(customerId));

    try {
      await this.notificationService.createForCustomer({
        customerId,
        type: NotificationType.SYSTEM,
        label: 'Bulk Enquiry',
        title: 'Bulk enquiry submitted',
        body: `Your bulk enquiry ${enquiry.enquiryNumber} has been received. Our team will contact you shortly.`,
        actionLabel: 'View enquiry',
        actionRoute: `/bulk-procurement/my-enquiries`,
      });
    } catch {
      // Non-fatal: enquiry already created
    }

    return this.mapCustomerEnquiry(enquiry as EnquiryWithRelations);
  }

  async listEnquiries(
    customerId: string,
    query: BulkEnquiryListQueryDto = {},
  ): Promise<BulkEnquiryListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const cacheKey =
      CACHE_KEYS.BULK(customerId) + `:p${page}:l${limit}`;
    const cached =
      await this.cache.get<BulkEnquiryListResponseDto>(cacheKey);
    if (cached) return cached;

    const where: Prisma.BulkEnquiryWhereInput = { customerId };

    const [items, total] = await Promise.all([
      this.prisma.bulkEnquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          assignedExecutiveUser: {
            select: { id: true, fullName: true },
          },
          quotations: {
            where: {
              status: {
                in: [
                  BulkQuotationStatus.SENT,
                  BulkQuotationStatus.ACCEPTED,
                ],
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.bulkEnquiry.count({ where }),
    ]);

    const result: BulkEnquiryListResponseDto = {
      items: items.map((e) => this.mapCustomerEnquiry(e)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.BULK);
    return result;
  }

  async getEnquiryById(
    customerId: string,
    id: string,
  ): Promise<BulkEnquiryResponseDto> {
    const cacheKey = CACHE_KEYS.BULK_DETAIL(customerId, id);
    const cached =
      await this.cache.get<BulkEnquiryResponseDto>(cacheKey);
    if (cached) return cached;

    const enquiry = await this.prisma.bulkEnquiry.findFirst({
      where: { id, customerId },
      include: {
        assignedExecutiveUser: {
          select: { id: true, fullName: true },
        },
        quotations: {
          where: {
            status: {
              in: [
                BulkQuotationStatus.SENT,
                BulkQuotationStatus.ACCEPTED,
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!enquiry) {
      throw new NotFoundException('Bulk enquiry not found');
    }

    const result = this.mapCustomerEnquiry(enquiry);
    await this.cache.set(cacheKey, result, CACHE_TTL.BULK);
    return result;
  }

  async cancelEnquiry(
    customerId: string,
    id: string,
  ): Promise<BulkEnquiryResponseDto> {
    const enquiry = await this.prisma.bulkEnquiry.findFirst({
      where: { id, customerId },
    });

    if (!enquiry) {
      throw new NotFoundException('Bulk enquiry not found');
    }

    const cancellable: BulkEnquiryStatus[] = [
      BulkEnquiryStatus.NEW,
      BulkEnquiryStatus.ASSIGNED,
      BulkEnquiryStatus.CONTACTED,
      BulkEnquiryStatus.IN_PROGRESS,
    ];

    if (!cancellable.includes(enquiry.status)) {
      throw new BadRequestException(
        `Cannot cancel enquiry in status ${enquiry.status}`,
      );
    }

    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        status: BulkEnquiryStatus.CANCELLED,
        activities: {
          create: {
            type: BulkActivityType.CANCELLED,
            message: 'Enquiry cancelled by customer',
            performedBy: 'Customer',
          },
        },
      },
      include: {
        assignedExecutiveUser: {
          select: { id: true, fullName: true },
        },
        quotations: {
          where: {
            status: {
              in: [
                BulkQuotationStatus.SENT,
                BulkQuotationStatus.ACCEPTED,
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    await this.cache.del(CACHE_KEYS.BULK(customerId));
    await this.cache.del(CACHE_KEYS.BULK_DETAIL(customerId, id));

    return this.mapCustomerEnquiry(updated);
  }

  private async nextEnquiryNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await tx.bulkEnquiryNumberSequence.upsert({
      where: { year },
      create: { year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return formatBulkEnquiryNumber(year, seq.lastValue);
  }

  private async resolveCategories(dto: CreateBulkEnquiryDto): Promise<{
    primary: CategoryRow | null;
    primarySlug: string | null;
    isMixedLoad: boolean;
    categoriesJson: Prisma.InputJsonValue | null;
  }> {
    const slugHints = [
      ...(dto.materialCategorySlug
        ? [dto.materialCategorySlug.trim().toLowerCase()]
        : []),
      ...(dto.materialCategorySlugs ?? []).map((s) =>
        s.trim().toLowerCase(),
      ),
    ];

    const mixedHint =
      dto.isMixedLoad === true ||
      slugHints.includes(MIXED_LOAD_SLUG) ||
      (dto.materialCategoryIds?.length ?? 0) > 1 ||
      (dto.materialCategorySlugs?.length ?? 0) > 1;

    if (mixedHint && slugHints.includes(MIXED_LOAD_SLUG)) {
      // Resolve remaining categories excluding "mixed"
    }

    const idSet = new Set<string>(
      [
        ...(dto.materialCategoryId ? [dto.materialCategoryId] : []),
        ...(dto.materialCategoryIds ?? []),
      ].filter(
        (id) =>
          id !== MIXED_LOAD_SLUG &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id,
          ),
      ),
    );
    const slugSet = new Set(
      slugHints.filter((s) => s && s !== MIXED_LOAD_SLUG),
    );

    if (idSet.size === 0 && slugSet.size === 0 && !mixedHint) {
      throw new BadRequestException(
        'Provide materialCategoryId, materialCategorySlug, or mixed-load categories',
      );
    }

    const categories: CategoryRow[] = [];

    if (idSet.size > 0) {
      const byId = await this.prisma.category.findMany({
        where: {
          id: { in: [...idSet] },
          deletedAt: null,
        },
        select: { id: true, slug: true, name: true, imageUrl: true },
      });
      if (byId.length !== idSet.size) {
        throw new BadRequestException('One or more material categories not found');
      }
      categories.push(...byId);
    }

    if (slugSet.size > 0) {
      const bySlug = await this.prisma.category.findMany({
        where: {
          slug: { in: [...slugSet] },
          deletedAt: null,
        },
        select: { id: true, slug: true, name: true, imageUrl: true },
      });
      if (bySlug.length !== slugSet.size) {
        throw new BadRequestException(
          'One or more material category slugs not found',
        );
      }
      for (const cat of bySlug) {
        if (!categories.some((c) => c.id === cat.id)) {
          categories.push(cat);
        }
      }
    }

    // Legacy steel slug → prefer rmc if present in DB, else keep resolved
    for (let i = 0; i < categories.length; i++) {
      if (categories[i].slug === CATEGORY_SLUGS.STEEL_LEGACY) {
        const rmc = await this.prisma.category.findFirst({
          where: { slug: CATEGORY_SLUGS.RMC, deletedAt: null },
          select: { id: true, slug: true, name: true, imageUrl: true },
        });
        if (rmc) categories[i] = rmc;
      }
    }

    const isMixedLoad = mixedHint || categories.length > 1;
    const primary = categories[0] ?? null;
    const primarySlug = isMixedLoad
      ? MIXED_LOAD_SLUG
      : primary?.slug ?? (slugHints.includes(MIXED_LOAD_SLUG) ? MIXED_LOAD_SLUG : null);

    if (isMixedLoad && categories.length === 0) {
      throw new BadRequestException(
        'Mixed Load requires at least one material category',
      );
    }

    if (!primary && !isMixedLoad) {
      throw new BadRequestException('Unable to resolve material category');
    }

    return {
      primary: isMixedLoad ? null : primary,
      primarySlug: isMixedLoad
        ? MIXED_LOAD_SLUG
        : primarySlug,
      isMixedLoad,
      categoriesJson:
        isMixedLoad && categories.length
          ? categories.map((c) => ({
              id: c.id,
              slug: c.slug,
              name: c.name,
            }))
          : null,
    };
  }

  private validateBrickFields(
    primarySlug: string | null,
    dto: CreateBulkEnquiryDto,
    categoriesJson: Prisma.InputJsonValue | null,
  ) {
    const slugList = [
      ...(dto.materialCategorySlugs ?? []).map((s) => s.toLowerCase()),
      ...(Array.isArray(categoriesJson)
        ? (categoriesJson as Array<{ slug?: string }>)
            .map((c) => (c.slug ?? '').toLowerCase())
            .filter(Boolean)
        : []),
    ];
    const bricksInMixed =
      primarySlug === MIXED_LOAD_SLUG &&
      (slugList.includes(CATEGORY_SLUGS.BRICKS) || dto.productType != null);

    if (isBricksCategorySlug(primarySlug) || bricksInMixed) {
      if (!dto.productType?.trim()) {
        throw new BadRequestException(
          'productType is required for bricks category (RED_BRICKS or GREY_ASH_BRICKS)',
        );
      }
      try {
        validateBrickProductType(dto.productType);
        if (dto.grade != null && dto.grade !== '') {
          validateBrickGrade(dto.grade);
        }
      } catch (err) {
        throw new BadRequestException(
          err instanceof Error ? err.message : 'Invalid brick attributes',
        );
      }
    }
  }

  private mapCustomerEnquiry(
    enquiry: EnquiryWithRelations | (EnquiryWithRelations & object),
  ): BulkEnquiryResponseDto {
    const executiveName =
      enquiry.assignedExecutiveUser?.fullName ??
      enquiry.assignedExecutive ??
      null;

    const materialCategories = Array.isArray(enquiry.materialCategoriesJson)
      ? (enquiry.materialCategoriesJson as Array<{
          id: string;
          slug: string;
          name: string;
        }>)
      : null;

    const quotations = (enquiry.quotations ?? []).map((q) => ({
      id: q.id,
      quotationNumber: q.quotationNumber,
      status: q.status,
      materialLabel: q.materialLabel,
      quantity: decimalToNumber(q.quantity),
      unit: normalizeUnit(q.unit),
      unitPrice: decimalToNumber(q.unitPrice),
      deliveryCharge: decimalToNumber(q.deliveryCharge),
      gstPercent: decimalToNumber(q.gstPercent),
      discountAmount: decimalToNumber(q.discountAmount),
      subtotal: decimalToNumber(q.subtotal),
      gstAmount: decimalToNumber(q.gstAmount),
      totalAmount: decimalToNumber(q.totalAmount),
      notes: q.notes,
      validUntil: q.validUntil?.toISOString() ?? null,
      sentAt: q.sentAt?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
    }));

    return {
      id: enquiry.id,
      enquiryNumber: enquiry.enquiryNumber,
      customerId: enquiry.customerId,
      companyName: enquiry.companyName,
      projectName: enquiry.projectName,
      siteType: enquiry.siteType,
      expectedStartDate: enquiry.expectedStartDate
        ? enquiry.expectedStartDate.toISOString().slice(0, 10)
        : null,
      materialCategoryId: enquiry.materialCategoryId,
      materialCategorySlug: enquiry.materialCategorySlug,
      materialCategoryName: enquiry.materialCategoryName,
      isMixedLoad: enquiry.isMixedLoad,
      materialCategories,
      productType: enquiry.productType,
      grade: enquiry.grade,
      materialTypeLabel: enquiry.materialTypeLabel,
      expectedQuantity: decimalToNumber(enquiry.expectedQuantity),
      expectedUnit: normalizeUnit(enquiry.expectedUnit),
      deliveryRequirement: enquiry.deliveryRequirement,
      deliveryDate: enquiry.deliveryDate
        ? enquiry.deliveryDate.toISOString().slice(0, 10)
        : null,
      location: enquiry.location,
      addressLine: enquiry.addressLine,
      city: enquiry.city,
      state: enquiry.state,
      pincode: enquiry.pincode,
      latitude: optionalDecimalToNumber(enquiry.latitude),
      longitude: optionalDecimalToNumber(enquiry.longitude),
      additionalNotes: enquiry.additionalNotes,
      preferredContact: enquiry.preferredContact,
      status: enquiry.status,
      customerFacingStatus: customerFacingBulkStatus(enquiry.status),
      assignedExecutive: executiveName
        ? { name: executiveName }
        : null,
      quotations,
      createdAt: enquiry.createdAt.toISOString(),
      updatedAt: enquiry.updatedAt.toISOString(),
    };
  }
}
