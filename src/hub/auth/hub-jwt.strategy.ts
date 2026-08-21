import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/database/prisma.service';
import { HUB_ACCESS_ROLES } from '../constants/hub.constants';

export interface HubJwtPayload {
  sub: string;
  employeeId: string;
  role: string;
  hubId: string;
  type: string;
}

export interface AuthenticatedHubUser {
  id: string;
  employeeId: string;
  role: string;
  hubId: string;
  fullName: string;
}

@Injectable()
export class HubJwtStrategy extends PassportStrategy(Strategy, 'hub-jwt') {
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

  async validate(payload: HubJwtPayload): Promise<AuthenticatedHubUser> {
    if (payload.type !== 'hub_access') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (
      !HUB_ACCESS_ROLES.includes(
        payload.role as (typeof HUB_ACCESS_ROLES)[number],
      )
    ) {
      throw new UnauthorizedException('Invalid hub role');
    }

    const user = await this.prisma.hubUser.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: {
        id: true,
        employeeId: true,
        role: true,
        hubId: true,
        fullName: true,
      },
    });

    if (!user || user.hubId !== payload.hubId) {
      throw new UnauthorizedException('Hub user not found or inactive');
    }

    return {
      id: user.id,
      employeeId: user.employeeId,
      role: user.role,
      hubId: user.hubId,
      fullName: user.fullName,
    };
  }
}
