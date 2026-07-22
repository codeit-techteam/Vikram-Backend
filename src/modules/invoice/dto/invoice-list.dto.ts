import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../../generated/prisma/client';

export class InvoiceTaxBreakdownDto {
  @ApiProperty()
  cgst!: number;

  @ApiProperty()
  sgst!: number;

  @ApiProperty()
  igst!: number;

  @ApiProperty()
  isInterState!: boolean;
}

export class InvoiceFinancialDto {
  @ApiProperty()
  loyaltyPointsUsed!: number;

  @ApiProperty()
  loyaltyRedeemedAmount!: number;

  @ApiProperty()
  membershipDiscount!: number;

  @ApiProperty()
  bulkDiscount!: number;

  @ApiProperty()
  bulkOrder!: boolean;
}

export class InvoiceListItemDto {
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

  @ApiProperty()
  grandTotal!: number;

  @ApiProperty()
  paymentStatus!: string;

  @ApiPropertyOptional()
  pdfPath?: string | null;

  @ApiPropertyOptional()
  pdfGeneratedAt?: string | null;
}

export class InvoiceListResponseDto {
  @ApiProperty({ type: [InvoiceListItemDto] })
  data!: InvoiceListItemDto[];

  @ApiProperty()
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export class RegenerateInvoiceDto {
  @ApiPropertyOptional({ description: 'Invoice UUID to regenerate' })
  invoiceId?: string;

  @ApiPropertyOptional({ description: 'Order UUID (alternative to invoiceId)' })
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Send invoice email to customer after regeneration',
    default: false,
  })
  sendEmail?: boolean;
}

export class RegenerateInvoiceResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty()
  pdfPath!: string;

  @ApiProperty()
  pdfGeneratedAt!: string;

  @ApiPropertyOptional()
  emailSent?: boolean;
}
