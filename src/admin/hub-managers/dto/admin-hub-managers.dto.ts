import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { HubRole } from '../../../../generated/prisma/client';

export class CreateHubManagerDto {
  @ApiProperty({ example: 'Amit Sharma' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiPropertyOptional({
    example: 'hubmanager01',
    description: 'Auto-generated if omitted',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty({ example: 'amit.sharma@hubops.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '9876500001' })
  @IsString()
  @MinLength(10)
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: 'Assigned hub UUID' })
  @IsUUID()
  hubId: string;

  @ApiPropertyOptional({ enum: HubRole, default: HubRole.HUB_MANAGER })
  @IsOptional()
  @IsEnum(HubRole)
  role?: HubRole;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateHubManagerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TransferHubManagerDto {
  @ApiProperty()
  @IsUUID()
  hubId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResetHubManagerPasswordDto {
  @ApiPropertyOptional({
    description: 'Leave empty to auto-generate a temporary password',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class HubManagerQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}
