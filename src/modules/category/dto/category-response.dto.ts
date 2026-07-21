import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'cement' })
  slug!: string;

  @ApiProperty({ example: 'Cement' })
  name!: string;

  @ApiPropertyOptional({ example: 'सीमेंट' })
  nameHi?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Alias for imageUrl' })
  image?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Alias for iconUrl' })
  icon?: string | null;

  @ApiPropertyOptional()
  iconUrl?: string | null;

  @ApiPropertyOptional({ example: 'cement' })
  labelKey?: string | null;

  @ApiProperty({ example: 0 })
  displayOrder!: number;

  @ApiProperty({ example: true })
  isFeatured!: boolean;

  @ApiProperty({ example: true })
  isVisible!: boolean;

  @ApiPropertyOptional({ example: 12 })
  productCount?: number;
}

export class CategoryDetailResponseDto extends CategoryResponseDto {
  @ApiPropertyOptional({ type: [CategoryResponseDto] })
  children?: CategoryResponseDto[];
}
