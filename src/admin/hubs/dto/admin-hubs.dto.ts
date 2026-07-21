import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code: string;

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

export class AdminHubOrdersQueryDto {
  @ApiPropertyOptional({
    enum: HubOrderGroup,
    description: 'Filter orders by lifecycle group',
  })
  @IsOptional()
  @IsEnum(HubOrderGroup)
  status?: HubOrderGroup;

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
