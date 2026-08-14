import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DeliveryPricingStatus,
  DeliveryVehicleType,
} from '../../../../generated/prisma/client';

export class CalculateDeliveryPricingDto {
  @ApiPropertyOptional({
    enum: DeliveryVehicleType,
    description:
      'Optional hint only. Prefer cartItems so backend selects vehicle from load.',
  })
  @IsOptional()
  @IsEnum(DeliveryVehicleType)
  vehicleType?: DeliveryVehicleType;

  @ApiPropertyOptional({ example: 2.5, description: 'Delivery distance in km' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional({
    description: 'When true, preview free-bike benefit for authenticated customer',
  })
  @IsOptional()
  applyFreeBikeBenefit?: boolean;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Cart items for load → vehicle → price calculation',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CalculateDeliveryCartItemDto)
  cartItems?: CalculateDeliveryCartItemDto[];
}

export class CalculateDeliveryCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class UpdateDeliveryVehicleConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Admin-configured max weight (kg). Do not invent defaults.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxWeightKg?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxVolumeCft?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxQuantity?: number | null;

  @ApiPropertyOptional({ example: 90, description: 'Safe utilization % (1–100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  capacityUtilizationLimit?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  avgLoadingTimeMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  avgUnloadingTimeMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  driverPreparationTimeMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  operationalBufferMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  avgSpeedKmh?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  supportsRmc?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  supportsBulkMaterial?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: [String],
    example: ['CEMENT', 'BRICKS'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedLogisticsTypes?: string[] | null;
}

export class UpdateDeliveryEngineConfigDto {
  @ApiPropertyOptional({
    enum: ['AUTO_SPLIT', 'BULK_QUOTE', 'REJECT'],
    example: 'BULK_QUOTE',
  })
  @IsOptional()
  @IsString()
  multiVehicleMode?: 'AUTO_SPLIT' | 'BULK_QUOTE' | 'REJECT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enablePartialDelivery?: boolean;

  @ApiPropertyOptional({
    description:
      'When capacities/product logistics are unset, fall back to bag-qty tiers',
  })
  @IsOptional()
  @IsBoolean()
  qtyTierFallbackEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bulkOrderThresholdKg?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bulkOrderThresholdCft?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bulkOrderThresholdQty?: number | null;
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
