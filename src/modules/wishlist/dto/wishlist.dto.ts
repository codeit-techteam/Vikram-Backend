import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddWishlistDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Product UUID to add to wishlist',
  })
  @IsUUID()
  @IsNotEmpty()
  productId!: string;
}

export class WishlistProductDto {
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

  @ApiProperty({ example: 425 })
  price!: number;

  @ApiProperty({ example: 18 })
  gst!: number;

  @ApiPropertyOptional()
  thumbnailUrl?: string | null;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty({ example: 'IN STOCK' })
  status!: string;
}

export class WishlistItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: WishlistProductDto })
  product!: WishlistProductDto;
}

export class WishlistResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [WishlistItemDto] })
  items!: WishlistItemDto[];

  @ApiProperty({ example: 3, description: 'Total products in wishlist' })
  count!: number;
}
