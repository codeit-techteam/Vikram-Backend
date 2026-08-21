import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { JwtPayload } from './jwt-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async generateTokenPair(
    customerId: string,
    phone: string,
    deviceId?: string,
  ): Promise<TokenPair> {
    const accessExpiresIn =
      this.configService.get<string>('jwt.accessExpiresIn') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '30d';

    const accessPayload: JwtPayload = {
      sub: customerId,
      phone,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const refreshExpiresMs = this.parseExpiryToMs(refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: {
        customerId,
        tokenHash,
        deviceId,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  async rotateRefreshToken(
    refreshToken: string,
    deviceId?: string,
  ): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);

    const matchedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        customer: {
          select: { id: true, phone: true, status: true, deletedAt: true },
        },
      },
    });

    if (!matchedToken) {
      throw new Error('Invalid refresh token');
    }

    if (
      matchedToken.customer.deletedAt ||
      matchedToken.customer.status !== 'ACTIVE'
    ) {
      throw new Error('Customer inactive');
    }

    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { isRevoked: true },
    });

    return this.generateTokenPair(
      matchedToken.customerId,
      matchedToken.customer.phone,
      deviceId,
    );
  }

  async revokeRefreshToken(
    refreshToken: string,
    customerId: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        customerId,
        tokenHash,
        isRevoked: false,
      },
      data: { isRevoked: true },
    });
  }

  async revokeAllCustomerTokens(customerId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { customerId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 30 * 24 * 60 * 60 * 1000;
    }

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
