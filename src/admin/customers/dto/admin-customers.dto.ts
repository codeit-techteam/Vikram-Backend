import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

export class AdminCustomerQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({
    description:
      'ACTIVE | INACTIVE | SUSPENDED | PENDING_VERIFICATION | BLOCKED',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by business / customer type' })
  @IsOptional()
  @IsString()
  customerType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() hubId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() executiveId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated customer UUIDs (export selected)',
  })
  @IsOptional()
  @IsString()
  ids?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class AdminUpdateCustomerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() businessType?: string;
}

export class AdminAssignCustomerDto {
  @ApiPropertyOptional({ description: 'Hub UUID or null to clear' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  hubId?: string | null;

  @ApiPropertyOptional({
    description: 'Customer executive admin user UUID or null to clear',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  executiveId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdminSetStatusDto {
  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsEnum(CUSTOMER_STATUSES)
  status!: (typeof CUSTOMER_STATUSES)[number];
}

export class AdminBulkCustomerIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class AdminBulkStatusDto extends AdminBulkCustomerIdsDto {
  @ApiProperty({ enum: CUSTOMER_STATUSES })
  @IsEnum(CUSTOMER_STATUSES)
  status!: (typeof CUSTOMER_STATUSES)[number];
}

export class AdminBulkAssignDto extends AdminBulkCustomerIdsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  hubId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  executiveId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminInviteCustomerDto {
  @ApiProperty({ example: '9876500001' })
  @IsString()
  @MinLength(10)
  phone!: string;

  @ApiProperty({ example: 'Ramesh Construction' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  executiveId?: string;
}

export class AdminUpgradeMembershipDto {
  @ApiPropertyOptional({ description: 'Membership plan UUID' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Plan name e.g. Gold, Enterprise' })
  @IsOptional()
  @IsString()
  planName?: string;
}
