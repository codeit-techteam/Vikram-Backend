import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class DeliveryOptionsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;
}

export class HoldDeliverySlotDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  addressId?: string;
}

export class DeliverySlotViewDto {
  @ApiProperty()
  slotId!: string;

  @ApiProperty({ example: '2026-08-20' })
  date!: string;

  @ApiProperty({ example: '20 Aug' })
  dateLabel!: string;

  @ApiProperty({ example: 900 })
  startMinutes!: number;

  @ApiProperty({ example: 1080 })
  endMinutes!: number;

  @ApiProperty({ example: '3:00 PM – 6:00 PM' })
  label!: string;

  @ApiProperty()
  startAt!: string;

  @ApiProperty()
  endAt!: string;

  @ApiProperty()
  available!: boolean;

  @ApiProperty()
  capacity!: number;

  @ApiProperty()
  reservedCapacity!: number;

  @ApiProperty()
  availableCapacity!: number;
}

export class DeliveryAsapOptionDto {
  @ApiProperty()
  available!: boolean;

  @ApiPropertyOptional()
  etaMinMinutes?: number | null;

  @ApiPropertyOptional()
  etaMaxMinutes?: number | null;

  @ApiPropertyOptional({ example: 'Arrives in about 1–2 hours' })
  etaLabel?: string | null;

  @ApiPropertyOptional()
  reason?: string | null;
}

export class DeliveryDayOptionDto {
  @ApiProperty()
  available!: boolean;

  @ApiProperty({ example: '2026-08-18' })
  date!: string;

  @ApiProperty({ example: '18 Aug' })
  dateLabel!: string;

  @ApiProperty({ type: [DeliverySlotViewDto] })
  slots!: DeliverySlotViewDto[];

  @ApiPropertyOptional()
  reason?: string | null;
}

export class DeliveryScheduledDayDto {
  @ApiProperty({ example: '2026-08-20' })
  date!: string;

  @ApiProperty({ example: '20 Aug' })
  dateLabel!: string;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ type: [DeliverySlotViewDto] })
  slots!: DeliverySlotViewDto[];
}

export class DeliveryNextAvailableDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  dateLabel!: string;

  @ApiProperty()
  slotId!: string;

  @ApiProperty()
  slotLabel!: string;
}

export class DeliveryOptionsResponseDto {
  @ApiProperty()
  serviceable!: boolean;

  @ApiPropertyOptional()
  unavailableReason?: string | null;

  @ApiPropertyOptional()
  hubClosed?: boolean;

  @ApiPropertyOptional()
  hubClosedMessage?: string | null;

  @ApiPropertyOptional()
  hubId?: string | null;

  @ApiPropertyOptional()
  hubName?: string | null;

  @ApiPropertyOptional()
  vehicleType?: string | null;

  @ApiPropertyOptional()
  vehicleDisplayName?: string | null;

  @ApiPropertyOptional()
  vehicleImageUrl?: string | null;

  @ApiPropertyOptional()
  logisticsType?: string | null;

  @ApiPropertyOptional()
  splitDelivery?: boolean;

  @ApiPropertyOptional()
  splitDeliveryMessage?: string | null;

  @ApiPropertyOptional()
  timezone?: string;

  @ApiProperty({ type: DeliveryAsapOptionDto })
  asap!: DeliveryAsapOptionDto;

  @ApiProperty({ type: DeliveryDayOptionDto })
  today!: DeliveryDayOptionDto;

  @ApiProperty({ type: DeliveryDayOptionDto })
  tomorrow!: DeliveryDayOptionDto;

  @ApiProperty({ type: [DeliveryScheduledDayDto] })
  scheduled!: DeliveryScheduledDayDto[];

  @ApiPropertyOptional({ type: DeliveryNextAvailableDto, nullable: true })
  nextAvailable?: DeliveryNextAvailableDto | null;

  @ApiPropertyOptional()
  defaultPreference?: string;
}

export class DeliverySlotHoldResponseDto {
  @ApiProperty()
  reservationId!: string;

  @ApiProperty()
  slotId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  expiresAt!: string;
}
