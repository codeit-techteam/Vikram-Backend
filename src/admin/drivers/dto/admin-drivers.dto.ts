import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminDriversQueryDto {
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

  @ApiPropertyOptional({
    description:
      'AVAILABLE | ASSIGNED | ON_TRIP | ON_LEAVE | INACTIVE | BLOCKED | SUSPENDED',
  })
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

  @ApiPropertyOptional({ enum: ['yes', 'no'] })
  @IsOptional()
  @IsEnum(['yes', 'no'])
  vehicleAssigned?: 'yes' | 'no';

  @ApiPropertyOptional({ enum: ['expired', 'expiring_soon', 'valid'] })
  @IsOptional()
  @IsEnum(['expired', 'expiring_soon', 'valid'])
  licenseExpiry?: 'expired' | 'expiring_soon' | 'valid';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

export class AdminDriverCreateDto {
  @ApiProperty()
  @IsUUID()
  hubId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseHubId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(15)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeId?: string;

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
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactRelationship?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pinCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseIssueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseIssuingState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shift?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onLeave?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aadhaarNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountHolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankIfscCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  upiId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminDriverUpdateDto extends PartialType(AdminDriverCreateDto) {}

export class AdminDriverVehicleDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  vehicleId!: string | null;
}

export class DriverDocumentUploadUrlDto {
  @ApiProperty({
    enum: ['DRIVER_PHOTO', 'DRIVING_LICENSE', 'AADHAAR', 'PAN', 'OTHER'],
  })
  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  fileSize!: number;
}

export class DriverDocumentConfirmDto extends DriverDocumentUploadUrlDto {
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
  @IsString()
  issueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiryDate?: string;
}
