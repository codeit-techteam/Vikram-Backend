import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class FindHubQueryDto {
  @ApiPropertyOptional({ example: 22.975 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 88.434 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: '741235' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @ApiPropertyOptional({
    description: 'Optional comma-separated productIds to check stock',
    example: 'uuid1,uuid2',
  })
  @IsOptional()
  @IsString()
  productIds?: string;

  @ApiPropertyOptional({
    description:
      'Optional quantities matching productIds order (comma-separated)',
    example: '10,5',
  })
  @IsOptional()
  @IsString()
  quantities?: string;
}

export class HubStockQueryDto {
  @ApiPropertyOptional({
    description: 'Hub UUID; if omitted uses find-hub result',
  })
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional({ example: 22.975 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 88.434 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: '741235' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;
}
