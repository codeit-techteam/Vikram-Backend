import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus, Prisma } from '../../../generated/prisma/client';
import { EmailService } from '../../common/email/email.service';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/database/prisma.service';
import { decimalToNumber } from '../orders/orders.constants';
import type { AdminInvoiceQueryDto } from './dto/invoice-query.dto';
import type { CustomerInvoiceQueryDto } from './dto/invoice-query.dto';
import type { RegenerateInvoiceDto } from './dto/invoice-list.dto';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { InvoiceListItemDto } from './dto/invoice-list.dto';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceStorageService } from './invoice-storage.service';
import type {
  GstInvoiceData,
  InvoiceAddress,
  InvoiceFinancialSnapshot,
  InvoiceLineItem,
} from './types/invoice.types';
import {
  applyTaxBreakdownToItems,
  buildFinancialSnapshot,
  calculateTaxBreakdown,
  isInterStateSupply,
  parseFinancialSnapshot,
} from './utils/gst.util';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    customer: { include: { profile: true } };
    address: true;
    items: true;
    invoice: true;
  };
}>;

type OrderForPdf = Prisma.OrderGetPayload<{
  include: {
    customer: { include: { profile: true } };
    address: true;
    items: true;
  };
}>;

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  status: InvoiceStatus;
  subtotal: unknown;
  gstAmount: unknown;
  deliveryCharge: unknown;
  discountAmount: unknown;
  grandTotal: unknown;
  paymentMethod: InvoiceResponseDto['paymentMethod'];
  paymentStatus: InvoiceResponseDto['paymentStatus'];
  customerSnapshot: unknown;
  itemsSnapshot: unknown;
  addressSnapshot: unknown;
  financialSnapshot: unknown;
  pdfPath: string | null;
};

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pdfService: InvoicePdfService,
    private readonly storageService: InvoiceStorageService,
    private readonly emailService: EmailService,
  ) {}

  async getInvoice(
    customerId: string,
    orderId: string,
  ): Promise<InvoiceResponseDto> {
    const order = await this.findCustomerOrder(customerId, orderId);
    const invoice = await this.ensureInvoice(order);
    return this.toResponseDto(invoice, order);
  }

  async getInvoicePdf(
    customerId: string,
    orderId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.findCustomerOrder(customerId, orderId);
    const invoice = await this.ensureInvoice(order);
    return this.getOrGeneratePdf(invoice, order);
  }

  async listCustomerInvoices(
    customerId: string,
    query: CustomerInvoiceQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      order: { customerId, deletedAt: null },
    };

    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { invoiceDate: query.sortOrder ?? 'desc' },
        skip,
        take: limit,
        include: { order: { select: { orderNumber: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices.map((inv) => this.toListItem(inv)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async listAdminInvoices(query: AdminInvoiceQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.customerId) {
      where.order = { customerId: query.customerId, deletedAt: null };
    }
    if (query.fromDate || query.toDate) {
      where.invoiceDate = {};
      if (query.fromDate) where.invoiceDate.gte = new Date(query.fromDate);
      if (query.toDate) where.invoiceDate.lte = new Date(query.toDate);
    }
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
        {
          order: {
            customer: { phone: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { invoiceDate: query.sortOrder ?? 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              orderNumber: true,
              customer: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  email: true,
                  profile: { select: { companyName: true, gstNumber: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices.map((inv) => ({
        ...this.toListItem(inv),
        customer: {
          id: inv.order.customer.id,
          fullName: inv.order.customer.fullName,
          phone: inv.order.customer.phone,
          email: inv.order.customer.email,
          companyName: inv.order.customer.profile?.companyName ?? null,
          gstNumber: inv.order.customer.profile?.gstNumber ?? null,
        },
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getAdminInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        order: {
          include: {
            customer: { include: { profile: true } },
            address: true,
            items: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.getOrGeneratePdf(invoice, invoice.order);
  }

  /** Single invoice for an order — used by Customer, Hub, and Admin. */
  async getInvoiceByOrderId(orderId: string): Promise<InvoiceResponseDto> {
    const order = await this.findOrderForInvoice(orderId);
    const invoice = await this.ensureInvoice(order);
    return this.toResponseDto(invoice, order);
  }

  async getInvoicePdfByOrderId(
    orderId: string,
  ): Promise<{ buffer: Buffer; filename: string; invoiceId: string }> {
    const order = await this.findOrderForInvoice(orderId);
    const invoice = await this.ensureInvoice(order);
    const pdf = await this.getOrGeneratePdf(invoice, order);
    return { ...pdf, invoiceId: invoice.id };
  }

  private async findOrderForInvoice(orderId: string): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        customer: { include: { profile: true } },
        address: true,
        items: { orderBy: { createdAt: 'asc' } },
        invoice: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async regenerateInvoice(dto: RegenerateInvoiceDto, sendEmail = false) {
    if (!dto.invoiceId && !dto.orderId) {
      throw new BadRequestException('Either invoiceId or orderId is required');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        deletedAt: null,
        ...(dto.invoiceId ? { id: dto.invoiceId } : { orderId: dto.orderId }),
      },
      include: {
        order: {
          include: {
            customer: { include: { profile: true } },
            address: true,
            items: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    await this.storageService.deletePdf(invoice.pdfPath);

    const { buffer } = await this.generateAndPersistPdf(invoice, invoice.order);

    const updated = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });

    let emailSent = false;
    const shouldSend =
      sendEmail ||
      dto.sendEmail ||
      this.configService.get<boolean>('invoice.emailEnabled', false);

    if (shouldSend) {
      const customerEmail =
        (invoice.customerSnapshot as { email?: string | null } | null)?.email ??
        invoice.order.customer.email;

      if (customerEmail) {
        const result = await this.emailService.sendInvoiceEmail({
          to: customerEmail,
          customerName:
            invoice.order.customer.fullName ??
            invoice.order.customer.profile?.companyName ??
            'Customer',
          invoiceNumber: invoice.invoiceNumber,
          orderNumber: invoice.order.orderNumber,
          pdfBuffer: buffer,
          pdfFilename: `${invoice.invoiceNumber}.pdf`,
        });
        emailSent = result.sent;
      }
    }

    return {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      pdfPath: updated.pdfPath!,
      pdfGeneratedAt: updated.pdfGeneratedAt!.toISOString(),
      emailSent,
    };
  }

  private async findCustomerOrder(
    customerId: string,
    orderId: string,
  ): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      include: {
        customer: { include: { profile: true } },
        address: true,
        items: { orderBy: { createdAt: 'asc' } },
        invoice: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async ensureInvoice(order: OrderWithRelations) {
    if (order.invoice) return order.invoice;
    return this.generateInvoice(order);
  }

  private async getOrGeneratePdf(
    invoice: InvoiceRecord,
    order: OrderForPdf,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (invoice.pdfPath) {
      const existing = await this.storageService.readPdf(invoice.pdfPath);
      if (existing) {
        return { buffer: existing, filename: `${invoice.invoiceNumber}.pdf` };
      }
    }

    return this.generateAndPersistPdf(invoice, order);
  }

  private async generateAndPersistPdf(
    invoice: InvoiceRecord,
    order: OrderForPdf,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const gstData = this.buildGstInvoiceData(invoice, order);
    const buffer = await this.pdfService.generatePdf(gstData);
    const pdfPath = await this.storageService.savePdf(invoice.id, buffer);

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfPath, pdfGeneratedAt: new Date() },
    });

    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  private buildGstInvoiceData(
    invoice: {
      invoiceNumber: string;
      invoiceDate: Date;
      status: InvoiceStatus;
      subtotal: unknown;
      gstAmount: unknown;
      deliveryCharge: unknown;
      discountAmount: unknown;
      grandTotal: unknown;
      paymentMethod: string;
      paymentStatus: string;
      customerSnapshot: unknown;
      itemsSnapshot: unknown;
      addressSnapshot: unknown;
      financialSnapshot: unknown;
    },
    order: OrderForPdf,
  ): GstInvoiceData {
    const companyState = this.configService.get<string>('company.state', 'Maharashtra');
    const loyaltyPointValue = this.configService.get<number>('invoice.loyaltyPointValue', 1);

    const customerSnapshot =
      (invoice.customerSnapshot as Record<string, unknown> | null) ?? {};
    const addressSnapshot = this.resolveAddress(invoice.addressSnapshot, order);
    const financial = parseFinancialSnapshot(
      invoice.financialSnapshot,
      buildFinancialSnapshot({
        loyaltyPointsUsed: order.loyaltyPointsUsed,
        membershipDiscount: order.membershipDiscount,
        discountAmount: order.discountAmount,
        bulkOrder: order.bulkOrder,
        loyaltyPointValue,
      }),
    );

    const rawItems =
      (invoice.itemsSnapshot as InvoiceLineItem[] | null) ??
      order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: decimalToNumber(item.unitPrice),
        gst: decimalToNumber(item.gst),
        subtotal: decimalToNumber(item.subtotal),
        discount: 0,
      }));

    const interState = isInterStateSupply(companyState, addressSnapshot.state);
    const items = applyTaxBreakdownToItems(rawItems, interState);
    const gstAmount = decimalToNumber(invoice.gstAmount);
    const taxBreakdown = calculateTaxBreakdown(gstAmount, interState);

    return {
      company: {
        name: this.configService.get<string>('company.name', 'Bajriwala'),
        gstin: this.configService.get<string>('company.gstin', ''),
        addressLine1: this.configService.get<string>('company.addressLine1', ''),
        addressLine2: this.configService.get<string>('company.addressLine2', ''),
        city: this.configService.get<string>('company.city', ''),
        state: companyState,
        pincode: this.configService.get<string>('company.pincode', ''),
        phone: this.configService.get<string>('company.phone', ''),
        email: this.configService.get<string>('company.email', ''),
        website: this.configService.get<string>('company.website', ''),
      },
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      orderNumber: order.orderNumber,
      status: invoice.status,
      customer: {
        fullName:
          (customerSnapshot.fullName as string | null | undefined) ??
          order.customer.fullName,
        phone: String(customerSnapshot.phone ?? order.customer.phone),
        email:
          (customerSnapshot.email as string | null | undefined) ??
          order.customer.email,
        companyName:
          (customerSnapshot.companyName as string | null | undefined) ??
          order.customer.profile?.companyName ??
          null,
        gstNumber:
          (customerSnapshot.gstNumber as string | null | undefined) ??
          order.customer.profile?.gstNumber ??
          null,
      },
      billingAddress: addressSnapshot,
      shippingAddress: addressSnapshot,
      items,
      subtotal: decimalToNumber(invoice.subtotal),
      discountAmount: decimalToNumber(invoice.discountAmount),
      deliveryCharge: decimalToNumber(invoice.deliveryCharge),
      loyaltyPointsUsed: financial.loyaltyPointsUsed,
      loyaltyRedeemedAmount: financial.loyaltyRedeemedAmount,
      membershipDiscount: financial.membershipDiscount,
      bulkDiscount: financial.bulkDiscount,
      gstAmount,
      taxBreakdown,
      grandTotal: decimalToNumber(invoice.grandTotal),
      paymentMethod: invoice.paymentMethod,
      paymentStatus: invoice.paymentStatus,
      termsAndConditions: this.configService.get<string>(
        'invoice.termsAndConditions',
        '',
      ),
    };
  }

  private resolveAddress(
    addressSnapshot: unknown,
    order: OrderForPdf,
  ): InvoiceAddress {
    const snapshot = addressSnapshot as InvoiceAddress | null;
    if (snapshot?.line1) return snapshot;

    const delivery = order.deliveryAddress as InvoiceAddress | null;
    if (delivery?.line1) return delivery;

    return {
      id: order.address.id,
      label: order.address.label,
      line1: order.address.line1,
      line2: order.address.line2,
      city: order.address.city,
      state: order.address.state,
      pincode: order.address.pincode,
      country: order.address.country,
    };
  }

  private toResponseDto(
    invoice: {
      id: string;
      invoiceNumber: string;
      status: InvoiceStatus;
      invoiceDate: Date;
      subtotal: unknown;
      gstAmount: unknown;
      deliveryCharge: unknown;
      discountAmount: unknown;
      grandTotal: unknown;
      paymentMethod: InvoiceResponseDto['paymentMethod'];
      paymentStatus: InvoiceResponseDto['paymentStatus'];
      customerSnapshot: unknown;
      itemsSnapshot: unknown;
      addressSnapshot: unknown;
      financialSnapshot: unknown;
      pdfPath: string | null;
      pdfGeneratedAt: Date | null;
    },
    order: OrderWithRelations,
  ): InvoiceResponseDto {
    const gstData = this.buildGstInvoiceData(invoice, order);
    const customerSnapshot =
      (invoice.customerSnapshot as Record<string, unknown> | null) ?? null;

    return {
      id: invoice.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate.toISOString(),
      customer: {
        id: String(customerSnapshot?.id ?? order.customer.id),
        fullName: gstData.customer.fullName,
        phone: gstData.customer.phone,
        email: gstData.customer.email,
        companyName: gstData.customer.companyName,
        gstNumber: gstData.customer.gstNumber,
      },
      items: gstData.items,
      gst: gstData.gstAmount,
      subtotal: gstData.subtotal,
      deliveryCharge: gstData.deliveryCharge,
      discountAmount: gstData.discountAmount,
      grandTotal: gstData.grandTotal,
      paymentMethod: invoice.paymentMethod,
      paymentStatus: invoice.paymentStatus,
      address: gstData.billingAddress as Record<string, unknown>,
      financial: {
        loyaltyPointsUsed: gstData.loyaltyPointsUsed,
        loyaltyRedeemedAmount: gstData.loyaltyRedeemedAmount,
        membershipDiscount: gstData.membershipDiscount,
        bulkDiscount: gstData.bulkDiscount,
        bulkOrder: parseFinancialSnapshot(invoice.financialSnapshot).bulkOrder,
      },
      taxBreakdown: gstData.taxBreakdown,
      pdfPath: invoice.pdfPath,
      pdfGeneratedAt: invoice.pdfGeneratedAt?.toISOString() ?? null,
    };
  }

  private toListItem(invoice: {
    id: string;
    orderId: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    invoiceDate: Date;
    grandTotal: unknown;
    paymentStatus: string;
    pdfPath: string | null;
    pdfGeneratedAt: Date | null;
    order: { orderNumber: string };
  }): InvoiceListItemDto {
    return {
      id: invoice.id,
      orderId: invoice.orderId,
      orderNumber: invoice.order.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate.toISOString(),
      grandTotal: decimalToNumber(invoice.grandTotal),
      paymentStatus: invoice.paymentStatus,
      pdfPath: invoice.pdfPath,
      pdfGeneratedAt: invoice.pdfGeneratedAt?.toISOString() ?? null,
    };
  }

  private async generateInvoice(order: OrderWithRelations) {
    const year = new Date().getFullYear();
    const seq = await this.nextInvoiceSequence(year);
    const invoiceNumber = `INV-${year}-${String(seq).padStart(6, '0')}`;
    const loyaltyPointValue = this.configService.get<number>(
      'invoice.loyaltyPointValue',
      1,
    );

    return this.prisma.invoice.create({
      data: {
        orderId: order.id,
        invoiceNumber,
        status:
          order.orderStatus === 'CANCELLED'
            ? InvoiceStatus.CANCELLED
            : InvoiceStatus.GENERATED,
        invoiceDate: new Date(),
        subtotal: decimalToNumber(order.subtotal),
        gstAmount: decimalToNumber(order.gstAmount),
        deliveryCharge: decimalToNumber(order.deliveryCharge),
        discountAmount: decimalToNumber(order.discountAmount),
        grandTotal: decimalToNumber(order.grandTotal),
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        customerSnapshot: {
          id: order.customer.id,
          fullName: order.customer.fullName,
          phone: order.customer.phone,
          email: order.customer.email,
          companyName: order.customer.profile?.companyName ?? null,
          gstNumber: order.customer.profile?.gstNumber ?? null,
        },
        itemsSnapshot: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: decimalToNumber(item.unitPrice),
          gst: decimalToNumber(item.gst),
          subtotal: decimalToNumber(item.subtotal),
          discount: 0,
        })),
        addressSnapshot:
          (order.deliveryAddress as object | null) ?? {
            id: order.address.id,
            label: order.address.label,
            line1: order.address.line1,
            line2: order.address.line2,
            city: order.address.city,
            state: order.address.state,
            pincode: order.address.pincode,
            country: order.address.country,
          },
        financialSnapshot: buildFinancialSnapshot({
          loyaltyPointsUsed: order.loyaltyPointsUsed,
          membershipDiscount: order.membershipDiscount,
          discountAmount: order.discountAmount,
          bulkOrder: order.bulkOrder,
          loyaltyPointValue,
        }) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async nextInvoiceSequence(year: number): Promise<number> {
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `INV-${year}-` } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!last) return 1;
    const parts = last.invoiceNumber.split('-');
    const n = parseInt(parts[2] ?? '0', 10);
    return Number.isFinite(n) ? n + 1 : 1;
  }
}
