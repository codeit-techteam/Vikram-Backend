import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { runAuthDatabaseOperation } from '../../common/auth/auth-database.util';
import { PrismaService } from '../../common/database/prisma.service';
import {
  getPermissionsForRole,
  ROLE_SIDEBAR_CONFIG,
  type AdminPermission,
} from '../constants/admin-rbac.constants';
import type {
  AdminLoginResponseDto,
  AdminMeDto,
  AdminTokenResponseDto,
} from './dto/admin-auth.dto';
import { AdminSessionService } from './admin-session.service';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionService: AdminSessionService,
  ) {}

  async login(email: string, password: string): Promise<AdminLoginResponseDto> {
    const nodeEnv = this.configService.get<string>('app.env', 'development');
    return runAuthDatabaseOperation(
      'AUTH_LOGIN',
      this.prisma.getConnectionMeta(),
      nodeEnv,
      () => this.loginInternal(email, password),
    );
  }

  private async loginInternal(
    email: string,
    password: string,
  ): Promise<AdminLoginResponseDto> {
    const admin = await this.prisma.adminUser.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null, isActive: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const user = this.mapAdminMe(admin);
    const tokens = await this.generateTokens(admin.id, admin.email, admin.role, user.permissions);

    return { ...tokens, user, admin: user };
  }

  async refresh(refreshToken: string): Promise<AdminTokenResponseDto> {
    const tokenHash = this.hashToken(refreshToken);

    const stored = await this.prisma.adminRefreshToken.findFirst({
      where: { tokenHash, isRevoked: false, expiresAt: { gt: new Date() } },
      include: {
        adminUser: {
          select: { id: true, email: true, role: true, isActive: true, deletedAt: true },
        },
      },
    });

    if (!stored || !stored.adminUser.isActive || stored.adminUser.deletedAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.adminRefreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const permissions = getPermissionsForRole(stored.adminUser.role);

    return this.generateTokens(
      stored.adminUser.id,
      stored.adminUser.email,
      stored.adminUser.role,
      permissions,
      tokenHash,
    );
  }

  async logout(adminId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.adminRefreshToken.updateMany({
      where: { adminUserId: adminId, tokenHash, isRevoked: false },
      data: { isRevoked: true },
    });
    await this.sessionService.revokeSession(adminId, tokenHash);
  }

  async getMe(adminId: string): Promise<AdminMeDto> {
    const admin = await this.prisma.adminUser.findFirst({
      where: { id: adminId, deletedAt: null },
    });

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    return this.mapAdminMe(admin);
  }

  private async generateTokens(
    adminId: string,
    email: string,
    role: string,
    permissions: AdminPermission[],
    previousTokenHash?: string,
  ): Promise<AdminTokenResponseDto> {
    const accessExpiresIn =
      this.configService.get<string>('jwt.accessExpiresIn') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '30d';

    const accessToken = this.jwtService.sign(
      { sub: adminId, email, role, permissions, type: 'admin_access' },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const refreshToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const refreshMs = this.parseExpiryToMs(refreshExpiresIn);

    await this.prisma.adminRefreshToken.create({
      data: {
        adminUserId: adminId,
        tokenHash,
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });

    if (previousTokenHash) {
      await this.sessionService.revokeSession(adminId, previousTokenHash);
    }

    await this.sessionService.storeSession(adminId, tokenHash, {
      adminId,
      email,
      role,
      permissions,
      createdAt: new Date().toISOString(),
    });

    return { accessToken, refreshToken, expiresIn: accessExpiresIn };
  }

  private mapAdminMe(admin: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    lastLoginAt: Date | null;
  }): AdminMeDto {
    const role = admin.role;
    const permissions = getPermissionsForRole(role);
    const sidebar =
      ROLE_SIDEBAR_CONFIG[role as keyof typeof ROLE_SIDEBAR_CONFIG] ?? [];

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role,
      permissions,
      sidebar,
      lastLoginAt: admin.lastLoginAt,
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
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 30 * 24 * 60 * 60 * 1000;
    }
  }
}
