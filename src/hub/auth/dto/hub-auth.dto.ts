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

export class HubForgotPasswordDto {
  @ApiProperty({ example: 'hubmanager01' })
  @IsString()
  @IsNotEmpty()
  employeeId!: string;
}

export class HubTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: '15m' })
  expiresIn!: string;
}

export class HubManagerProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  mobile?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty({ example: 'HUB_MANAGER' })
  role!: string;

  @ApiProperty()
  hubId!: string;

  @ApiPropertyOptional()
  hubName?: string;

  @ApiPropertyOptional()
  lastLoginAt?: Date | null;
}

/** @deprecated Use HubManagerProfileDto */
export class HubMeDto extends HubManagerProfileDto {}

export class HubLoginResponseDto extends HubTokenResponseDto {
  @ApiProperty({ type: HubManagerProfileDto })
  manager!: HubManagerProfileDto;

  /** @deprecated Use manager */
  @ApiProperty({ type: HubManagerProfileDto })
  user!: HubManagerProfileDto;
}
