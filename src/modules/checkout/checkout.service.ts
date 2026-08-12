import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CartService } from '../cart/cart.service';
import { MembershipService } from '../membership/membership.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { LoyaltyTransactionService } from '../loyalty/loyalty-transaction.service';
import {
  calculateEarnPoints,
  calculateMaxRedeemablePoints,
} from '../loyalty/loyalty.constants';
import { decimalToNumber } from '../../common/shopping/pricing.util';
import { CoverageService } from '../coverage/coverage.service';
import { DeliveryService } from '../delivery/delivery.service';
import { DeliveryPricingService } from '../delivery/delivery-pricing.service';
import {
  CheckoutAddressDto,
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
    private readonly loyaltyService: LoyaltyService,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
    private readonly coverageService: CoverageService,
    private readonly deliveryService: DeliveryService,
    private readonly deliveryPricingService: DeliveryPricingService,
  ) {}

  async getCheckout(
    customerId: string,
    addressId?: string,
    loyaltyPointsToRedeem?: number,
  ): Promise<CheckoutResponseDto> {
    return this.prepareCheckout(customerId, {
      addressId,
      loyaltyPointsToRedeem,
    });
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
    const deliveryPreview =
      address.latitude != null && address.longitude != null
        ? await this.deliveryService.calculateEta({
            latitude: address.latitude,
            longitude: address.longitude,
            pincode: address.pincode,
            cartItems: cart.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
          })
        : null;

    const distanceKm =
      nearestHub && Number.isFinite(nearestHub.distanceKm)
        ? Number(nearestHub.distanceKm)
        : 0;

    const [membershipSummary, loyaltySummary, redeemablePoints, priced] =
      await Promise.all([
        this.membershipService.getCurrentMembership(customerId),
        this.loyaltyService.getLoyaltySummary(customerId),
        this.loyaltyService.getRedeemablePoints(customerId),
        this.deliveryPricingService.calculateFromCart({
          cartItems: cart.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          distanceKm,
          customerId,
          applyFreeBikeBenefit: true,
        }),
      ]);

    if (priced.requiresBulkQuote) {
      throw new BadRequestException(
        priced.message ??
          'Your order requires a bulk delivery quote. Please use Bulk Enquiry.',
      );
    }

    if (!priced.available && distanceKm > 0) {
      throw new BadRequestException(
        priced.message ??
          'Delivery pricing unavailable for this vehicle/distance',
      );
    }

    const vehicleType = priced.vehicleType;

    const hasActiveMembership = membershipSummary.current?.isActive === true;
    const membershipDiscountPercent = hasActiveMembership ? 5 : 0;
    const membershipDiscount =
      Math.round((cart.subtotal * membershipDiscountPercent) / 100 * 100) / 100;

    const loadingCharges = LOADING_CHARGE;
    const unloadingCharges = UNLOADING_CHARGE;

    const thresholdOrMembershipFree =
      hasActiveMembership || cart.subtotal >= FREE_DELIVERY_THRESHOLD;

    // Server-calculated — never trust client-supplied deliveryCharge
    let deliveryCharge = thresholdOrMembershipFree ? 0 : priced.deliveryCharge;
    let bikeDeliveryFree =
      thresholdOrMembershipFree || priced.freeDeliveryApplied;
    let companyAbsorbedDelivery = thresholdOrMembershipFree
      ? 0
      : priced.companyAbsorbedDelivery;
    const freeBikeDeliveriesRemaining =
      priced.freeBikeDeliveriesRemaining ?? 0;
    const freeDeliveryApplied =
      !thresholdOrMembershipFree && priced.freeDeliveryApplied;

    const orderValueBeforeLoyalty =
      cart.subtotal +
      cart.gstAmount +
      deliveryCharge +
      loadingCharges +
      unloadingCharges -
      membershipDiscount;

    const maxRedeemablePoints = calculateMaxRedeemablePoints(
      orderValueBeforeLoyalty,
      redeemablePoints,
    );

    const requestedLoyaltyPoints = dto.loyaltyPointsToRedeem ?? 0;
    let loyaltyUsed = 0;
    let loyaltyDiscount = 0;
    let loyaltyMessage: string | undefined;

    if (requestedLoyaltyPoints > 0) {
      const validation = this.loyaltyTransactionService.validateRedemption({
        requestedPoints: requestedLoyaltyPoints,
        orderValueInr: orderValueBeforeLoyalty,
        availablePoints: redeemablePoints,
      });
      loyaltyUsed = validation.allowedPoints;
      loyaltyDiscount = validation.discountAmount;
      loyaltyMessage = validation.message;
    } else {
      const preview = this.loyaltyTransactionService.validateRedemption({
        requestedPoints: 0,
        orderValueInr: orderValueBeforeLoyalty,
        availablePoints: redeemablePoints,
        soft: true,
      });
      loyaltyMessage = preview.message;
    }

    const adjustedGrandTotal = Math.max(
      0,
      orderValueBeforeLoyalty - loyaltyDiscount,
    );

    const eligibleEarnAmount = Math.max(0, cart.subtotal - membershipDiscount);
    const estimatedEarnPoints = calculateEarnPoints(eligibleEarnAmount);

    return {
      address,
      items: cart.items,
      subtotal: cart.subtotal,
      gstAmount: cart.gstAmount,
      deliveryCharge,
      grandTotal: adjustedGrandTotal,
      itemCount: cart.itemCount,
      serviceable: deliveryPreview?.serviceable ?? hubAvailable,
      deliveryETA: deliveryPreview?.deliveryETA ?? 0,
      deliveryMessage:
        deliveryPreview?.deliveryMessage ?? 'Delivery details unavailable',
      deliveringBy: deliveryPreview?.deliveringBy ?? null,
      readinessMessage: hubAvailable
        ? 'Ready for order placement'
        : 'Some items may need extra time — you can still place your order',
      paymentMethod: 'CASH',
      notes: dto.notes ?? null,
      membershipDiscount,
      loyaltyPoints: loyaltySummary.availablePoints,
      redeemablePoints,
      maxRedeemablePoints,
      loyaltyUsed,
      loyaltyDiscount,
      loyaltyAvailableValue: loyaltySummary.availableValue,
      pointValueInr: loyaltySummary.pointValueInr,
      minRedeemOrderValue: loyaltySummary.minRedeemOrderValue,
      redemptionEligible:
        orderValueBeforeLoyalty >= loyaltySummary.minRedeemOrderValue,
      loyaltyMessage: loyaltyMessage ?? null,
      estimatedEarnPoints,
      discount: membershipDiscount + loyaltyDiscount,
      loadingCharges,
      unloadingCharges,
      bikeDeliveryFree,
      companyAbsorbedDelivery,
      freeBikeDeliveriesRemaining,
      deliveryVehicleType: vehicleType,
      deliveryVehicleDisplayName: priced.vehicleDisplayName,
      deliveryDistanceKm: distanceKm,
      deliveryListPrice: priced.listPrice,
      deliveryPricingRuleId: priced.pricingRuleId,
      deliveryPricingVersion: priced.pricingVersion,
      freeDeliveryApplied,
      freeBikeDeliveriesAllowed: priced.freeBikeDeliveriesAllowed ?? null,
      freeBikeDeliveriesUsed: priced.freeBikeDeliveriesUsed ?? null,
      deliveryVehicleCount: priced.vehicleCount,
      deliveryTotalWeightKg: priced.totalWeightKg,
      deliveryTotalVolumeCft: priced.totalVolumeCft,
      deliveryTotalQuantity: priced.totalQuantity,
      deliveryCapacityUsed: priced.capacityUsed,
      deliveryCapacityLimit: priced.capacityLimit,
      deliveryCapacityUtilizationPercent: priced.capacityUtilizationPercent,
      deliveryFreeReason: priced.freeDeliveryReason,
      deliveryRequiresBulkQuote: priced.requiresBulkQuote,
      deliveryMultiVehicle: priced.multiVehicle,
      deliveryBreakdown: priced.breakdown ?? null,
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
      : ((await this.prisma.address.findFirst({
          where: { customerId, deletedAt: null, isDefault: true },
        })) ??
        (await this.prisma.address.findFirst({
          where: { customerId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })));

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
      latitude:
        address.latitude != null ? decimalToNumber(address.latitude) : null,
      longitude:
        address.longitude != null ? decimalToNumber(address.longitude) : null,
      isDefault: address.isDefault,
    };
  }

  async findNearestHubWithStock(
    address: CheckoutAddressDto,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    return this.coverageService.findNearestHub(
      {
        latitude: address.latitude,
        longitude: address.longitude,
        pincode: address.pincode,
      },
      items,
    );
  }
}
