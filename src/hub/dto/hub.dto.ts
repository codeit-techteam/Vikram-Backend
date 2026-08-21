import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/client';

export class HubPaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class HubOrderQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional({
    enum: [
      'pending',
      'accepted',
      'loading',
      'ready',
      'out_for_delivery',
      'delivered',
      'emergency',
      'bulk',
      'membership',
    ],
  })
  @IsOptional()
  @IsString()
  filter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class HubOrderActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubRejectOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class HubCancelOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class HubAssignDriverDto {
  @ApiProperty()
  @IsUUID()
  driverId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'ISO datetime for expected delivery' })
  @IsOptional()
  @IsString()
  expectedDeliveryAt?: string;
}

export class HubUpdateStatusDto {
  @ApiProperty({
    description:
      'Target status (canonical or alias): AcceptedByHub, Picking, Packed, DriverAssigned, OutForDelivery, Delivered, Cancelled',
  })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedDeliveryAt?: string;
}

export class HubAssignVehicleDto {
  @ApiProperty()
  @IsUUID()
  vehicleId!: string;
}

export class HubAssignLoaderDto {
  @ApiProperty()
  @IsUUID()
  loaderId!: string;
}

export class HubAssignTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  loaderId?: string;
}

export class HubTimelineEntryDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubPodDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliveryPhotos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerSignature?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  otpVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubVerifyDeliveryOtpDto {
  @ApiProperty({ description: '6-digit customer delivery OTP' })
  @IsString()
  @IsNotEmpty()
  otp!: string;
}

export class HubProfileUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
}

export class HubInventoryUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  availableQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}

export class HubInventoryReceiveDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubInventoryAdjustDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Positive to add, negative to deduct' })
  @Type(() => Number)
  @IsInt()
  adjustment!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class HubInventoryTransferDto {
  @ApiProperty()
  @IsUUID()
  toHubId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubProductStockDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  availableQty!: number;
}

export class HubProductEtaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deliveryEta!: string;
}

export class HubLoadingStartDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class HubLoadingCompleteDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class HubUnloadingStartDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubUnloadingCompleteDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proofPhotos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubDispatchCreateDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiProperty()
  @IsUUID()
  driverId!: string;

  @ApiProperty()
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional({ description: 'Delivery slot label e.g. 02:30 PM' })
  @IsOptional()
  @IsString()
  deliverySlot?: string;

  @ApiPropertyOptional({ description: 'ISO ETA timestamp' })
  @IsOptional()
  @IsString()
  estimatedEta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubDispatchLiveQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Queue tab: pending | loading | dispatched | out_for_delivery | delivered | cancelled | delay | all',
  })
  @IsOptional()
  @IsString()
  tab?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'eta | priority | driver | vehicle' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}

export class HubDispatchUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class HubDriverCreateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;
}

export class HubDriverUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;
}

export class HubVehicleCreateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  registration!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capacity!: number;

  @ApiPropertyOptional({ enum: ['TRUCK', 'TEMPO', 'BIKE', 'OTHER'] })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payloadKg?: number;

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
  @IsBoolean()
  gpsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpsDeviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedDriverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseHubId?: string;
}

export class HubVehicleUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registration?: string;

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

  @ApiPropertyOptional()
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
  @IsBoolean()
  gpsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpsDeviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedDriverId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class HubEmergencyPriorityDto {
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsString()
  @IsNotEmpty()
  priorityLevel!: string;
}

export class HubNotificationReadDto {
  @ApiProperty()
  @IsUUID()
  id!: string;
}

export class HubSearchQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional({
    enum: [
      'all',
      'orders',
      'products',
      'drivers',
      'vehicles',
      'inventory',
      'dispatches',
      'requisitions',
    ],
    default: 'all',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ description: 'Search query (order no, SKU, truck, driver…)' })
  @IsString()
  @IsNotEmpty()
  q!: string;
}

export class HubReportsQueryDto {
  @ApiPropertyOptional({
    enum: [
      'today',
      'last_7_days',
      'last_30_days',
      'last_90_days',
      'this_month',
      'last_month',
      'custom',
    ],
  })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: 'ISO date / datetime (range start)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO date / datetime (range end)' })
  @IsOptional()
  @IsString()
  toDate?: string;

  /** Alias for fromDate */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  /** Alias for toDate */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}

export class HubInventoryQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  lowStockOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Catalog category slug (same as Customer App /categories)',
  })
  @IsOptional()
  @IsString()
  categorySlug?: string;
}

export class HubProductsQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class HubBulkQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class HubEmergencyQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class HubNotificationsQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unreadOnly?: boolean;
}

export class HubLoadingQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class HubDispatchQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class HubDriversQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class HubVehiclesQueryDto extends HubPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
