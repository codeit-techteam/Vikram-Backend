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
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  brand: true,
                  unit: true,
                  spec: true,
                  retailPrice: true,
                  category: { select: { name: true } },
                  images: {
                    where: { deletedAt: null },
                    orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
                    take: 1,
                    select: { url: true },
                  },
                  variants: {
                    where: { deletedAt: null },
                    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
                    take: 1,
                    select: { id: true, label: true, displayUnit: true },
                  },
                },
              },
            },
          },
        },
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
      recentOrders: orders.map((order) => {
        const items = order.items.map((item) => {
          const product = item.product;
          const productName = item.name || product?.name || 'Product';
          const productImage =
            item.productImage ?? product?.images?.[0]?.url ?? null;
          const variant =
            item.variant ??
            product?.variants?.[0]?.label ??
            product?.variants?.[0]?.displayUnit ??
            product?.spec ??
            null;
          const unitPrice = decimalToNumber(item.unitPrice);
          return {
            id: item.id,
            productId: item.productId,
            variantId: item.variantId ?? product?.variants?.[0]?.id ?? null,
            name: productName,
            productName,
            productImage,
            sku: item.sku ?? product?.sku ?? null,
            brand: item.brand ?? product?.brand ?? null,
            category: item.category ?? product?.category?.name ?? null,
            variant,
            quantity: item.quantity,
            unit: item.unit || product?.unit || '',
            unitPrice,
            price: unitPrice,
            mrp:
              item.mrp != null
                ? decimalToNumber(item.mrp)
                : product?.retailPrice != null
                  ? decimalToNumber(product.retailPrice)
                  : null,
            gst: decimalToNumber(item.gst),
            subtotal: decimalToNumber(item.subtotal),
          };
        });

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.orderStatus,
          statusLabel: ORDER_STATUS_LABELS[order.orderStatus],
          itemCount: items.length,
          items,
          grandTotal: decimalToNumber(order.grandTotal),
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          createdAt: order.createdAt.toISOString(),
          canCancel: CANCELLABLE_STATUSES.includes(order.orderStatus),
          deliveredAt: order.deliveredAt?.toISOString() ?? null,
          expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
        };
      }),
      addresses,
      wishlistCount: wishlist,
      cartCount: cart,
      profile,
    };
  }
}
