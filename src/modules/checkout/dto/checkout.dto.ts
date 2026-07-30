import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, IsString, MaxLength, Min, IsNumber } from 'class-validator';
import { CartItemResponseDto } from '../../cart/dto/cart.dto';
import { LOYALTY_MIN_REDEEM_POINTS } from '../../loyalty/loyalty.constants';

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
    minimum: LOYALTY_MIN_REDEEM_POINTS,
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
    minimum: LOYALTY_MIN_REDEEM_POINTS,
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

  @ApiProperty({ example: 'Delivery in 28 mins' })
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

  @ApiProperty({ example: 250, description: 'Total loyalty points earned' })
  loyaltyPoints!: number;

  @ApiProperty({ example: 250, description: 'Points redeemable at checkout' })
  redeemablePoints!: number;

  @ApiProperty({ example: 500, description: 'Maximum points redeemable for this order' })
  maxRedeemablePoints!: number;

  @ApiProperty({ example: 0, description: 'Loyalty points applied in preview' })
  loyaltyUsed!: number;

  @ApiProperty({ example: 0, description: 'Loyalty discount in INR (1 point = ₹1)' })
  loyaltyDiscount!: number;

  @ApiProperty({ example: 0, description: 'Total discount (membership + loyalty)' })
  discount!: number;

  @ApiProperty({ example: 0, description: 'Loading/unloading charges' })
  loadingCharges!: number;

  @ApiProperty({ example: 0, description: 'Unloading charges' })
  unloadingCharges!: number;

  @ApiProperty({ example: true, description: 'Free bike delivery eligibility' })
  bikeDeliveryFree!: boolean;
}
