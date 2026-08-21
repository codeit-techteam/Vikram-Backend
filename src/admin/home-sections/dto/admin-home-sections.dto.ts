import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateHomeSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() apiSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() layoutType?: string;
}

export class ReorderHomeSectionItemDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsInt() displayOrder!: number;
}

export class ReorderHomeSectionsDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        displayOrder: { type: 'number' },
      },
    },
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderHomeSectionItemDto)
  items!: ReorderHomeSectionItemDto[];
}
