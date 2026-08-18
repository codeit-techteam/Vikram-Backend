import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AddressResponseDto } from './address.dto';

export class UpsertProfileDto {
  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ example: 'rahul@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: 'Sharma Constructions Pvt Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ example: 'Sharma Constructions Private Limited' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalEntityName?: string;

  @ApiPropertyOptional({ example: '2012-05-12' })
  @IsOptional()
  @IsDateString()
  establishmentDate?: string;

  @ApiPropertyOptional({ example: 'Level 5, Sky Tower, BKC G-Block, Mumbai 400051' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  registeredAddress?: string;

  @ApiPropertyOptional({ example: '27AABCU9603R1ZM' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstNumber?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  gstVerified?: boolean;

  @ApiPropertyOptional({ example: 'Maharashtra – Ward 12A' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  jurisdiction?: string;

  @ApiPropertyOptional({ example: 'AABCU9603R' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  panNumber?: string;

  @ApiPropertyOptional({ example: 'Contractor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/profile.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  profileImage?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class GstSummaryDto {
  @ApiPropertyOptional()
  gstin?: string | null;

  @ApiPropertyOptional()
  companyName?: string | null;

  @ApiProperty({ example: false })
  verified!: boolean;

  @ApiPropertyOptional()
  verifiedAt?: string | null;

  @ApiPropertyOptional()
  jurisdiction?: string | null;

  @ApiPropertyOptional()
  pan?: string | null;
}

export class MembershipSummaryDto {
  @ApiPropertyOptional()
  id?: string | null;

  @ApiPropertyOptional({ example: 'PLATINUM' })
  tier?: string | null;

  @ApiPropertyOptional()
  planName?: string | null;

  @ApiPropertyOptional()
  status?: string | null;

  @ApiPropertyOptional()
  expiryDate?: string | null;

  @ApiPropertyOptional({ type: [String] })
  benefits?: string[];
}

export class LoyaltyWalletSummaryDto {
  @ApiProperty({ example: 0 })
  balance!: number;

  @ApiProperty({ example: 0 })
  availablePoints!: number;

  @ApiProperty({ example: 0 })
  redeemedPoints!: number;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: '+919876543210' })
  phone!: string;

  @ApiPropertyOptional({ example: 'rahul@example.com' })
  email?: string | null;

  /** Alias for clients that expect `name` instead of `fullName`. */
  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  name?: string | null;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  fullName?: string | null;

  @ApiProperty({ example: true })
  profileCompleted!: boolean;

  @ApiProperty({ example: false })
  roleSelected!: boolean;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiPropertyOptional({ example: 'en' })
  language?: string | null;

  @ApiPropertyOptional()
  companyName?: string | null;

  @ApiPropertyOptional()
  legalEntityName?: string | null;

  @ApiPropertyOptional()
  establishmentDate?: string | null;

  @ApiPropertyOptional()
  registeredAddress?: string | null;

  @ApiPropertyOptional()
  gstNumber?: string | null;

  @ApiPropertyOptional()
  panNumber?: string | null;

  @ApiPropertyOptional()
  businessType?: string | null;

  @ApiPropertyOptional()
  profileImage?: string | null;

  @ApiPropertyOptional({ example: 'PLATINUM' })
  membership?: string | null;

  @ApiPropertyOptional()
  role?: {
    id: string;
    name: string;
    slug: string;
  } | null;

  @ApiPropertyOptional({ type: GstSummaryDto })
  gst?: GstSummaryDto | null;

  @ApiPropertyOptional({ type: MembershipSummaryDto })
  membershipDetails?: MembershipSummaryDto | null;

  @ApiPropertyOptional({ type: LoyaltyWalletSummaryDto })
  wallet?: LoyaltyWalletSummaryDto | null;

  @ApiPropertyOptional({ type: [AddressResponseDto] })
  addresses?: AddressResponseDto[];

  @ApiPropertyOptional()
  createdAt?: string;
}

export class CreateProfileDto extends UpsertProfileDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  declare fullName: string;
}
