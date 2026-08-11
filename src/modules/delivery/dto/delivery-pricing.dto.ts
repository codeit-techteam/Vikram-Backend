import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DeliveryPricingStatus,
  DeliveryVehicleType,
} from '../../../../generated/prisma/client';

export class CalculateDeliveryPricingDto {
  @ApiProperty({ enum: DeliveryVehicleType, example: DeliveryVehicleType.BIKE })
  @IsEnum(DeliveryVehicleType)
  vehicleType!: DeliveryVehicleType;

  @ApiProperty({ example: 2.5, description: 'Delivery distance in km' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKm!: number;

  @ApiPropertyOptional({
    description: 'When true, preview free-bike benefit for authenticated customer',
  })
  @IsOptional()
  applyFreeBikeBenefit?: boolean;
}

export class CreateDeliveryPricingDto {
  @ApiProperty({ enum: DeliveryVehicleType })
  @IsEnum(DeliveryVehicleType)
  vehicleType!: DeliveryVehicleType;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceFromKm!: number;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceToKm!: number;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ enum: DeliveryPricingStatus })
  @IsOptional()
  @IsEnum(DeliveryPricingStatus)
  status?: DeliveryPricingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateDeliveryPricingDto {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceFromKm?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceToKm?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: DeliveryPricingStatus })
  @IsOptional()
  @IsEnum(DeliveryPricingStatus)
  status?: DeliveryPricingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateDeliveryPricingStatusDto {
  @ApiProperty({ enum: DeliveryPricingStatus })
  @IsEnum(DeliveryPricingStatus)
  status!: DeliveryPricingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateDeliveryBenefitConfigDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstBikeDeliveriesFree?: number;

  @ApiPropertyOptional({
    example: 99,
    description: 'Company absorption when free bike benefit is used (separate from Bike list price)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  companyAbsorptionInr?: number;

  @ApiPropertyOptional({ enum: DeliveryPricingStatus })
  @IsOptional()
  @IsEnum(DeliveryPricingStatus)
  status?: DeliveryPricingStatus;
}

export class DeliveryPricingListQueryDto {
  @ApiPropertyOptional({ enum: DeliveryVehicleType })
  @IsOptional()
  @IsEnum(DeliveryVehicleType)
  vehicleType?: DeliveryVehicleType;

  @ApiPropertyOptional({ enum: DeliveryPricingStatus })
  @IsOptional()
  @IsEnum(DeliveryPricingStatus)
  status?: DeliveryPricingStatus;
}

export class DeliveryPricingIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}
