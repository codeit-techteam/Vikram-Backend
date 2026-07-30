import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Product UUID to add',
  })
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Product variant UUID (required when product has multiple variants)',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Quantity to add (increments if product+variant already in cart)',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Preferred fulfillment hub UUID' })
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional({ description: 'Snapshot ETA minutes from delivery API' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  etaMinutes?: number;
}

export class UpdateCartItemDto {
  @ApiProperty({
    example: 5,
    description: 'New absolute quantity for the cart item',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CartProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  brand?: string | null;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiPropertyOptional()
  variant?: string | null;

  @ApiPropertyOptional()
  mrp?: number | null;

  @ApiProperty()
  unit!: string;

  @ApiPropertyOptional()
  thumbnailUrl?: string | null;

  @ApiProperty()
  maxOrder?: number | null;

  @ApiProperty()
  minOrder!: number;
}

export class CartItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiPropertyOptional()
  variantId?: string | null;

  @ApiPropertyOptional()
  hubId?: string | null;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 425, description: 'Unit price (ex-GST) snapshot' })
  price!: number;

  @ApiProperty({ example: 18, description: 'GST % snapshot' })
  gst!: number;

  @ApiProperty({ example: 850, description: 'price × quantity (ex-GST)' })
  subtotal!: number;

  @ApiProperty({ example: 153, description: 'GST amount for this line' })
  gstAmount!: number;

  @ApiProperty({ example: 1003, description: 'Line total including GST' })
  lineTotal!: number;

  @ApiPropertyOptional({ example: 50, description: 'Bulk discount saved on this line' })
  bulkDiscount?: number;

  @ApiPropertyOptional({ example: 35 })
  etaMinutes?: number | null;

  @ApiProperty({ type: CartProductDto })
  product!: CartProductDto;
}

export class CartResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({ example: 2 })
  itemCount!: number;

  @ApiProperty({ example: 850, description: 'Sum of line subtotals (ex-GST)' })
  subtotal!: number;

  @ApiProperty({ example: 153 })
  gstAmount!: number;

  @ApiProperty({ example: 150, description: 'Delivery charge (0 if free delivery threshold met)' })
  deliveryCharge!: number;

  @ApiProperty({ example: 1153 })
  grandTotal!: number;
}
