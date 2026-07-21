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
  ctaLabel?: string | null;

  @ApiPropertyOptional({ description: 'CTA destination (linkUrl)' })
  ctaLink?: string | null;

  @ApiPropertyOptional()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  linkType?: string | null;

  @ApiPropertyOptional()
  linkTarget?: string | null;

  @ApiProperty()
  placement!: string;

  @ApiProperty()
  displayOrder!: number;

  @ApiPropertyOptional()
  visibility?: string;

  @ApiProperty()
  isVisible!: boolean;

  @ApiPropertyOptional()
  startDate?: Date | null;

  @ApiPropertyOptional()
  endDate?: Date | null;
}
