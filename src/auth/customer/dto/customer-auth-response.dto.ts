import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'a1b2c3d4e5f6...' })
  refreshToken!: string;

  @ApiProperty({ example: '15m' })
  expiresIn!: string;
}

export class SendOtpResponseDto {
  @ApiProperty({ example: 300 })
  expiresIn!: number;

  @ApiProperty({ example: '+919876543210' })
  mobile!: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Returned only in non-production for Swagger/local testing',
  })
  otp?: string;
}

export class CustomerMeDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: '+919876543210' })
  phone!: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  fullName?: string | null;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiProperty({ example: false })
  roleSelected!: boolean;

  @ApiProperty({ example: false })
  profileCompleted!: boolean;

  @ApiPropertyOptional()
  role?: {
    id: string;
    name: string;
    slug: string;
  } | null;

  @ApiPropertyOptional()
  profile?: {
    companyName?: string | null;
    gstNumber?: string | null;
    panNumber?: string | null;
    businessType?: string | null;
    profileImage?: string | null;
  } | null;
}

export class AuthResponseDto extends AuthTokensDto {
  @ApiProperty({ type: CustomerMeDto })
  customer!: CustomerMeDto;

  @ApiProperty({ example: true })
  isNewCustomer!: boolean;
}
