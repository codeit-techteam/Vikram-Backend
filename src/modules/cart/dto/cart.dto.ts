import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
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
    example: 1,
    default: 1,
    description: 'Quantity to add (increments if product already in cart)',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
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
