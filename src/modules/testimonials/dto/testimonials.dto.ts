import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TestimonialType } from '../../../../generated/prisma/client';

export class TestimonialResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TestimonialType })
  type!: TestimonialType;

  @ApiPropertyOptional()
  videoUrl?: string | null;

  @ApiPropertyOptional()
  thumbnail?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiProperty()
  customerName!: string;

  @ApiPropertyOptional()
  designation?: string | null;

  @ApiPropertyOptional()
  location?: string | null;

  @ApiProperty()
  rating!: number;

  @ApiPropertyOptional()
  review?: string | null;

  @ApiProperty()
  sortOrder!: number;
}
