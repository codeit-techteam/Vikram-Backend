import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DevicePlatform, NotificationType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { normalizePhone } from '../../common/utils/phone.util';
import { JwtTokenService } from '../jwt/jwt-token.service';
import { OtpService } from '../otp/otp.service';
import { LoyaltyTransactionService } from '../../modules/loyalty/loyalty-transaction.service';
import { DeliveryBenefitService } from '../../modules/delivery/delivery-benefit.service';
import { NotificationService } from '../../modules/notification/notification.service';
import {
  AuthResponseDto,
  CustomerMeDto,
  SendOtpResponseDto,
} from './dto/customer-auth-response.dto';
import { TokenPair } from '../jwt/jwt-token.service';

interface DeviceInfo {
  deviceId?: string;
  fcmToken?: string;
  platform?: DevicePlatform;
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
    private readonly deliveryBenefitService: DeliveryBenefitService,
    private readonly notificationService: NotificationService,
  ) {}

  async sendOtp(mobile: string): Promise<SendOtpResponseDto> {
    const phone = normalizePhone(mobile);
    const { expiresIn, otp } = await this.otpService.sendOtp(phone);
    const response: SendOtpResponseDto = { expiresIn, mobile: phone };

    // Expose OTP only outside production so Swagger can be tested end-to-end
    if (process.env.NODE_ENV !== 'production') {
      response.otp = otp;
    }

    return response;
  }

  async verifyOtp(
    mobile: string,
    otp: string,
    deviceInfo?: DeviceInfo,
  ): Promise<AuthResponseDto> {
    return this.authenticateWithOtp(mobile, otp, deviceInfo);
  }

  async login(
    mobile: string,
    otp: string,
    deviceInfo?: DeviceInfo,
  ): Promise<AuthResponseDto> {
    const phone = normalizePhone(mobile);
    await this.otpService.enforceLoginAttempts(phone);

    try {
      return await this.authenticateWithOtp(mobile, otp, deviceInfo);
    } catch (error) {
      await this.otpService.recordFailedLoginAttempt(phone);
      throw error;
    }
  }

  private async authenticateWithOtp(
    mobile: string,
    otp: string,
    deviceInfo?: DeviceInfo,
  ): Promise<AuthResponseDto> {
    const phone = normalizePhone(mobile);
    await this.otpService.verifyOtp(phone, otp);

    let isNewCustomer = false;
    let customer = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
      include: {
        role: true,
        profile: true,
        activeMembership: { include: { plan: true } },
        loyaltyAccount: true,
      },
    });

    if (!customer) {
      isNewCustomer = true;
      customer = await this.prisma.customer.create({
        data: {
          phone,
          isVerified: true,
          status: 'ACTIVE',
        },
        include: {
          role: true,
          profile: true,
          activeMembership: { include: { plan: true } },
          loyaltyAccount: true,
        },
      });

      await this.loyaltyTransactionService.creditWelcomeBonus(customer.id);
      await this.deliveryBenefitService.ensureBenefit(customer.id);

      try {
        await this.notificationService.createForCustomer({
          customerId: customer.id,
          type: NotificationType.LOYALTY,
          label: 'LOYALTY',
          title: 'Welcome bonus credited',
          body: '50 loyalty points have been added to your account.',
          actionLabel: 'View Loyalty',
          actionRoute: '/account/loyalty',
          actionVariant: 'outline',
          priority: 5,
        });
      } catch {
        // Non-blocking
      }
    } else {
      if (customer.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is inactive or suspended');
      }

      if (!customer.isVerified) {
        customer = await this.prisma.customer.update({
          where: { id: customer.id },
          data: { isVerified: true },
          include: {
            role: true,
            profile: true,
            activeMembership: { include: { plan: true } },
            loyaltyAccount: true,
          },
        });
      }
    }

    await this.otpService.clearLoginAttempts(phone);
    await this.upsertDeviceSession(customer.id, deviceInfo);

    const tokens = await this.jwtTokenService.generateTokenPair(
      customer.id,
      customer.phone,
      deviceInfo?.deviceId,
    );

    return {
      ...tokens,
      token: tokens.accessToken,
      customer: this.mapCustomerMe(customer),
      isNewCustomer,
    };
  }

  async refresh(
    refreshToken: string,
    deviceId?: string,
  ): Promise<TokenPair> {
    try {
      return await this.jwtTokenService.rotateRefreshToken(refreshToken, deviceId);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(customerId: string, refreshToken: string): Promise<void> {
    await this.jwtTokenService.revokeRefreshToken(refreshToken, customerId);
  }

  async getMe(customerId: string): Promise<CustomerMeDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: {
        role: true,
        profile: true,
        activeMembership: { include: { plan: true } },
        loyaltyAccount: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.mapCustomerMe(customer);
  }

  private async upsertDeviceSession(
    customerId: string,
    deviceInfo?: DeviceInfo,
  ): Promise<void> {
    if (!deviceInfo?.deviceId) {
      return;
    }

    await this.prisma.deviceSession.upsert({
      where: {
        customerId_deviceId: {
          customerId,
          deviceId: deviceInfo.deviceId,
        },
      },
      create: {
        customerId,
        deviceId: deviceInfo.deviceId,
        fcmToken: deviceInfo.fcmToken,
        platform: deviceInfo.platform ?? DevicePlatform.ANDROID,
        lastLogin: new Date(),
      },
      update: {
        fcmToken: deviceInfo.fcmToken,
        platform: deviceInfo.platform,
        lastLogin: new Date(),
      },
    });

    if (deviceInfo.fcmToken) {
      await this.prisma.notificationToken.upsert({
        where: {
          customerId_token: {
            customerId,
            token: deviceInfo.fcmToken,
          },
        },
        create: {
          customerId,
          token: deviceInfo.fcmToken,
          platform: deviceInfo.platform ?? DevicePlatform.ANDROID,
        },
        update: {
          isActive: true,
          platform: deviceInfo.platform,
        },
      });
    }
  }

  private mapCustomerMe(
    customer: {
      id: string;
      phone: string;
      email: string | null;
      fullName: string | null;
      isVerified: boolean;
      roleSelected: boolean;
      profileCompleted: boolean;
      role: { id: string; name: string; slug: string } | null;
      profile: {
        companyName: string | null;
        gstNumber: string | null;
        panNumber: string | null;
        businessType: string | null;
        profileImage: string | null;
      } | null;
      activeMembership?: {
        plan: { name: string };
      } | null;
      loyaltyAccount?: { tier: string } | null;
    },
  ): CustomerMeDto {
    const planName = customer.activeMembership?.plan.name ?? null;
    const loyaltyTier = customer.loyaltyAccount?.tier ?? null;
    const source = (planName ?? loyaltyTier ?? '').toUpperCase();
    let membership: string | null = null;
    if (source.includes('PLATINUM') || source.includes('ENTERPRISE')) {
      membership = 'PLATINUM';
    } else if (source.includes('GOLD')) {
      membership = 'GOLD';
    } else if (source.includes('SILVER')) {
      membership = 'SILVER';
    } else if (source) {
      membership = source;
    }

    return {
      id: customer.id,
      phone: customer.phone,
      email: customer.email,
      name: customer.fullName,
      fullName: customer.fullName,
      membership,
      profileImage: customer.profile?.profileImage ?? null,
      companyName: customer.profile?.companyName ?? null,
      isVerified: customer.isVerified,
      roleSelected: customer.roleSelected,
      profileCompleted: customer.profileCompleted,
      role: customer.role
        ? {
            id: customer.role.id,
            name: customer.role.name,
            slug: customer.role.slug,
          }
        : null,
      profile: customer.profile
        ? {
            companyName: customer.profile.companyName,
            gstNumber: customer.profile.gstNumber,
            panNumber: customer.profile.panNumber,
            businessType: customer.profile.businessType,
            profileImage: customer.profile.profileImage,
          }
        : null,
    };
  }
}
