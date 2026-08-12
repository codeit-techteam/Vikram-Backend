import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class DeliveryEtaCartItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
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

export class DeliveryEtaBreakdownDto {
  @ApiProperty({ example: 5, description: 'Minutes to pick items' })
  pickingMinutes!: number;

  @ApiProperty({ example: 5 })
  packingMinutes!: number;

  @ApiProperty({ example: 5 })
  loadingMinutes!: number;

  @ApiProperty({ example: 12 })
  travelMinutes!: number;

  @ApiProperty({ example: 3 })
  trafficBufferMinutes!: number;
}

export class DeliveryEtaResponseDto {
  @ApiProperty()
  serviceable!: boolean;

  @ApiProperty({ example: 30, description: 'Total ETA in minutes' })
  deliveryETA!: number;

  @ApiProperty({ example: 'Delivery in 30 mins' })
  deliveryMessage!: string;

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

  @ApiPropertyOptional({ example: 'E_LOADER' })
  deliveryVehicleType?: string;

  @ApiPropertyOptional({ example: 'E-Loader' })
  deliveryVehicleDisplayName?: string;

  @ApiPropertyOptional({ example: 1 })
  deliveryVehicleCount?: number;

  @ApiPropertyOptional({ example: 4.2 })
  deliveryDistanceKm?: number;

  @ApiPropertyOptional({ example: 320 })
  deliveryTotalWeightKg?: number | null;

  @ApiPropertyOptional({ example: 320 })
  deliveryCapacityUsed?: number | null;

  @ApiPropertyOptional({ example: 500 })
  deliveryCapacityLimit?: number | null;
}
