import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InvoiceStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../../generated/prisma/client';
import { PaginationMetaDto } from '../../../common/dto/pagination.dto';

export class OrderItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiPropertyOptional()
  variantId?: string | null;

  @ApiProperty({ description: 'Product name snapshot' })
  name!: string;

  @ApiProperty({ description: 'Alias of name for client convenience' })
  productName!: string;

  @ApiPropertyOptional()
  productImage?: string | null;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiPropertyOptional()
  brand?: string | null;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiPropertyOptional()
  productType?: string | null;

  @ApiPropertyOptional()
  grade?: string | null;

  @ApiPropertyOptional()
  variant?: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ example: 425, description: 'Unit selling price (ex-GST)' })
  unitPrice!: number;

  @ApiProperty({ example: 425, description: 'Alias of unitPrice' })
  price!: number;

  @ApiPropertyOptional({ example: 450 })
  mrp?: number | null;

  @ApiProperty({ example: 18 })
  gst!: number;

  @ApiProperty({ example: 850 })
  subtotal!: number;
}

export class OrderCustomerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  phone!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  fullName?: string | null;
}

export class OrderHubDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  pincode!: string;

  @ApiPropertyOptional()
  phone?: string | null;
}

export class OrderAddressDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  label?: string | null;

  @ApiProperty()
  line1!: string;

  @ApiPropertyOptional()
  line2?: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  pincode!: string;

  @ApiPropertyOptional()
  country?: string;
}

export class OrderTimelineEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiPropertyOptional()
  remarks?: string | null;

  @ApiPropertyOptional()
  message?: string | null;

  @ApiProperty()
  updatedBy!: string;

  @ApiPropertyOptional()
  updatedByRole?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class OrderPaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;
}

export class OrderListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty()
  grandTotal!: number;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  canCancel?: boolean;

  @ApiPropertyOptional()
  isEmergency?: boolean;

  @ApiPropertyOptional()
  priorityOrder?: boolean;

  @ApiPropertyOptional()
  deliveredAt?: string | null;

  @ApiPropertyOptional()
  expectedDeliveryAt?: string | null;

  @ApiPropertyOptional({
    description: 'ISO timestamp — used by clients for cache freshness',
  })
  updatedAt?: string;

  @ApiPropertyOptional({
    description: 'Monotonic version (updatedAt epoch ms)',
  })
  version?: number;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderListItemDto] })
  items!: OrderListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class OrderDetailResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  subtotal!: number;

  @ApiProperty()
  gstAmount!: number;

  @ApiProperty()
  deliveryCharge!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  grandTotal!: number;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  cancelReason?: string | null;

  @ApiPropertyOptional()
  cancelledAt?: string | null;

  @ApiPropertyOptional()
  deliveredAt?: string | null;

  @ApiProperty()
  canCancel!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({
    description: 'Monotonic version (updatedAt epoch ms)',
  })
  version?: number;

  @ApiProperty({ type: OrderCustomerDto })
  customer!: OrderCustomerDto;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiPropertyOptional({ type: OrderHubDto })
  hub?: OrderHubDto | null;

  @ApiProperty({ type: OrderAddressDto })
  address!: OrderAddressDto;

  @ApiProperty({ type: OrderPaymentDto })
  payment!: OrderPaymentDto;

  @ApiProperty({ type: [OrderTimelineEventDto] })
  timeline!: OrderTimelineEventDto[];

  @ApiPropertyOptional({ enum: InvoiceStatus })
  invoiceStatus?: InvoiceStatus | null;

  @ApiPropertyOptional()
  invoiceNumber?: string | null;

  @ApiPropertyOptional()
  invoiceId?: string | null;

  @ApiPropertyOptional()
  expectedDeliveryAt?: string | null;

  @ApiPropertyOptional()
  isEmergency?: boolean;

  @ApiProperty()
  loyaltyPointsUsed!: number;

  @ApiProperty()
  membershipDiscount!: number;

  @ApiProperty()
  bulkProcurement!: boolean;

  @ApiProperty()
  priorityOrder!: boolean;

  @ApiPropertyOptional()
  driver?: {
    id: string;
    name: string;
    phone: string;
    vehicleNumber?: string | null;
    vehicleType?: string | null;
  } | null;

  @ApiPropertyOptional()
  vehicle?: {
    id: string;
    registration: string;
    vehicleType: string;
  } | null;

  @ApiPropertyOptional()
  driverReachedAt?: string | null;

  @ApiPropertyOptional()
  deliveryOtpGenerated?: boolean;

  @ApiPropertyOptional()
  deliveryOtpGeneratedAt?: string | null;

  @ApiPropertyOptional()
  deliveryOtpVerified?: boolean;

  @ApiPropertyOptional()
  deliveryCompletedAt?: string | null;
}

export class OrderStatusResponseDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  updatedAt!: string;
}
