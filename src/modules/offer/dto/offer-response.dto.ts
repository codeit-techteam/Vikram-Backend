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
  badge?: string | null;

  @ApiProperty()
  priority!: number;

  @ApiPropertyOptional()
  visibility?: string;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiProperty()
  isVisible!: boolean;

  @ApiPropertyOptional()
  startDate?: Date | null;

  @ApiPropertyOptional()
  endDate?: Date | null;

  @ApiPropertyOptional({ type: [OfferProductResponseDto] })
  products?: OfferProductResponseDto[];
}
