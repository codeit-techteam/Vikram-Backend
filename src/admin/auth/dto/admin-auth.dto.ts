import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type {
  AdminPermission,
  SidebarNavItem,
} from '../../constants/admin-rbac.constants';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@bajriwala.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@1234' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class AdminRefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class AdminLogoutDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class AdminTokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: string;
}

export class SidebarNavItemDto {
  @ApiProperty()
  label: string;

  @ApiProperty()
  href: string;

  @ApiPropertyOptional()
  icon?: string;

  @ApiPropertyOptional({ type: [SidebarNavItemDto] })
  children?: SidebarNavItemDto[];
}

export class AdminMeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ enum: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'CUSTOMER_EXECUTIVE'] })
  role: string;

  @ApiProperty({ type: [String] })
  permissions: AdminPermission[];

  @ApiProperty({ type: [SidebarNavItemDto] })
  sidebar: SidebarNavItem[];

  @ApiPropertyOptional()
  lastLoginAt?: Date | null;
}

export class AdminLoginResponseDto extends AdminTokenResponseDto {
  @ApiProperty({ type: AdminMeDto })
  user: AdminMeDto;

  /** @deprecated Use `user` instead */
  @ApiProperty({ type: AdminMeDto })
  admin: AdminMeDto;
}
