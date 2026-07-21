import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'ultratech cement',
    description: 'Search keyword (preferred)',
  })
  @ValidateIf((o: SearchQueryDto) => !o.q)
  @IsString()
  @MinLength(1)
  keyword?: string;

  @ApiPropertyOptional({
    example: 'ultratech cement',
    description: 'Alias for keyword',
  })
  @ValidateIf((o: SearchQueryDto) => !o.keyword)
  @IsString()
  @MinLength(1)
  q?: string;

  @ApiPropertyOptional({
    example: 'cement',
    description: 'Filter products by category slug',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'relevance',
    description:
      'Sort: relevance | price_asc | price_desc | newest | sales | name',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}

export class SearchSuggestionsQueryDto {
  @ApiPropertyOptional({ example: 'ult', description: 'Partial keyword' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'ult', description: 'Alias for keyword' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}
