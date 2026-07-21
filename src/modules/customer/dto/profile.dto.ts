import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: '27AABCU9603R1ZM' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstNumber?: string;

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
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: '+919876543210' })
  phone!: string;

  @ApiPropertyOptional({ example: 'rahul@example.com' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  fullName?: string | null;

  @ApiProperty({ example: true })
  profileCompleted!: boolean;

  @ApiPropertyOptional()
  companyName?: string | null;

  @ApiPropertyOptional()
  gstNumber?: string | null;

  @ApiPropertyOptional()
  panNumber?: string | null;

  @ApiPropertyOptional()
  businessType?: string | null;

  @ApiPropertyOptional()
  profileImage?: string | null;

  @ApiPropertyOptional()
  role?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export class CreateProfileDto extends UpsertProfileDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  declare fullName: string;
}
