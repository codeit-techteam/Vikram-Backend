import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BannerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  subtitle?: string | null;

  @ApiProperty({ description: 'Desktop banner image (imageUrl)' })
  imageDesktop!: string;

  @ApiPropertyOptional({ description: 'Mobile banner image' })
  imageMobile?: string | null;

  @ApiProperty()
  imageUrl!: string;

  @ApiPropertyOptional()
  mobileUrl?: string | null;

  @ApiPropertyOptional()
  videoUrl?: string | null;

  @ApiPropertyOptional()
  thumbnailUrl?: string | null;

  @ApiPropertyOptional()
  badge?: string | null;

  @ApiPropertyOptional()
  bannerType?: string;

  @ApiPropertyOptional()
  buttonText?: string | null;

  @ApiPropertyOptional()
  buttonAction?: string | null;

  @ApiPropertyOptional()
  ctaLabel?: string | null;

  @ApiPropertyOptional({ description: 'CTA destination (linkUrl)' })
  ctaLink?: string | null;

  @ApiPropertyOptional()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  linkType?: string | null;

  @ApiPropertyOptional()
  linkTarget?: string | null;

  @ApiPropertyOptional()
  secondaryButtonText?: string | null;

  @ApiPropertyOptional()
  secondaryLinkUrl?: string | null;

  @ApiPropertyOptional()
  secondaryLinkType?: string | null;

  @ApiPropertyOptional()
  secondaryLinkTarget?: string | null;

  @ApiProperty()
  placement!: string;

  @ApiProperty()
  displayOrder!: number;

  @ApiPropertyOptional()
  priority?: number;

  @ApiPropertyOptional()
  visibility?: string;

  @ApiProperty()
  isVisible!: boolean;

  @ApiPropertyOptional()
  startDate?: Date | null;

  @ApiPropertyOptional()
  endDate?: Date | null;

  @ApiPropertyOptional({
    description: 'ALL | NEW_CUSTOMERS | FREE_BIKE_REMAINING | FREE_BIKE_EXHAUSTED',
  })
  targetAudience?: string;
}
