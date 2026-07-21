import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CartService } from '../cart/cart.service';
import { MembershipService } from '../membership/membership.service';
import { WalletService } from '../wallet/wallet.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  decimalToNumber,
  haversineKm,
} from '../../common/shopping/pricing.util';
import {
  CheckoutAddressDto,
  CheckoutHubDto,
  CheckoutResponseDto,
  PrepareCheckoutDto,
} from './dto/checkout.dto';

const LOADING_CHARGE = 0;
const UNLOADING_CHARGE = 0;
const FREE_DELIVERY_THRESHOLD = 5000;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly membershipService: MembershipService,
    private readonly walletService: WalletService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async getCheckout(
    customerId: string,
    addressId?: string,
  ): Promise<CheckoutResponseDto> {
    return this.prepareCheckout(customerId, { addressId });
  }

  async prepareCheckout(
    customerId: string,
    dto: PrepareCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    const cart = await this.cartService.getCartForCheckout(customerId);

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    for (const item of cart.items) {
      const available = await this.cartService.getAvailableStock(item.productId);
      if (item.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for "${item.product.name}". Available: ${available}, requested: ${item.quantity}`,
        );
      }
    }

    const address = await this.resolveAddress(customerId, dto.addressId);
    const nearestHub = await this.findNearestHubWithStock(
      address,
      cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    );

    const hubAvailable = nearestHub?.canFulfill === true;

    const [membershipSummary, walletBalance, loyaltySummary] = await Promise.all([
      this.membershipService.getCurrentMembership(customerId),
      this.walletService.getBalance(customerId),
      this.loyaltyService.getLoyaltySummary(customerId),
    ]);

    const hasActiveMembership = membershipSummary.current?.isActive === true;
    const membershipDiscountPercent = hasActiveMembership ? 5 : 0;
    const membershipDiscount =
      Math.round((cart.subtotal * membershipDiscountPercent) / 100 * 100) / 100;

    const loadingCharges = LOADING_CHARGE;
    const unloadingCharges = UNLOADING_CHARGE;
    const bikeDeliveryFree =
      hasActiveMembership || cart.subtotal >= FREE_DELIVERY_THRESHOLD;

    const adjustedGrandTotal = Math.max(
      0,
      cart.grandTotal -
        membershipDiscount +
        loadingCharges +
        unloadingCharges -
        (bikeDeliveryFree && cart.deliveryCharge > 0 ? cart.deliveryCharge : 0),
    );

    return {
      address,
      items: cart.items,
      subtotal: cart.subtotal,
      gstAmount: cart.gstAmount,
      deliveryCharge: bikeDeliveryFree ? 0 : cart.deliveryCharge,
      grandTotal: adjustedGrandTotal,
      itemCount: cart.itemCount,
      nearestHub,
      hubAvailable,
      readinessMessage: hubAvailable
        ? 'Ready for order placement'
        : 'No nearby hub has full stock — order will be placed as Awaiting Hub Allocation',
      paymentMethod: 'CASH',
      notes: dto.notes ?? null,
      membershipDiscount,
      walletBalance,
      walletApplied: 0,
      loyaltyPoints: loyaltySummary.currentPoints,
      redeemablePoints: loyaltySummary.redeemablePoints,
      loadingCharges,
      unloadingCharges,
      bikeDeliveryFree,
    };
  }

  async resolveAddress(
    customerId: string,
    addressId?: string,
  ): Promise<CheckoutAddressDto> {
    const address = addressId
      ? await this.prisma.address.findFirst({
          where: { id: addressId, customerId, deletedAt: null },
        })
      : await this.prisma.address.findFirst({
          where: { customerId, deletedAt: null, isDefault: true },
        }) ??
        (await this.prisma.address.findFirst({
          where: { customerId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        }));

    if (!address) {
      throw new NotFoundException(
        'No delivery address found. Please add an address before checkout.',
      );
    }

    return {
      id: address.id,
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      latitude: address.latitude != null ? decimalToNumber(address.latitude) : null,
      longitude:
        address.longitude != null ? decimalToNumber(address.longitude) : null,
      isDefault: address.isDefault,
    };
  }

  async findNearestHubWithStock(
    address: CheckoutAddressDto,
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<CheckoutHubDto | null> {
    const hubs = await this.prisma.hub.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: EntityStatus.ACTIVE,
      },
      include: {
        inventory: {
          where: {
            productId: { in: items.map((i) => i.productId) },
          },
        },
      },
    });

    if (hubs.length === 0) return null;

    const lat = address.latitude;
    const lng = address.longitude;

    const ranked = hubs
      .map((hub) => {
        const hubLat = decimalToNumber(hub.latitude);
        const hubLng = decimalToNumber(hub.longitude);

        let distanceKm = Number.POSITIVE_INFINITY;
        if (lat != null && lng != null) {
          distanceKm = haversineKm(lat, lng, hubLat, hubLng);
        } else if (address.pincode && hub.pincode === address.pincode) {
          distanceKm = 0;
        }

        const canFulfill = items.every((item) => {
          const inv = hub.inventory.find((i) => i.productId === item.productId);
          return (inv?.availableQty ?? 0) >= item.quantity;
        });

        return {
          id: hub.id,
          code: hub.code,
          name: hub.name,
          city: hub.city,
          pincode: hub.pincode,
          distanceKm: Math.round(distanceKm * 100) / 100,
          canFulfill,
        } satisfies CheckoutHubDto;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const fulfilling = ranked.find((h) => h.canFulfill);
    return fulfilling ?? ranked[0] ?? null;
  }
}
