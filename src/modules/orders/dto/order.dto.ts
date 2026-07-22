import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../../generated/prisma/client';

export class PlaceOrderDto {
  @ApiPropertyOptional({
    description: 'Delivery address UUID. Defaults to customer default address.',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    example: 'Please call before delivery',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: 'MVP payment placeholder — CASH or MANUAL only (no gateway)',
    default: PaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 500,
    description: 'Loyalty points to redeem (min 500, max 30% of order value)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;
}

export class OrderItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ example: 425 })
  unitPrice!: number;

  @ApiProperty({ example: 18 })
  gst!: number;

  @ApiProperty({ example: 850 })
  subtotal!: number;
}

export class OrderTimelineResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiPropertyOptional()
  remarks?: string | null;

  @ApiPropertyOptional()
  updatedBy?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class OrderHubSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;
}

export class OrderAddressSnapshotDto {
  @ApiProperty()
  id!: string;

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
}

export class OrderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'BJW-2026-000001' })
  orderNumber!: string;

  @ApiProperty({ enum: OrderStatus })
  orderStatus!: OrderStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ example: 850 })
  subtotal!: number;

  @ApiProperty({ example: 153 })
  gstAmount!: number;

  @ApiProperty({ example: 150 })
  deliveryCharge!: number;

  @ApiProperty({ example: 1153 })
  grandTotal!: number;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiProperty({ type: OrderAddressSnapshotDto })
  address!: OrderAddressSnapshotDto;

  @ApiPropertyOptional({ type: OrderHubSummaryDto, nullable: true })
  hub!: OrderHubSummaryDto | null;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty({ type: [OrderTimelineResponseDto] })
  timeline!: OrderTimelineResponseDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
