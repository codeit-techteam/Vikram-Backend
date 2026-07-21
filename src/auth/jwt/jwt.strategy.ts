import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedCustomer, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedCustomer> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, phone: true },
    });

    if (!customer) {
      throw new UnauthorizedException('Customer not found or inactive');
    }

    return { id: customer.id, phone: customer.phone };
  }
}
