import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VEHICLE_STATUSES = [
  'AVAILABLE',
  'ASSIGNED',
  'LOADING',
  'OUT_FOR_DELIVERY',
  'REACHED',
  'RETURNING',
  'MAINTENANCE',
  'INACTIVE',
  'BLOCKED',
  'DOCUMENT_EXPIRED',
] as const;

const DOC_TYPES = [
  'RC',
  'INSURANCE',
  'FITNESS',
  'PUC',
  'PERMIT',
  'OTHER',
] as const;

export class AdminVehiclesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: VEHICLE_STATUSES })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseHubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ enum: ['expired', 'expiring_soon', 'valid'] })
  @IsOptional()
  @IsString()
  compliance?: 'expired' | 'expiring_soon' | 'valid';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  gpsEnabled?: boolean;
}

export class AdminVehicleCreateDto {
  @ApiProperty({ example: 'MH-04-AX-1290' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  registration!: string;

  @ApiProperty()
  @IsUUID()
  hubId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseHubId?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payloadKg?: number;

  @ApiPropertyOptional({ enum: ['TRUCK', 'TEMPO', 'BIKE', 'OTHER'] })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  manufactureYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fastagNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  odometerKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fitnessCertificateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fitnessExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pucNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  pucExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permitType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permitNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  permitExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roadTaxStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  roadTaxExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  gpsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpsDeviceId?: string;

  @ApiPropertyOptional({ enum: VEHICLE_STATUSES })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedDriverId?: string;
}

export class AdminVehicleUpdateDto {
  @ApiPropertyOptional({ example: 'MH-04-AX-1290' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  registration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseHubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payloadKg?: number;

  @ApiPropertyOptional({ enum: ['TRUCK', 'TEMPO', 'BIKE', 'OTHER'] })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  manufactureYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fastagNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  odometerKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fitnessCertificateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fitnessExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pucNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  pucExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permitType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  permitNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  permitExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roadTaxStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  roadTaxExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  gpsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpsDeviceId?: string;

  @ApiPropertyOptional({ enum: VEHICLE_STATUSES })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedDriverId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maintenanceReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  maintenanceStartedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  maintenanceExpectedAt?: string;
}

export class AdminVehicleAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseHubId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedDriverId?: string | null;
}

export class AdminVehicleStatusDto {
  @ApiProperty({ enum: VEHICLE_STATUSES })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maintenanceReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  maintenanceExpectedAt?: string;
}

export class AdminVehicleDriverDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  assignedDriverId!: string | null;
}

export class VehicleDocumentUploadUrlDto {
  @ApiProperty({ enum: DOC_TYPES })
  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiProperty({ example: 102400 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize!: number;
}

export class VehicleDocumentConfirmDto extends VehicleDocumentUploadUrlDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
