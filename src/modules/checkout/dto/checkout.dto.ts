import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, IsString, MaxLength, Min, IsNumber } from 'class-validator';
import { CartItemResponseDto } from '../../cart/dto/cart.dto';

export class CheckoutQueryDto {
  @ApiPropertyOptional({
    description: 'Delivery address UUID. Defaults to customer default address.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description: 'Loyalty points to redeem at checkout preview',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;
}

export class PrepareCheckoutDto {
  @ApiPropertyOptional({
    description: 'Delivery address UUID. Defaults to customer default address.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    example: 'Please call before delivery',
    description: 'Optional order notes (preview only — not persisted until POST /orders)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Loyalty points to redeem at checkout preview',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;
}

export class CheckoutAddressDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  label?: string | null;

  @ApiProperty()
  line1!: string;

  @ApiPropertyOptional()
  line2?: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  pincode!: string;

  @ApiPropertyOptional()
  latitude?: number | null;

  @ApiPropertyOptional()
  longitude?: number | null;

  @ApiProperty()
  isDefault!: boolean;
}

export class CheckoutHubDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  pincode!: string;

  @ApiProperty({ example: 4.2, description: 'Distance from delivery address in km' })
  distanceKm!: number;

  @ApiProperty({
    example: true,
    description: 'Whether this hub can fulfill all cart items from available stock',
  })
  canFulfill!: boolean;
}

export class CheckoutResponseDto {
  @ApiProperty({ type: CheckoutAddressDto })
  address!: CheckoutAddressDto;

  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({ example: 850 })
  subtotal!: number;

  @ApiProperty({ example: 153 })
  gstAmount!: number;

  @ApiProperty({ example: 150 })
  deliveryCharge!: number;

  @ApiProperty({ example: 1153 })
  grandTotal!: number;

  @ApiProperty({ example: 1 })
  itemCount!: number;

  @ApiProperty({ example: true })
  serviceable!: boolean;

  @ApiProperty({ example: 28 })
  deliveryETA!: number;

  @ApiPropertyOptional({ example: 25 })
  deliveryEtaMinMinutes?: number;

  @ApiPropertyOptional({ example: 40 })
  deliveryEtaMaxMinutes?: number;

  @ApiPropertyOptional({ example: 'CEMENT' })
  deliveryLogisticsType?: string | null;

  @ApiPropertyOptional({ example: 12 })
  deliveryPreparationMinutes?: number | null;

  @ApiPropertyOptional({ example: 18 })
  deliveryLoadingMinutes?: number | null;

  @ApiPropertyOptional({ example: 22 })
  deliveryTravelMinutes?: number | null;

  @ApiPropertyOptional({ example: 14 })
  deliveryUnloadingMinutes?: number | null;

  @ApiProperty({ example: 'Estimated delivery 25–40 mins' })
  deliveryMessage!: string;

  @ApiPropertyOptional({ example: '5:30 PM' })
  deliveringBy?: string | null;

  @ApiProperty({
    example: 'Ready for order placement',
    description: 'Human-readable checkout readiness message',
  })
  readinessMessage!: string;

  @ApiProperty({
    example: 'CASH',
    description: 'MVP supports Cash / Manual payment placeholder only',
  })
  paymentMethod!: string;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiProperty({ example: 42.5, description: 'Membership discount applied (preview)' })
  membershipDiscount!: number;

  @ApiProperty({ example: 2257, description: 'Available loyalty points' })
  loyaltyPoints!: number;

  @ApiProperty({ example: 2257, description: 'Points redeemable at checkout' })
  redeemablePoints!: number;

  @ApiProperty({ example: 2257, description: 'Maximum points redeemable for this order' })
  maxRedeemablePoints!: number;

  @ApiProperty({ example: 0, description: 'Loyalty points applied in preview' })
  loyaltyUsed!: number;

  @ApiProperty({ example: 0, description: 'Loyalty discount in INR (1 point = ₹0.01)' })
  loyaltyDiscount!: number;

  @ApiProperty({ example: 22.57 })
  loyaltyAvailableValue!: number;

  @ApiProperty({ example: 0.01 })
  pointValueInr!: number;

  @ApiProperty({ example: 500 })
  minRedeemOrderValue!: number;

  @ApiProperty({ example: true })
  redemptionEligible!: boolean;

  @ApiPropertyOptional({ nullable: true })
  loyaltyMessage?: string | null;

  @ApiProperty({ example: 34, description: 'Points that will be earned after successful delivery' })
  estimatedEarnPoints!: number;

  @ApiProperty({ example: 0, description: 'Total discount (membership + loyalty)' })
  discount!: number;

  @ApiProperty({ example: 0, description: 'Loading/unloading charges' })
  loadingCharges!: number;

  @ApiProperty({ example: 0, description: 'Unloading charges' })
  unloadingCharges!: number;

  @ApiProperty({ example: true, description: 'Free bike delivery eligibility' })
  bikeDeliveryFree!: boolean;

  @ApiProperty({ example: 99, description: 'Company-absorbed bike delivery cost when free benefit used' })
  companyAbsorbedDelivery!: number;

  @ApiProperty({ example: 2, description: 'Remaining free bike deliveries' })
  freeBikeDeliveriesRemaining!: number;

  @ApiPropertyOptional({ example: 'BIKE' })
  deliveryVehicleType?: string;

  @ApiPropertyOptional({ example: 'Bike' })
  deliveryVehicleDisplayName?: string;

  @ApiPropertyOptional({ example: 2.4 })
  deliveryDistanceKm?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Configured list price before free-bike benefit',
  })
  deliveryListPrice?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  deliveryPricingRuleId?: string | null;

  @ApiPropertyOptional({ example: 1 })
  deliveryPricingVersion?: number | null;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether free bike benefit was applied (customer pays ₹0)',
  })
  freeDeliveryApplied?: boolean;

  @ApiPropertyOptional({ example: 3 })
  freeBikeDeliveriesAllowed?: number | null;

  @ApiPropertyOptional({ example: 1 })
  freeBikeDeliveriesUsed?: number | null;

  @ApiPropertyOptional({ example: 1 })
  deliveryVehicleCount?: number;

  @ApiPropertyOptional({ example: 320 })
  deliveryTotalWeightKg?: number | null;

  @ApiPropertyOptional({ example: 18 })
  deliveryTotalVolumeCft?: number | null;

  @ApiPropertyOptional({ example: 50 })
  deliveryTotalQuantity?: number | null;

  @ApiPropertyOptional({ example: 320 })
  deliveryCapacityUsed?: number | null;

  @ApiPropertyOptional({ example: 500 })
  deliveryCapacityLimit?: number | null;

  @ApiPropertyOptional({ example: 64 })
  deliveryCapacityUtilizationPercent?: number | null;

  @ApiPropertyOptional({ example: 'FREE_BIKE_DELIVERY' })
  deliveryFreeReason?: string | null;

  @ApiPropertyOptional({ example: false })
  deliveryRequiresBulkQuote?: boolean;

  @ApiPropertyOptional({ example: false })
  deliveryMultiVehicle?: boolean;

  @ApiPropertyOptional()
  deliverySelectionReason?: string | null;

  @ApiPropertyOptional({ type: Object })
  deliveryBreakdown?: Record<string, unknown> | null;
}
