import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../../generated/prisma/client';
import {
  InvoiceFinancialDto,
  InvoiceTaxBreakdownDto,
} from './invoice-list.dto';

export class InvoiceItemDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unit!: string;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  gst!: number;

  @ApiProperty()
  subtotal!: number;

  @ApiPropertyOptional()
  discount?: number;

  @ApiPropertyOptional()
  cgst?: number;

  @ApiPropertyOptional()
  sgst?: number;

  @ApiPropertyOptional()
  igst?: number;

  @ApiPropertyOptional()
  gstAmount?: number;
}

export class InvoiceCustomerDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  fullName?: string | null;

  @ApiProperty()
  phone!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  companyName?: string | null;

  @ApiPropertyOptional()
  gstNumber?: string | null;
}

export class InvoiceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;

  @ApiProperty()
  invoiceDate!: string;

  @ApiProperty({ type: InvoiceCustomerDto })
  customer!: InvoiceCustomerDto;

  @ApiProperty({ type: [InvoiceItemDto] })
  items!: InvoiceItemDto[];

  @ApiProperty()
  gst!: number;

  @ApiProperty()
  subtotal!: number;

  @ApiProperty()
  deliveryCharge!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  grandTotal!: number;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiPropertyOptional()
  address?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: InvoiceFinancialDto })
  financial?: InvoiceFinancialDto;

  @ApiPropertyOptional({ type: InvoiceTaxBreakdownDto })
  taxBreakdown?: InvoiceTaxBreakdownDto;

  @ApiPropertyOptional()
  pdfPath?: string | null;

  @ApiPropertyOptional()
  pdfGeneratedAt?: string | null;
}
