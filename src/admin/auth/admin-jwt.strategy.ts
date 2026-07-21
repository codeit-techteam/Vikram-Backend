import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/database/prisma.service';
import type { AdminPermission } from '../constants/admin-rbac.constants';
import { getPermissionsForRole } from '../constants/admin-rbac.constants';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: string;
  permissions?: AdminPermission[];
  type: string;
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: string;
  permissions: AdminPermission[];
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') ?? 'dev-jwt-secret',
    });
  }

  async validate(payload: AdminJwtPayload): Promise<AuthenticatedAdmin> {
    if (payload.type !== 'admin_access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const admin = await this.prisma.adminUser.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: { id: true, email: true, role: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found or inactive');
    }

    const permissions =
      payload.permissions?.length
        ? payload.permissions
        : getPermissionsForRole(admin.role);

    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      permissions,
    };
  }
}
