import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateHomeSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() apiSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() layoutType?: string;
}

export class ReorderHomeSectionsDto {
  @ApiPropertyOptional()
  items!: Array<{ id: string; displayOrder: number }>;
}
