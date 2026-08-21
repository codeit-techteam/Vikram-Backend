import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { DevicePlatform } from '../../../../generated/prisma/client';

export class SendOtpDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Indian mobile number (10 digits, with or without +91)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'mobile must be a valid Indian mobile number',
  })
  mobile!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'mobile must be a valid Indian mobile number',
  })
  mobile!: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP' })
  @IsString()
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'otp must contain only digits' })
  otp!: string;

  @ApiPropertyOptional({ example: 'device-uuid-123' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'fcm-token-abc' })
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @ApiPropertyOptional({
    enum: DevicePlatform,
    example: DevicePlatform.ANDROID,
  })
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;
}

export class LoginDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'mobile must be a valid Indian mobile number',
  })
  mobile!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp!: string;

  @ApiPropertyOptional({ example: 'device-uuid-123' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'fcm-token-abc' })
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @ApiPropertyOptional({ enum: DevicePlatform })
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh-token-string' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @ApiPropertyOptional({ example: 'device-uuid-123' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class LogoutDto {
  @ApiProperty({ example: 'refresh-token-string' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
