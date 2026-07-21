import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { decimalToNumber } from '../orders/orders.constants';
import { InvoiceResponseDto } from './dto/invoice-response.dto';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async getInvoice(
    customerId: string,
    orderId: string,
  ): Promise<InvoiceResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      include: {
        customer: {
          include: { profile: true },
        },
        address: true,
        items: { orderBy: { createdAt: 'asc' } },
        invoice: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    let invoice = order.invoice;

    if (!invoice) {
      invoice = await this.generateInvoice(order);
    }

    const customerSnapshot =
      (invoice.customerSnapshot as Record<string, unknown> | null) ?? null;
    const itemsSnapshot =
      (invoice.itemsSnapshot as InvoiceResponseDto['items'] | null) ?? null;
    const addressSnapshot =
      (invoice.addressSnapshot as Record<string, unknown> | null) ?? null;

    return {
      id: invoice.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate.toISOString(),
      customer: {
        id: String(customerSnapshot?.id ?? order.customer.id),
        fullName:
          (customerSnapshot?.fullName as string | null | undefined) ??
          order.customer.fullName,
        phone: String(customerSnapshot?.phone ?? order.customer.phone),
        email:
          (customerSnapshot?.email as string | null | undefined) ??
          order.customer.email,
        companyName:
          (customerSnapshot?.companyName as string | null | undefined) ??
          order.customer.profile?.companyName ??
          null,
        gstNumber:
          (customerSnapshot?.gstNumber as string | null | undefined) ??
          order.customer.profile?.gstNumber ??
          null,
      },
      items:
        itemsSnapshot ??
        order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: decimalToNumber(item.unitPrice),
          gst: decimalToNumber(item.gst),
          subtotal: decimalToNumber(item.subtotal),
        })),
      gst: decimalToNumber(invoice.gstAmount),
      subtotal: decimalToNumber(invoice.subtotal),
      deliveryCharge: decimalToNumber(invoice.deliveryCharge),
      discountAmount: decimalToNumber(invoice.discountAmount),
      grandTotal: decimalToNumber(invoice.grandTotal),
      paymentMethod: invoice.paymentMethod,
      paymentStatus: invoice.paymentStatus,
      address:
        addressSnapshot ??
        (order.deliveryAddress as Record<string, unknown> | null) ?? {
          id: order.address.id,
          line1: order.address.line1,
          line2: order.address.line2,
          city: order.address.city,
          state: order.address.state,
          pincode: order.address.pincode,
          country: order.address.country,
        },
    };
  }

  private async generateInvoice(order: {
    id: string;
    orderNumber: string;
    orderStatus: string;
    paymentMethod: InvoiceResponseDto['paymentMethod'];
    paymentStatus: InvoiceResponseDto['paymentStatus'];
    subtotal: unknown;
    gstAmount: unknown;
    deliveryCharge: unknown;
    discountAmount: unknown;
    grandTotal: unknown;
    deliveryAddress: unknown;
    customer: {
      id: string;
      phone: string;
      email: string | null;
      fullName: string | null;
      profile: {
        companyName: string | null;
        gstNumber: string | null;
      } | null;
    };
    address: {
      id: string;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      pincode: string;
      country: string;
      label: string | null;
    };
    items: Array<{
      name: string;
      quantity: number;
      unit: string;
      unitPrice: unknown;
      gst: unknown;
      subtotal: unknown;
    }>;
  }) {
    const year = new Date().getFullYear();
    const seq = await this.nextInvoiceSequence(year);
    const invoiceNumber = `INV-${year}-${String(seq).padStart(6, '0')}`;

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
      },
    });
  }

  private async nextInvoiceSequence(year: number): Promise<number> {
    const last = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: { startsWith: `INV-${year}-` },
      },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!last) return 1;
    const parts = last.invoiceNumber.split('-');
    const n = parseInt(parts[2] ?? '0', 10);
    return Number.isFinite(n) ? n + 1 : 1;
  }
}
