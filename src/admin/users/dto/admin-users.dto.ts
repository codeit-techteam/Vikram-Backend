import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { AdminRole } from '../../../../generated/prisma/client';

export enum AdminUserDisplayStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum AdminUserStatusAction {
  ACTIVATE = 'ACTIVATE',
  DEACTIVATE = 'DEACTIVATE',
}

export class AdminUserResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Rajesh Kumar' })
  name!: string;

  @ApiProperty({ example: 'Rajesh Kumar' })
  fullName!: string;

  @ApiProperty({ example: 'rajesh.kumar@bajriwala.in' })
  email!: string;

  @ApiPropertyOptional({ example: '9876500001' })
  phone?: string | null;

  @ApiProperty({ enum: AdminRole, example: AdminRole.WAREHOUSE_MANAGER })
  role!: AdminRole;

  @ApiProperty({
    enum: AdminUserDisplayStatus,
    example: AdminUserDisplayStatus.ACTIVE,
  })
  status!: AdminUserDisplayStatus;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: '2026-07-21T10:30:00.000Z' })
  lastLoginAt?: Date | null;

  @ApiProperty({ example: '2026-07-21T10:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-21T10:30:00.000Z' })
  updatedAt!: Date;
}

export class AdminUserListMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class AdminUserListResponseDto {
  @ApiProperty({ type: [AdminUserResponseDto] })
  data!: AdminUserResponseDto[];

  @ApiProperty({ type: AdminUserListMetaDto })
  meta!: AdminUserListMetaDto;
}

export class CreateAdminUserDto {
  @ApiProperty({
    example: 'Rajesh Kumar',
    description: 'Full name of the admin user',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'rajesh.kumar@bajriwala.in' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '9876500001' })
  @IsString()
  @MinLength(10)
  phone: string;

  @ApiProperty({ enum: AdminRole, example: AdminRole.CUSTOMER_EXECUTIVE })
  @IsEnum(AdminRole)
  role: AdminRole;

  @ApiProperty({ example: 'Admin@1234', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: 'Rajesh Kumar' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'rajesh.kumar@bajriwala.in' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '9876500001' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  phone?: string;
}

export class UpdateAdminUserStatusDto {
  @ApiProperty({
    enum: AdminUserStatusAction,
    example: AdminUserStatusAction.ACTIVATE,
    description:
      'ACTIVATE — enable login | DEACTIVATE — disable login and revoke sessions',
  })
  @IsEnum(AdminUserStatusAction)
  action: AdminUserStatusAction;
}

export class ResetAdminUserPasswordDto {
  @ApiPropertyOptional({
    description: 'New password. Auto-generated if omitted.',
    example: 'Admin@1234',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class ChangeAdminUserRoleDto {
  @ApiProperty({
    enum: AdminRole,
    example: AdminRole.WAREHOUSE_MANAGER,
    description: 'New role to assign',
  })
  @IsEnum(AdminRole)
  role: AdminRole;
}

export class AdminUserQueryDto {
  @ApiPropertyOptional({
    description: 'Search by name, email, or phone',
    example: 'rajesh',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: AdminRole,
    description: 'Filter by role',
    example: AdminRole.WAREHOUSE_MANAGER,
  })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({
    enum: AdminUserDisplayStatus,
    description: 'Filter by account status',
    example: AdminUserDisplayStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(AdminUserDisplayStatus)
  status?: AdminUserDisplayStatus;

  @ApiPropertyOptional({
    description: 'Filter users created on or after this date (ISO 8601)',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter users created on or before this date (ISO 8601)',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class ResetAdminUserPasswordResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  userId!: string;

  @ApiProperty({ example: 'Admin@x7k2m9' })
  temporaryPassword!: string;
}
