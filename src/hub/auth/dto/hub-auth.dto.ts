import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class HubLoginDto {
  @ApiProperty({ example: 'hubmanager01' })
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class HubRefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class HubLogoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class HubTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: '15m' })
  expiresIn!: string;
}

export class HubMeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeId!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  hubId!: string;

  @ApiPropertyOptional()
  hubName?: string;

  @ApiPropertyOptional()
  lastLoginAt?: Date | null;
}

export class HubLoginResponseDto extends HubTokenResponseDto {
  @ApiProperty({ type: HubMeDto })
  user!: HubMeDto;
}
