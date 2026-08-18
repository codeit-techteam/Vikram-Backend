import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class DeliveryEtaCartItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.length > 0)
  @IsUUID()
  variantId?: string;

  @ApiProperty({ example: 1, minimum: 0.01, description: 'Supports decimal qty for RMC' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class DeliveryEtaQueryDto {
  @ApiPropertyOptional({ example: 28.6139 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 77.209 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  /** Alias for latitude (coverage-style query params) */
  @ApiPropertyOptional({ example: 28.6139 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  /** Alias for longitude */
  @ApiPropertyOptional({ example: 77.209 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: '110001' })
  @IsOptional()
  @IsString()
  pincode?: string;

  /** Comma-separated productIds (GET convenience) */
  @ApiPropertyOptional({
    description: 'Comma-separated product UUIDs',
    example: 'uuid1,uuid2',
  })
  @IsOptional()
  @IsString()
  productIds?: string;

  /** Comma-separated quantities matching productIds */
  @ApiPropertyOptional({ example: '2,1' })
  @IsOptional()
  @IsString()
  quantities?: string;
}

export class DeliveryEtaBodyDto {
  @ApiProperty({ example: 28.6139 })
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 77.209 })
  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ example: '110001' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ type: [DeliveryEtaCartItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryEtaCartItemDto)
  @ArrayMinSize(0)
  cartItems?: DeliveryEtaCartItemDto[];
}

export class DeliveryEtaTimingDto {
  @ApiProperty({ example: 25 })
  preparationMinutes!: number;

  @ApiProperty({ example: 5 })
  pickingMinutes!: number;

  @ApiProperty({ example: 5 })
  packingMinutes!: number;

  @ApiProperty({ example: 8 })
  vehicleAssignmentMinutes!: number;

  @ApiProperty({ example: 10 })
  queueMinutes!: number;

  @ApiProperty({ example: 15 })
  loadingMinutes!: number;

  @ApiProperty({ example: 22 })
  travelMinutes!: number;

  @ApiProperty({ example: 20 })
  unloadingMinutes!: number;

  @ApiProperty({ example: 10 })
  siteAccessMinutes!: number;

  @ApiProperty({ example: 15 })
  bufferMinutes!: number;

  @ApiProperty({ example: 25 })
  plantPreparationMinutes!: number;

  @ApiProperty({ example: 15 })
  mixerLoadingMinutes!: number;
}

export class DeliveryEtaFulfillmentSourceDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiProperty({ example: 'HUB', enum: ['HUB', 'RMC_PLANT', 'WAREHOUSE'] })
  type!: string;

  @ApiPropertyOptional()
  name?: string;
}

export class DeliveryEtaResponseDto {
  @ApiProperty()
  serviceable!: boolean;

  @ApiProperty({ example: 95, description: 'Point ETA in minutes (mid of range)' })
  deliveryETA!: number;

  @ApiPropertyOptional({ example: 85 })
  etaMinMinutes?: number;

  @ApiPropertyOptional({ example: 110 })
  etaMaxMinutes?: number;

  @ApiPropertyOptional({ example: 'MEDIUM', enum: ['HIGH', 'MEDIUM', 'LOW'] })
  etaConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';

  @ApiProperty({ example: 'Estimated delivery 1.5–2 hrs' })
  deliveryMessage!: string;

  @ApiPropertyOptional({ example: 'Mixer Truck Delivery' })
  deliveryModeTitle?: string;

  @ApiProperty({ example: 'Today' })
  deliveryDay!: 'Today' | 'Tomorrow' | 'Later' | 'Unavailable';

  @ApiPropertyOptional({ example: '5:20 PM' })
  deliveringBy?: string | null;

  @ApiProperty({ example: 150 })
  deliveryCharge!: number;

  @ApiProperty()
  freeDelivery!: boolean;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ example: 'RMC_TRANSIT_MIXER' })
  deliveryVehicleType?: string;

  @ApiPropertyOptional({ example: 'RMC Transit Mixer' })
  deliveryVehicleDisplayName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/delivery-vehicles/bike.png' })
  deliveryVehicleImageUrl?: string | null;

  @ApiPropertyOptional({ example: 1 })
  deliveryVehicleCount?: number;

  @ApiPropertyOptional({ example: 4.2 })
  deliveryDistanceKm?: number;

  @ApiPropertyOptional({ example: 2400 })
  deliveryTotalWeightKg?: number | null;

  @ApiPropertyOptional({ example: 35.3 })
  deliveryTotalVolumeCft?: number | null;

  @ApiPropertyOptional({ example: 2400 })
  deliveryCapacityUsed?: number | null;

  @ApiPropertyOptional({ example: 14400 })
  deliveryCapacityLimit?: number | null;

  @ApiPropertyOptional({ example: 'RMC' })
  deliveryLogisticsType?: string;

  @ApiPropertyOptional({
    example:
      'Stone aggregate is classified as heavy/bulk material and is not eligible for Bike delivery.',
  })
  deliverySelectionReason?: string;

  @ApiPropertyOptional({ type: DeliveryEtaTimingDto })
  timing?: DeliveryEtaTimingDto;

  @ApiPropertyOptional()
      trafficDataAvailable?: boolean;

  @ApiPropertyOptional({ example: 2 })
  calculationVersion?: number;

  @ApiPropertyOptional({ type: DeliveryEtaFulfillmentSourceDto })
  fulfillmentSource?: DeliveryEtaFulfillmentSourceDto;
}
