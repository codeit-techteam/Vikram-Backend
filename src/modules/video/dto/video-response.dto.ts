import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VideoResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  videoUrl!: string;

  @ApiPropertyOptional({ description: 'Alias for thumbnailUrl' })
  thumbnail?: string | null;

  @ApiPropertyOptional()
  thumbnailUrl?: string | null;

  @ApiProperty()
  placement!: string;

  @ApiPropertyOptional()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  linkType?: string | null;

  @ApiPropertyOptional()
  linkTarget?: string | null;

  @ApiPropertyOptional()
  ctaLabel?: string | null;

  @ApiPropertyOptional()
  duration?: number | null;

  @ApiProperty()
  displayOrder!: number;

  @ApiProperty()
  isVisible!: boolean;
}
