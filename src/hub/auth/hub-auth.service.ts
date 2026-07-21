import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  HubLoginResponseDto,
  HubMeDto,
  HubTokenResponseDto,
} from './dto/hub-auth.dto';
import { HUB_ACCESS_ROLES } from '../constants/hub.constants';

@Injectable()
export class HubAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(employeeId: string, password: string): Promise<HubLoginResponseDto> {
    const user = await this.prisma.hubUser.findFirst({
      where: {
        employeeId: employeeId.trim().toLowerCase(),
        deletedAt: null,
        isActive: true,
      },
      include: { hub: { select: { id: true, name: true, isActive: true } } },
    });

    if (!user || !user.hub.isActive) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    if (!HUB_ACCESS_ROLES.includes(user.role as (typeof HUB_ACCESS_ROLES)[number])) {
      throw new UnauthorizedException('Hub access not permitted for this role');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

    await this.prisma.hubUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.employeeId,
      user.role,
      user.hubId,
    );

    return {
      ...tokens,
      user: this.mapHubMe(user, user.hub.name),
    };
  }

  async refresh(refreshToken: string): Promise<HubTokenResponseDto> {
    const tokenHash = this.hashToken(refreshToken);

    const stored = await this.prisma.hubRefreshToken.findFirst({
      where: { tokenHash, isRevoked: false, expiresAt: { gt: new Date() } },
      include: {
        hubUser: {
          select: {
            id: true,
            employeeId: true,
            role: true,
            hubId: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!stored || !stored.hubUser.isActive || stored.hubUser.deletedAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.hubRefreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    return this.generateTokens(
      stored.hubUser.id,
      stored.hubUser.employeeId,
      stored.hubUser.role,
      stored.hubUser.hubId,
    );
  }

  async logout(hubUserId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.hubRefreshToken.updateMany({
      where: { hubUserId, tokenHash, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async getMe(hubUserId: string): Promise<HubMeDto> {
    const user = await this.prisma.hubUser.findFirst({
      where: { id: hubUserId, deletedAt: null },
      include: { hub: { select: { name: true } } },
    });

    if (!user) {
      throw new NotFoundException('Hub user not found');
    }

    return this.mapHubMe(user, user.hub.name);
  }

  private async generateTokens(
    hubUserId: string,
    employeeId: string,
    role: string,
    hubId: string,
  ): Promise<HubTokenResponseDto> {
    const accessExpiresIn =
      this.configService.get<string>('jwt.accessExpiresIn') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '30d';

    const accessToken = this.jwtService.sign(
      { sub: hubUserId, employeeId, role, hubId, type: 'hub_access' },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const refreshToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const refreshMs = this.parseExpiryToMs(refreshExpiresIn);

    await this.prisma.hubRefreshToken.create({
      data: {
        hubUserId,
        tokenHash,
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessExpiresIn };
  }

  private mapHubMe(
    user: {
      id: string;
      employeeId: string;
      email: string | null;
      fullName: string;
      phone: string | null;
      role: string;
      hubId: string;
      lastLoginAt: Date | null;
    },
    hubName: string,
  ): HubMeDto {
    return {
      id: user.id,
      employeeId: user.employeeId,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      hubId: user.hubId,
      hubName,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 30 * 24 * 60 * 60 * 1000;
    }
  }
}
