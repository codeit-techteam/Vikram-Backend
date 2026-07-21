import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { OtpService } from '../../auth/otp/otp.service';
import { normalizePhone } from '../../common/utils/phone.util';
import { CustomerService } from '../customer/customer.service';
import { ProfileResponseDto } from '../customer/dto/profile.dto';
import {
  CANCELLABLE_STATUSES,
  ORDER_STATUS_LABELS,
  decimalToNumber,
} from '../orders/orders.constants';
import {
  ChangeEmailDto,
  ChangeMobileDto,
  CustomerActivityResponseDto,
  RequestMobileOtpResponseDto,
  UpdateProfileImageDto,
} from './dto/customer-profile.dto';

@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly otpService: OtpService,
    private readonly customerService: CustomerService,
  ) {}

  async updateProfileImage(
    customerId: string,
    dto: UpdateProfileImageDto,
  ): Promise<ProfileResponseDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.prisma.customerProfile.upsert({
      where: { customerId },
      create: {
        customerId,
        profileImage: dto.profileImage,
      },
      update: {
        profileImage: dto.profileImage,
      },
    });

    await this.cache.invalidateProfile(customerId);
    return this.customerService.getProfile(customerId);
  }

  async requestMobileChangeOtp(
    customerId: string,
    newMobile: string,
  ): Promise<RequestMobileOtpResponseDto> {
    const phone = normalizePhone(newMobile);

    const existing = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null, NOT: { id: customerId } },
    });

    if (existing) {
      throw new ConflictException('Mobile number already registered');
    }

    const result = await this.otpService.sendOtp(phone);
    return {
      expiresIn: result.expiresIn,
      otp: result.otp,
    };
  }

  async changeMobile(
    customerId: string,
    dto: ChangeMobileDto,
  ): Promise<ProfileResponseDto> {
    const phone = normalizePhone(dto.newMobile);

    const existing = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null, NOT: { id: customerId } },
    });

    if (existing) {
      throw new ConflictException('Mobile number already registered');
    }

    await this.otpService.verifyOtp(phone, dto.otp);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { phone, isVerified: true },
    });

    await this.cache.invalidateProfile(customerId);
    return this.customerService.getProfile(customerId);
  }

  async changeEmail(
    customerId: string,
    dto: ChangeEmailDto,
  ): Promise<ProfileResponseDto> {
    const email = dto.newEmail.trim().toLowerCase();

    const existing = await this.prisma.customer.findFirst({
      where: { email, deletedAt: null, NOT: { id: customerId } },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        email,
        profileCompleted: true,
      },
    });

    await this.cache.invalidateProfile(customerId);
    return this.customerService.getProfile(customerId);
  }

  async getActivity(customerId: string): Promise<CustomerActivityResponseDto> {
    const [orders, addresses, wishlist, cart, profile] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { items: { select: { id: true } } },
      }),
      this.customerService.getAddresses(customerId),
      this.prisma.wishlistItem.count({
        where: { wishlist: { customerId } },
      }),
      this.prisma.cartItem.count({
        where: { cart: { customerId } },
      }),
      this.customerService.getProfile(customerId),
    ]);

    return {
      recentOrders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        statusLabel: ORDER_STATUS_LABELS[order.orderStatus],
        itemCount: order.items.length,
        grandTotal: decimalToNumber(order.grandTotal),
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt.toISOString(),
        canCancel: CANCELLABLE_STATUSES.includes(order.orderStatus),
      })),
      addresses,
      wishlistCount: wishlist,
      cartCount: cart,
      profile,
    };
  }
}
