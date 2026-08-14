import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OfferProductResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiProperty()
  retailPrice!: number;

  @ApiProperty()
  price!: number;

  @ApiPropertyOptional()
  available?: boolean;

  @ApiPropertyOptional()
  categoryName?: string | null;

  @ApiPropertyOptional()
  brand?: string | null;
}

export class OfferResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  titleHi?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Offer banner image' })
  bannerImage?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiPropertyOptional()
  mobileImageUrl?: string | null;

  @ApiProperty()
  offerType!: string;

  @ApiPropertyOptional({ example: '15% OFF' })
  discountLabel?: string | null;

  @ApiPropertyOptional()
  discountValue?: number | null;

  @ApiPropertyOptional()
  discountPercent?: number | null;

  @ApiPropertyOptional()
  bundlePrice?: number | null;

  @ApiPropertyOptional()
  originalPrice?: number | null;

  @ApiPropertyOptional()
  startingFrom?: number | null;

  @ApiPropertyOptional()
  badge?: string | null;

  @ApiPropertyOptional()
  ctaLabel?: string | null;

  @ApiPropertyOptional()
  ctaAction?: string | null;

  @ApiPropertyOptional()
  ctaValue?: string | null;

  @ApiProperty()
  priority!: number;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiPropertyOptional()
  startDate?: Date | null;

  @ApiPropertyOptional()
  endDate?: Date | null;

  @ApiPropertyOptional()
  productCount?: number;

  @ApiPropertyOptional({ type: [String] })
  categories?: string[];

  @ApiPropertyOptional({ type: [OfferProductResponseDto] })
  products?: OfferProductResponseDto[];
}
