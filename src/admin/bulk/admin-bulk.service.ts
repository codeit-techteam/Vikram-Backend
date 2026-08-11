import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BulkActivityType,
  BulkEnquiryStatus,
  BulkFollowUpStatus,
  BulkQuotationStatus,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { formatOrderNumber } from '../../common/shopping/pricing.util';
import { NotificationService } from '../../modules/notification/notification.service';
import {
  BULK_CANCELLED_STATUSES,
  BULK_COMPLETED_STATUSES,
  BULK_IN_PROGRESS_STATUSES,
  BULK_QUOTED_PIPELINE_STATUSES,
  BULK_TERMINAL_STATUSES,
  decimalToNumber,
  formatBulkQuotationNumber,
  optionalDecimalToNumber,
} from '../../modules/bulk/bulk.constants';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import type {
  AddBulkFollowUpDto,
  AddBulkInternalNoteDto,
  AssignExecutiveDto,
  BulkQueryDto,
  ConvertBulkToOrderDto,
  CreateBulkQuotationDto,
  RejectBulkEnquiryDto,
  UpdateBulkFollowUpStatusDto,
  UpdateBulkQuotationStatusDto,
  UpdateBulkStatusDto,
} from './dto/admin-bulk.dto';

const enquiryDetailInclude = {
  customer: {
    include: {
      profile: true,
      role: { select: { id: true, name: true, slug: true } },
      assignedExecutive: {
        select: { id: true, fullName: true, email: true },
      },
    },
  },
  materialCategory: {
    select: { id: true, slug: true, name: true },
  },
  address: true,
  assignedExecutiveUser: {
    select: { id: true, fullName: true, email: true, phone: true },
  },
  convertedOrder: {
    select: {
      id: true,
      orderNumber: true,
      orderStatus: true,
      grandTotal: true,
    },
  },
  activities: { orderBy: { createdAt: 'desc' as const } },
  followUps: { orderBy: { followUpAt: 'asc' as const } },
  internalNotes: { orderBy: { createdAt: 'desc' as const } },
  quotations: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.BulkEnquiryInclude;

@Injectable()
export class AdminBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAll(query: BulkQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildListWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.bulkEnquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              phone: true,
              fullName: true,
              email: true,
              assignedExecutiveId: true,
              profile: { select: { companyName: true } },
            },
          },
          assignedExecutiveUser: {
            select: { id: true, fullName: true },
          },
          materialCategory: {
            select: { id: true, slug: true, name: true },
          },
        },
      }),
      this.prisma.bulkEnquiry.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serializeEnquiry(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getStats(filters?: Pick<BulkQueryDto, 'assignedExecutiveId' | 'dateFrom' | 'dateTo' | 'city'>) {
    const base = this.buildListWhere({
      page: 1,
      limit: 1,
      assignedExecutiveId: filters?.assignedExecutiveId,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
      city: filters?.city,
    });

    const [
      openRequests,
      assigned,
      inProgress,
      completed,
      cancelled,
      estimatedAgg,
      quotedAgg,
      convertedAgg,
    ] = await Promise.all([
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: BulkEnquiryStatus.NEW },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: BulkEnquiryStatus.ASSIGNED },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: { in: BULK_IN_PROGRESS_STATUSES } },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: { in: BULK_COMPLETED_STATUSES } },
      }),
      this.prisma.bulkEnquiry.count({
        where: { ...base, status: { in: BULK_CANCELLED_STATUSES } },
      }),
      this.prisma.bulkEnquiry.aggregate({
        where: {
          ...base,
          status: { notIn: BULK_TERMINAL_STATUSES },
          estimatedValue: { not: null },
        },
        _sum: { estimatedValue: true },
      }),
      this.prisma.bulkEnquiry.aggregate({
        where: {
          ...base,
          status: { in: BULK_QUOTED_PIPELINE_STATUSES },
          quotedValue: { not: null },
        },
        _sum: { quotedValue: true },
      }),
      this.prisma.bulkEnquiry.aggregate({
        where: {
          ...base,
          status: {
            in: [
              BulkEnquiryStatus.CONVERTED,
              BulkEnquiryStatus.ORDER_CREATED,
              BulkEnquiryStatus.COMPLETED,
            ],
          },
        },
        _sum: { quotedValue: true, estimatedValue: true },
      }),
    ]);

    const convertedValue =
      decimalToNumber(convertedAgg._sum.quotedValue) ||
      decimalToNumber(convertedAgg._sum.estimatedValue);

    return {
      openRequests,
      assigned,
      inProgress,
      completed,
      cancelled,
      estimatedPipeline: decimalToNumber(estimatedAgg._sum.estimatedValue),
      quotedPipeline: decimalToNumber(quotedAgg._sum.quotedValue),
      convertedValue,
    };
  }

  async findOne(id: string) {
    const enquiry = await this.prisma.bulkEnquiry.findUnique({
      where: { id },
      include: enquiryDetailInclude,
    });
    if (!enquiry) throw new NotFoundException('Bulk enquiry not found');
    return this.serializeEnquiry(enquiry);
  }

  async assignExecutive(
    id: string,
    dto: AssignExecutiveDto,
    admin?: AuthenticatedAdmin,
  ) {
    await this.findOneRaw(id);

    let executiveId: string | null = dto.executiveId ?? null;
    let executiveName: string | null = dto.assignedExecutive?.trim() || null;

    if (executiveId) {
      const user = await this.prisma.adminUser.findFirst({
        where: { id: executiveId, deletedAt: null },
        select: { id: true, fullName: true },
      });
      if (!user) {
        throw new BadRequestException('Executive not found');
      }
      executiveId = user.id;
      executiveName = user.fullName;
    } else if (!executiveName) {
      throw new BadRequestException(
        'Provide executiveId or assignedExecutive name',
      );
    }

    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        assignedExecutiveId: executiveId,
        assignedExecutive: executiveName,
        status: BulkEnquiryStatus.ASSIGNED,
        activities: {
          create: {
            type: BulkActivityType.EXECUTIVE_ASSIGNED,
            message: `Assigned to ${executiveName}`,
            performedBy: admin?.email ?? 'Admin',
            performedByAdminId: admin?.id ?? null,
            metadata: {
              executiveId,
              executiveName,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: enquiryDetailInclude,
    });

    return this.serializeEnquiry(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateBulkStatusDto,
    admin?: AuthenticatedAdmin,
  ) {
    const existing = await this.findOneRaw(id);
    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.remarks !== undefined
          ? { remarks: dto.remarks, additionalNotes: dto.remarks }
          : {}),
        activities: {
          create: {
            type:
              dto.status === BulkEnquiryStatus.CONTACTED
                ? BulkActivityType.CUSTOMER_CONTACTED
                : BulkActivityType.STATUS_CHANGED,
            message: `Status changed from ${existing.status} to ${dto.status}`,
            performedBy: admin?.email ?? 'Admin',
            performedByAdminId: admin?.id ?? null,
            metadata: {
              from: existing.status,
              to: dto.status,
              remarks: dto.remarks ?? null,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: enquiryDetailInclude,
    });
    return this.serializeEnquiry(updated);
  }

  async addFollowUp(
    id: string,
    dto: AddBulkFollowUpDto,
    admin?: AuthenticatedAdmin,
  ) {
    await this.findOneRaw(id);
    const adminName = await this.resolveAdminName(admin);

    await this.prisma.bulkEnquiryFollowUp.create({
      data: {
        enquiryId: id,
        followUpAt: new Date(dto.followUpAt),
        note: dto.note,
        status: BulkFollowUpStatus.PENDING,
        createdById: admin?.id ?? null,
        createdByName: adminName,
      },
    });

    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        activities: {
          create: {
            type: BulkActivityType.FOLLOW_UP_ADDED,
            message: `Follow-up scheduled for ${dto.followUpAt}`,
            performedBy: adminName,
            performedByAdminId: admin?.id ?? null,
          },
        },
      },
      include: enquiryDetailInclude,
    });

    return this.serializeEnquiry(updated);
  }

  async updateFollowUpStatus(
    id: string,
    followUpId: string,
    dto: UpdateBulkFollowUpStatusDto,
    admin?: AuthenticatedAdmin,
  ) {
    const followUp = await this.prisma.bulkEnquiryFollowUp.findFirst({
      where: { id: followUpId, enquiryId: id },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');

    const adminName = await this.resolveAdminName(admin);

    await this.prisma.bulkEnquiryFollowUp.update({
      where: { id: followUpId },
      data: {
        status: dto.status,
        completedAt:
          dto.status === BulkFollowUpStatus.COMPLETED
            ? new Date()
            : followUp.completedAt,
      },
    });

    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        activities: {
          create: {
            type: BulkActivityType.FOLLOW_UP_UPDATED,
            message: `Follow-up marked ${dto.status}`,
            performedBy: adminName,
            performedByAdminId: admin?.id ?? null,
            metadata: { followUpId, status: dto.status } as Prisma.InputJsonValue,
          },
        },
      },
      include: enquiryDetailInclude,
    });

    return this.serializeEnquiry(updated);
  }

  async addInternalNote(
    id: string,
    dto: AddBulkInternalNoteDto,
    admin?: AuthenticatedAdmin,
  ) {
    await this.findOneRaw(id);
    const adminName = await this.resolveAdminName(admin);

    await this.prisma.bulkEnquiryNote.create({
      data: {
        enquiryId: id,
        note: dto.note,
        createdById: admin?.id ?? null,
        createdByName: adminName,
      },
    });

    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        activities: {
          create: {
            type: BulkActivityType.INTERNAL_NOTE_ADDED,
            message: 'Internal note added',
            performedBy: adminName,
            performedByAdminId: admin?.id ?? null,
          },
        },
      },
      include: enquiryDetailInclude,
    });

    return this.serializeEnquiry(updated);
  }

  async createQuotation(
    id: string,
    dto: CreateBulkQuotationDto,
    admin?: AuthenticatedAdmin,
  ) {
    const enquiry = await this.findOneRaw(id);

    if (dto.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, deletedAt: null },
        select: { id: true },
      });
      if (!product) throw new BadRequestException('Product not found');
    }

    const quantity = dto.quantity;
    const unitPrice = dto.unitPrice;
    const deliveryCharge = dto.deliveryCharge ?? 0;
    const gstPercent = dto.gstPercent ?? 18;
    const discountAmount = dto.discountAmount ?? 0;
    const subtotal = Math.max(0, quantity * unitPrice - discountAmount);
    const gstAmount = Number(((subtotal * gstPercent) / 100).toFixed(2));
    const totalAmount = Number(
      (subtotal + gstAmount + deliveryCharge).toFixed(2),
    );

    const adminName = await this.resolveAdminName(admin);

    const quotation = await this.prisma.$transaction(async (tx) => {
      const quotationNumber = await this.nextQuotationNumber(tx);
      const created = await tx.bulkEnquiryQuotation.create({
        data: {
          enquiryId: id,
          quotationNumber,
          status: BulkQuotationStatus.DRAFT,
          materialLabel: dto.materialLabel,
          quantity,
          unit: dto.unit,
          unitPrice,
          deliveryCharge,
          gstPercent,
          discountAmount,
          subtotal,
          gstAmount,
          totalAmount,
          productId: dto.productId ?? null,
          notes: dto.notes ?? null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          createdById: admin?.id ?? null,
        },
      });

      await tx.bulkEnquiry.update({
        where: { id },
        data: {
          status:
            enquiry.status === BulkEnquiryStatus.NEW ||
            enquiry.status === BulkEnquiryStatus.ASSIGNED ||
            enquiry.status === BulkEnquiryStatus.CONTACTED ||
            enquiry.status === BulkEnquiryStatus.IN_PROGRESS
              ? BulkEnquiryStatus.QUOTE_PREPARED
              : enquiry.status,
          estimatedValue: totalAmount,
          activities: {
            create: {
              type: BulkActivityType.QUOTE_CREATED,
              message: `Quotation ${quotationNumber} created`,
              performedBy: adminName,
              performedByAdminId: admin?.id ?? null,
              metadata: {
                quotationId: created.id,
                totalAmount,
              } as Prisma.InputJsonValue,
            },
          },
        },
      });

      return created;
    });

    return {
      quotation: this.serializeQuotation(quotation),
      enquiry: await this.findOne(id),
    };
  }

  async updateQuotationStatus(
    id: string,
    quotationId: string,
    dto: UpdateBulkQuotationStatusDto,
    admin?: AuthenticatedAdmin,
  ) {
    const quotation = await this.prisma.bulkEnquiryQuotation.findFirst({
      where: { id: quotationId, enquiryId: id },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    const adminName = await this.resolveAdminName(admin);
    const now = new Date();

    const statusData: Prisma.BulkEnquiryQuotationUpdateInput = {
      status: dto.status,
    };
    if (dto.status === BulkQuotationStatus.SENT) {
      statusData.sentAt = now;
    }
    if (dto.status === BulkQuotationStatus.ACCEPTED) {
      statusData.acceptedAt = now;
    }
    if (dto.status === BulkQuotationStatus.REJECTED) {
      statusData.rejectedAt = now;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bulkEnquiryQuotation.update({
        where: { id: quotationId },
        data: statusData,
      });

      const enquiryUpdate: Prisma.BulkEnquiryUpdateInput = {
        activities: {
          create: {
            type:
              dto.status === BulkQuotationStatus.SENT
                ? BulkActivityType.QUOTE_SENT
                : dto.status === BulkQuotationStatus.ACCEPTED
                  ? BulkActivityType.QUOTE_ACCEPTED
                  : dto.status === BulkQuotationStatus.REJECTED
                    ? BulkActivityType.QUOTE_REJECTED
                    : BulkActivityType.STATUS_CHANGED,
            message: `Quotation ${quotation.quotationNumber} marked ${dto.status}`,
            performedBy: adminName,
            performedByAdminId: admin?.id ?? null,
            metadata: {
              quotationId,
              status: dto.status,
            } as Prisma.InputJsonValue,
          },
        },
      };

      if (dto.status === BulkQuotationStatus.SENT) {
        enquiryUpdate.status = BulkEnquiryStatus.QUOTE_SENT;
        enquiryUpdate.quotedValue = quotation.totalAmount;
      }
      if (dto.status === BulkQuotationStatus.ACCEPTED) {
        enquiryUpdate.status = BulkEnquiryStatus.NEGOTIATION;
        enquiryUpdate.quotedValue = quotation.totalAmount;
      }

      await tx.bulkEnquiry.update({
        where: { id },
        data: enquiryUpdate,
      });
    });

    if (dto.status === BulkQuotationStatus.SENT) {
      const enquiry = await this.findOneRaw(id);
      try {
        await this.notificationService.createForCustomer({
          customerId: enquiry.customerId,
          type: NotificationType.SYSTEM,
          label: 'Bulk Quotation',
          title: 'Quotation ready',
          body: `A quotation for enquiry ${enquiry.enquiryNumber} has been sent. Please review it in the app.`,
          actionLabel: 'View enquiry',
          actionRoute: '/bulk-procurement/my-enquiries',
        });
      } catch {
        // non-fatal
      }
    }

    return this.findOne(id);
  }

  async convertToOrder(
    id: string,
    dto: ConvertBulkToOrderDto,
    admin?: AuthenticatedAdmin,
  ) {
    const enquiry = await this.prisma.bulkEnquiry.findUnique({
      where: { id },
      include: {
        quotations: true,
        address: true,
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });
    if (!enquiry) throw new NotFoundException('Bulk enquiry not found');

    if (
      enquiry.convertedOrderId ||
      enquiry.status === BulkEnquiryStatus.ORDER_CREATED ||
      enquiry.status === BulkEnquiryStatus.CONVERTED
    ) {
      throw new BadRequestException('Enquiry already converted to an order');
    }

    type QuotationRow = (typeof enquiry.quotations)[number];
    let quotation: QuotationRow | undefined;

    if (dto.quotationId) {
      const selected = enquiry.quotations.find((q) => q.id === dto.quotationId);
      if (!selected) {
        throw new BadRequestException('Quotation not found on this enquiry');
      }
      if (
        selected.status !== BulkQuotationStatus.ACCEPTED &&
        !dto.productId
      ) {
        throw new BadRequestException(
          'Quotation must be ACCEPTED before conversion (or provide productId)',
        );
      }
      quotation =
        selected.status === BulkQuotationStatus.ACCEPTED
          ? selected
          : undefined;
    } else {
      quotation = enquiry.quotations.find(
        (q) => q.status === BulkQuotationStatus.ACCEPTED,
      );
    }

    const productId =
      dto.productId ?? quotation?.productId ?? null;
    if (!productId) {
      throw new BadRequestException(
        'Accepted quotation with productId, or explicit productId, is required',
      );
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        category: { select: { name: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { url: true },
        },
      },
    });
    if (!product) throw new BadRequestException('Product not found');

    const qtyDecimal = dto.quantity ?? decimalToNumber(quotation?.quantity) ?? decimalToNumber(enquiry.expectedQuantity);
    const quantity = Math.max(1, Math.round(qtyDecimal));
    const unitPrice =
      dto.unitPrice ??
      (quotation ? decimalToNumber(quotation.unitPrice) : null) ??
      decimalToNumber(product.bulkPrice ?? product.retailPrice);
    const gstPercent = quotation
      ? decimalToNumber(quotation.gstPercent)
      : decimalToNumber(product.gst);
    const deliveryCharge = quotation
      ? decimalToNumber(quotation.deliveryCharge)
      : 0;
    const discountAmount = quotation
      ? decimalToNumber(quotation.discountAmount)
      : 0;
    const subtotal = Number(
      Math.max(0, quantity * unitPrice - discountAmount).toFixed(2),
    );
    const gstAmount = Number(((subtotal * gstPercent) / 100).toFixed(2));
    const grandTotal = Number(
      (subtotal + gstAmount + deliveryCharge).toFixed(2),
    );

    const adminName = await this.resolveAdminName(admin);

    const order = await this.prisma.$transaction(async (tx) => {
      let addressId = enquiry.addressId;
      if (!addressId) {
        const createdAddress = await tx.address.create({
          data: {
            customerId: enquiry.customerId,
            label: enquiry.projectName || 'Bulk delivery',
            line1: enquiry.addressLine || enquiry.location,
            city: enquiry.city || 'Unknown',
            state: enquiry.state || 'Unknown',
            pincode: enquiry.pincode || '000000',
            latitude: enquiry.latitude ?? 0,
            longitude: enquiry.longitude ?? 0,
            deliveryNotes: enquiry.additionalNotes ?? null,
            isDefault: false,
          },
        });
        addressId = createdAddress.id;
      }

      const address = await tx.address.findUniqueOrThrow({
        where: { id: addressId },
      });

      const orderNumber = await this.nextOrderNumber(tx);

      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId: enquiry.customerId,
          addressId,
          hubId: null,
          orderStatus: OrderStatus.AWAITING_HUB_ALLOCATION,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          gstAmount,
          deliveryCharge,
          discountAmount,
          grandTotal,
          bulkOrder: true,
          notes:
            dto.notes ??
            `Converted from bulk enquiry ${enquiry.enquiryNumber}`,
          orderSource: admin ? 'CUSTOMER_EXECUTIVE' : 'BULK_CONVERSION',
          createdByAdminId: admin?.id ?? null,
          deliveryAddress: {
            id: address.id,
            label: address.label,
            siteName: address.label,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            latitude: optionalDecimalToNumber(address.latitude),
            longitude: optionalDecimalToNumber(address.longitude),
            deliveryNotes: address.deliveryNotes,
          },
          items: {
            create: {
              productId: product.id,
              name: product.name,
              productImage:
                product.images[0]?.url ??
                null,
              sku: product.sku,
              brand: product.brand,
              category: product.category?.name ?? null,
              productType: product.productType,
              grade: product.grade,
              quantity,
              unit: quotation?.unit ?? product.unit,
              unitPrice,
              mrp: product.mrp ?? unitPrice,
              gst: gstPercent,
              subtotal,
            },
          },
          timeline: {
            create: [
              {
                status: OrderStatus.PENDING,
                message: 'Order created from bulk enquiry',
                remarks: `Bulk ${enquiry.enquiryNumber}`,
                updatedBy: adminName,
                updatedByRole: admin?.role ?? 'ADMIN',
              },
              {
                status: OrderStatus.AWAITING_HUB_ALLOCATION,
                message: 'Awaiting hub allocation',
                remarks: 'No inventory deducted at conversion',
                updatedBy: 'SYSTEM',
                updatedByRole: 'SYSTEM',
              },
            ],
          },
        },
        include: {
          items: true,
          address: true,
        },
      });

      await tx.bulkEnquiry.update({
        where: { id },
        data: {
          addressId,
          convertedOrderId: created.id,
          convertedAt: new Date(),
          status: BulkEnquiryStatus.ORDER_CREATED,
          quotedValue: grandTotal,
          activities: {
            create: {
              type: BulkActivityType.CONVERTED_TO_ORDER,
              message: `Converted to order ${created.orderNumber}`,
              performedBy: adminName,
              performedByAdminId: admin?.id ?? null,
              metadata: {
                orderId: created.id,
                orderNumber: created.orderNumber,
                quotationId: quotation?.id ?? null,
              } as Prisma.InputJsonValue,
            },
          },
        },
      });

      if (quotation) {
        await tx.bulkEnquiryQuotation.update({
          where: { id: quotation.id },
          data: {
            status: BulkQuotationStatus.ACCEPTED,
            acceptedAt: quotation.acceptedAt ?? new Date(),
          },
        });
      }

      return created;
    });

    try {
      await this.notificationService.createForCustomer({
        customerId: enquiry.customerId,
        type: NotificationType.ORDER,
        label: 'Order',
        title: 'Bulk order confirmed',
        body: `Your bulk enquiry ${enquiry.enquiryNumber} was converted to order ${order.orderNumber}.`,
        actionLabel: 'Track order',
        actionRoute: `/orders/${order.id}`,
      });
    } catch {
      // non-fatal
    }

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        grandTotal: decimalToNumber(order.grandTotal),
      },
      enquiry: await this.findOne(id),
    };
  }

  async reject(
    id: string,
    dto: RejectBulkEnquiryDto = {},
    admin?: AuthenticatedAdmin,
  ) {
    await this.findOneRaw(id);
    const adminName = await this.resolveAdminName(admin);
    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        status: BulkEnquiryStatus.REJECTED,
        remarks: dto.remarks ?? undefined,
        activities: {
          create: {
            type: BulkActivityType.REJECTED,
            message: dto.remarks?.trim() || 'Enquiry rejected',
            performedBy: adminName,
            performedByAdminId: admin?.id ?? null,
          },
        },
      },
      include: enquiryDetailInclude,
    });
    return this.serializeEnquiry(updated);
  }

  async cancel(
    id: string,
    dto: RejectBulkEnquiryDto = {},
    admin?: AuthenticatedAdmin,
  ) {
    await this.findOneRaw(id);
    const adminName = await this.resolveAdminName(admin);
    const updated = await this.prisma.bulkEnquiry.update({
      where: { id },
      data: {
        status: BulkEnquiryStatus.CANCELLED,
        remarks: dto.remarks ?? undefined,
        activities: {
          create: {
            type: BulkActivityType.CANCELLED,
            message: dto.remarks?.trim() || 'Enquiry cancelled',
            performedBy: adminName,
            performedByAdminId: admin?.id ?? null,
          },
        },
      },
      include: enquiryDetailInclude,
    });
    return this.serializeEnquiry(updated);
  }

  /** Backward-compatible helpers */
  async approve(id: string, admin?: AuthenticatedAdmin) {
    return this.updateStatus(
      id,
      { status: BulkEnquiryStatus.IN_PROGRESS },
      admin,
    );
  }

  async sendQuotation(id: string, remarks?: string, admin?: AuthenticatedAdmin) {
    return this.updateStatus(
      id,
      { status: BulkEnquiryStatus.QUOTED, remarks },
      admin,
    );
  }

  async complete(id: string, admin?: AuthenticatedAdmin) {
    return this.updateStatus(
      id,
      { status: BulkEnquiryStatus.COMPLETED },
      admin,
    );
  }

  private buildListWhere(query: BulkQueryDto): Prisma.BulkEnquiryWhereInput {
    const where: Prisma.BulkEnquiryWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.materialCategorySlug) {
      where.materialCategorySlug = query.materialCategorySlug;
    }
    if (query.deliveryRequirement) {
      where.deliveryRequirement = query.deliveryRequirement;
    }
    if (query.assignedExecutiveId) {
      where.assignedExecutiveId = query.assignedExecutiveId;
    }
    if (query.city?.trim()) {
      where.city = { contains: query.city.trim(), mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo
          ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
          : {}),
      };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { enquiryNumber: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { projectName: { contains: search, mode: 'insensitive' } },
        { materialCategoryName: { contains: search, mode: 'insensitive' } },
        { materialTypeLabel: { contains: search, mode: 'insensitive' } },
        { assignedExecutive: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { customerNameSnapshot: { contains: search, mode: 'insensitive' } },
        { customerPhoneSnapshot: { contains: search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              {
                profile: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          },
        },
        {
          assignedExecutiveUser: {
            fullName: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private async findOneRaw(id: string) {
    const enquiry = await this.prisma.bulkEnquiry.findUnique({
      where: { id },
    });
    if (!enquiry) throw new NotFoundException('Bulk enquiry not found');
    return enquiry;
  }

  private async nextOrderNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await tx.orderNumberSequence.upsert({
      where: { year },
      create: { year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return formatOrderNumber(year, seq.lastValue);
  }

  private async nextQuotationNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BQ-${year}-`;
    const last = await tx.bulkEnquiryQuotation.findFirst({
      where: { quotationNumber: { startsWith: prefix } },
      orderBy: { quotationNumber: 'desc' },
      select: { quotationNumber: true },
    });
    let next = 1;
    if (last) {
      const n = parseInt(last.quotationNumber.split('-')[2] ?? '0', 10);
      next = Number.isFinite(n) ? n + 1 : 1;
    }
    return formatBulkQuotationNumber(year, next);
  }

  private async resolveAdminName(admin?: AuthenticatedAdmin): Promise<string> {
    if (!admin) return 'Admin';
    const row = await this.prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { fullName: true, email: true },
    });
    return row?.fullName || admin.email || 'Admin';
  }

  private serializeQuotation(q: {
    id: string;
    enquiryId: string;
    quotationNumber: string;
    status: BulkQuotationStatus;
    materialLabel: string;
    quantity: unknown;
    unit: string;
    unitPrice: unknown;
    deliveryCharge: unknown;
    gstPercent: unknown;
    discountAmount: unknown;
    subtotal: unknown;
    gstAmount: unknown;
    totalAmount: unknown;
    productId: string | null;
    notes: string | null;
    validUntil: Date | null;
    sentAt: Date | null;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: q.id,
      enquiryId: q.enquiryId,
      quotationNumber: q.quotationNumber,
      status: q.status,
      materialLabel: q.materialLabel,
      quantity: decimalToNumber(q.quantity),
      unit: q.unit,
      unitPrice: decimalToNumber(q.unitPrice),
      deliveryCharge: decimalToNumber(q.deliveryCharge),
      gstPercent: decimalToNumber(q.gstPercent),
      discountAmount: decimalToNumber(q.discountAmount),
      subtotal: decimalToNumber(q.subtotal),
      gstAmount: decimalToNumber(q.gstAmount),
      totalAmount: decimalToNumber(q.totalAmount),
      productId: q.productId,
      notes: q.notes,
      validUntil: q.validUntil?.toISOString() ?? null,
      sentAt: q.sentAt?.toISOString() ?? null,
      acceptedAt: q.acceptedAt?.toISOString() ?? null,
      rejectedAt: q.rejectedAt?.toISOString() ?? null,
      createdById: q.createdById,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  private serializeEnquiry(enquiry: Record<string, unknown>): Record<string, unknown> {
    const base: Record<string, unknown> = {
      ...enquiry,
      expectedQuantity: decimalToNumber(enquiry.expectedQuantity),
      estimatedValue: optionalDecimalToNumber(enquiry.estimatedValue),
      quotedValue: optionalDecimalToNumber(enquiry.quotedValue),
      latitude: optionalDecimalToNumber(enquiry.latitude),
      longitude: optionalDecimalToNumber(enquiry.longitude),
      expectedStartDate:
        enquiry.expectedStartDate instanceof Date
          ? enquiry.expectedStartDate.toISOString().slice(0, 10)
          : enquiry.expectedStartDate,
      deliveryDate:
        enquiry.deliveryDate instanceof Date
          ? enquiry.deliveryDate.toISOString().slice(0, 10)
          : enquiry.deliveryDate,
      convertedAt:
        enquiry.convertedAt instanceof Date
          ? enquiry.convertedAt.toISOString()
          : enquiry.convertedAt,
      createdAt:
        enquiry.createdAt instanceof Date
          ? enquiry.createdAt.toISOString()
          : enquiry.createdAt,
      updatedAt:
        enquiry.updatedAt instanceof Date
          ? enquiry.updatedAt.toISOString()
          : enquiry.updatedAt,
    };

    if (Array.isArray(enquiry.quotations)) {
      base.quotations = enquiry.quotations.map((q) =>
        this.serializeQuotation(q as never),
      );
    }

    if (
      enquiry.convertedOrder &&
      typeof enquiry.convertedOrder === 'object' &&
      enquiry.convertedOrder !== null &&
      'grandTotal' in enquiry.convertedOrder
    ) {
      const co = enquiry.convertedOrder as {
        id: string;
        orderNumber: string;
        orderStatus: string;
        grandTotal: unknown;
      };
      base.convertedOrder = {
        ...co,
        grandTotal: decimalToNumber(co.grandTotal),
      };
    }

    return base;
  }
}
