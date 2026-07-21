import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BulkEnquiryStatus } from '../../../../generated/prisma/client';

export class CreateBulkEnquiryDto {
  @ApiProperty({ example: 'Sharma Constructions Pvt Ltd' })
  @IsString()
  @MaxLength(200)
  companyName!: string;

  @ApiProperty({ example: 'Green Valley Apartments Phase 2' })
  @IsString()
  @MaxLength(200)
  projectName!: string;

  @ApiProperty({ example: 'Sector 62, Noida, UP' })
  @IsString()
  @MaxLength(300)
  location!: string;

  @ApiPropertyOptional({ example: 'Need cement and steel for foundation work' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @ApiProperty({ example: 500, description: 'Expected quantity in units/bags' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedQuantity!: number;
}

export class BulkEnquiryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  companyName!: string;

  @ApiProperty()
  projectName!: string;

  @ApiProperty()
  location!: string;

  @ApiPropertyOptional()
  remarks?: string | null;

  @ApiProperty()
  expectedQuantity!: number;

  @ApiProperty({ enum: BulkEnquiryStatus })
  status!: BulkEnquiryStatus;

  @ApiPropertyOptional()
  assignedExecutive?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class BulkEnquiryListResponseDto {
  @ApiProperty({ type: [BulkEnquiryResponseDto] })
  items!: BulkEnquiryResponseDto[];

  @ApiProperty()
  total!: number;
}
