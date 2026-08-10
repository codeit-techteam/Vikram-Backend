import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EntityStatus } from '../../../../generated/prisma/client';

/** Hub operational actions for PATCH /:id/status */
export enum HubOperationalAction {
  ENABLE = 'ENABLE',
  DISABLE = 'DISABLE',
  SUSPEND = 'SUSPEND',
}

/** Derived hub display status */
export enum HubDisplayStatus {
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
  SUSPENDED = 'SUSPENDED',
}

export enum HubSortField {
  NAME = 'name',
  CODE = 'code',
  CITY = 'city',
  STATE = 'state',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
}

export enum HubSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum HubOrderGroup {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DISPATCHED = 'DISPATCHED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export class AdminHubQueryDto {
  @ApiPropertyOptional({
    description: 'Search by hub name, code, city, or phone',
    example: 'Mumbai',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: [...Object.values(EntityStatus), ...Object.values(HubDisplayStatus)],
    description: 'Filter by entity status or display status (ENABLED, DISABLED, SUSPENDED)',
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    description: 'Filter by manager ID or search manager name/email',
    example: 'hubmanager01',
  })
  @IsOptional()
  @IsString()
  manager?: string;

  @ApiPropertyOptional({ enum: HubSortField, default: HubSortField.CREATED_AT })
  @IsOptional()
  @IsEnum(HubSortField)
  sortBy?: HubSortField = HubSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: HubSortOrder, default: HubSortOrder.DESC })
  @IsOptional()
  @IsEnum(HubSortOrder)
  sortOrder?: HubSortOrder = HubSortOrder.DESC;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class CreateAdminHubDto {
  @ApiProperty({ example: 'Bajriwala Mumbai Central Hub' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'HUB-MUM-01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code?: string;

  @ApiProperty({ example: 'Plot 12, Industrial Estate, Andheri East' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;

  @ApiPropertyOptional({ example: 'Near Metro Station' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine2?: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: '400069' })
  @IsString()
  @MaxLength(10)
  pincode: string;

  @ApiProperty({ example: 19.1136 })
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 72.8697 })
  @Type(() => Number)
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({ example: 'mumbai.hub@bajriwala.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 500, description: 'Maximum storage capacity in units' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 'Mon-Sat 8:00 AM - 8:00 PM' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workingHours?: string;

  @ApiPropertyOptional({ enum: EntityStatus, default: EntityStatus.ACTIVE })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminHubDto {
  @ApiPropertyOptional({ example: 'Bajriwala Mumbai Central Hub' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 15, description: 'Service coverage radius in KM' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ example: ['110001'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coveragePincodes?: string[];

  @ApiPropertyOptional({ description: 'Coverage polygon GeoJSON' })
  @IsOptional()
  coveragePolygon?: unknown;

  @ApiPropertyOptional({ example: 'wh-main' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Main Warehouse Gurugram' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  warehouseCode?: string;

  @ApiPropertyOptional({ example: 'HUB-MUM-01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional({ example: 'Plot 12, Industrial Estate, Andheri East' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: '400069' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @ApiPropertyOptional({ example: 19.1136 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 72.8697 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({ example: 'mumbai.hub@bajriwala.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 'Mon-Sat 8:00 AM - 8:00 PM' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workingHours?: string;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProvisionHubManagerDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName: string;

  @ApiPropertyOptional({ example: 'hubmanager.kalyani' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeId?: string;

  @ApiProperty({ example: 'rahul@hub.example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Temporary password; auto-generated if omitted',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;
}

export class ProvisionHubInventoryItemDto {
  @ApiPropertyOptional({ description: 'Catalog product UUID' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Catalog variant UUID' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({ description: 'Catalog SKU if productId unknown' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @ApiPropertyOptional({ description: 'Product name fallback for matching' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  productName?: string;

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  availableQty: number;

  @ApiPropertyOptional({ example: 50, description: 'Reorder / low-stock threshold' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumStock?: number;
}

export class ProvisionHubDriverDto {
  @ApiProperty({ example: 'Rajesh Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '9876543211' })
  @IsString()
  @MaxLength(15)
  phone: string;

  @ApiPropertyOptional({ example: 'BIKE', enum: ['TRUCK', 'TEMPO', 'BIKE', 'OTHER', 'PICKUP'] })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({ example: 'WB12AB1234' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleNumber?: string;
}

export class UpdateHubCoverageDto {
  @ApiPropertyOptional({ example: 22.975 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 88.434 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ example: ['741235'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pincodes?: string[];

  @ApiPropertyOptional({ description: 'GeoJSON polygon or coordinate array' })
  @IsOptional()
  polygon?: unknown;
}

export class AddHubInventoryDto {
  @ApiProperty({ type: [ProvisionHubInventoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionHubInventoryItemDto)
  items: ProvisionHubInventoryItemDto[];
}

export class CreateHubManagerDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName: string;

  @ApiPropertyOptional({ example: 'rahul.sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeId?: string;

  @ApiProperty({ example: 'rahul@company.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({ example: 'Rahul@123' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;
}

export class AddHubDriversDto {
  @ApiProperty({ type: [ProvisionHubDriverDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionHubDriverDto)
  drivers: ProvisionHubDriverDto[];
}

export class ProvisionHubVehicleDto {
  @ApiProperty({ example: 'WB-02-AB-1234' })
  @IsString()
  @MaxLength(30)
  registration: string;

  @ApiPropertyOptional({ example: 10, description: 'Capacity in tonnes' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  capacity?: number;

  @ApiPropertyOptional({ example: 'TRUCK', enum: ['TRUCK', 'TEMPO', 'BIKE', 'OTHER'] })
  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class ProvisionHubCoverageDto {
  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ example: ['741235', '741245'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pincodes?: string[];

  @ApiPropertyOptional({ description: 'GeoJSON polygon or coordinate array for map preview' })
  @IsOptional()
  polygon?: unknown;
}

export class ProvisionHubDto {
  @ApiProperty({ example: 'Kalyani Hub' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'HUB-WB-001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code?: string;

  @ApiProperty({ example: 'Plot 4, Industrial Area, Kalyani' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine2?: string;

  @ApiProperty({ example: 'West Bengal' })
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: 'Kalyani' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: '741235' })
  @IsString()
  @MaxLength(10)
  pincode: string;

  @ApiProperty({ example: 22.975 })
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 88.434 })
  @Type(() => Number)
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ example: '9876500001' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({ example: 'kalyani.hub@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 'Mon-Sat 8:00 AM - 8:00 PM' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workingHours?: string;

  @ApiPropertyOptional({ example: 'DARK_STORE' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  hubType?: string;

  @ApiPropertyOptional({ example: 'wh-main-uuid-or-code' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'WH-MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  warehouseCode?: string;

  @ApiProperty({ type: ProvisionHubManagerDto })
  @ValidateNested()
  @Type(() => ProvisionHubManagerDto)
  manager: ProvisionHubManagerDto;

  @ApiPropertyOptional({ type: [ProvisionHubInventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionHubInventoryItemDto)
  inventory?: ProvisionHubInventoryItemDto[];

  @ApiPropertyOptional({ type: ProvisionHubCoverageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisionHubCoverageDto)
  coverage?: ProvisionHubCoverageDto;

  @ApiPropertyOptional({ type: [ProvisionHubDriverDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionHubDriverDto)
  drivers?: ProvisionHubDriverDto[];

  @ApiPropertyOptional({ type: [ProvisionHubVehicleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionHubVehicleDto)
  vehicles?: ProvisionHubVehicleDto[];

  @ApiPropertyOptional({ enum: EntityStatus, default: EntityStatus.ACTIVE })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateHubStatusDto {
  @ApiProperty({
    enum: HubOperationalAction,
    example: HubOperationalAction.ENABLE,
    description: 'ENABLE — activate hub | DISABLE — deactivate hub | SUSPEND — temporarily suspend operations',
  })
  @IsEnum(HubOperationalAction)
  action: HubOperationalAction;
}

export class AssignHubManagerDto {
  @ApiProperty({
    description: 'Hub manager user ID (HubUser with HUB_MANAGER role)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  managerId: string;
}

export enum HubOrderTab {
  ALL = 'all',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  PENDING_DISPATCH = 'pending_dispatch',
  OUT_FOR_DELIVERY = 'out_for_delivery',
}

export enum HubOrderDateRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  WEEK = 'week',
  MONTH = 'month',
  CUSTOM = 'custom',
}

export enum HubOrderSortField {
  CREATED_AT = 'createdAt',
  GRAND_TOTAL = 'grandTotal',
  ORDER_STATUS = 'orderStatus',
  CUSTOMER_NAME = 'customerName',
}

export class AdminHubOrdersQueryDto {
  @ApiPropertyOptional({
    enum: HubOrderGroup,
    description: 'Legacy lifecycle group filter',
  })
  @IsOptional()
  @IsEnum(HubOrderGroup)
  statusGroup?: HubOrderGroup;

  @ApiPropertyOptional({ description: 'Filter by specific order status' })
  @IsOptional()
  @IsString()
  orderStatus?: string;

  @ApiPropertyOptional({ enum: HubOrderTab, description: 'Order list tab filter' })
  @IsOptional()
  @IsEnum(HubOrderTab)
  tab?: HubOrderTab;

  @ApiPropertyOptional({ enum: HubOrderDateRange })
  @IsOptional()
  @IsEnum(HubOrderDateRange)
  dateRange?: HubOrderDateRange;

  @ApiPropertyOptional({ description: 'ISO date for custom range start' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO date for custom range end' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Payment method filter (Cash, UPI, Credit, etc.)' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Payment status: PAID, PENDING, PARTIAL' })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({
    description: 'Customer type: Individual, Contractor, Builder, Dealer, Architect',
  })
  @IsOptional()
  @IsString()
  customerType?: string;

  @ApiPropertyOptional({ description: 'Search by order ID, customer, phone, or invoice' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: HubOrderSortField, default: HubOrderSortField.CREATED_AT })
  @IsOptional()
  @IsEnum(HubOrderSortField)
  sortBy?: HubOrderSortField = HubOrderSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: HubSortOrder, default: HubSortOrder.DESC })
  @IsOptional()
  @IsEnum(HubSortOrder)
  sortOrder?: HubSortOrder = HubSortOrder.DESC;

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

export enum HubOrderExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export class AdminHubOrdersExportQueryDto extends AdminHubOrdersQueryDto {
  @ApiPropertyOptional({ enum: HubOrderExportFormat, default: HubOrderExportFormat.CSV })
  @IsOptional()
  @IsEnum(HubOrderExportFormat)
  format?: HubOrderExportFormat = HubOrderExportFormat.CSV;
}
