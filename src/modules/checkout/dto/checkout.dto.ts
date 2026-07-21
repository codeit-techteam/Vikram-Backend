import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';
import { CartItemResponseDto } from '../../cart/dto/cart.dto';

export class CheckoutQueryDto {
  @ApiPropertyOptional({
    description: 'Delivery address UUID. Defaults to customer default address.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;
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

  @ApiPropertyOptional({ type: CheckoutHubDto, nullable: true })
  nearestHub!: CheckoutHubDto | null;

  @ApiProperty({
    example: true,
    description: 'True when a nearby hub has stock for all cart items',
  })
  hubAvailable!: boolean;

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

  @ApiProperty({ example: 1500, description: 'Available wallet balance' })
  walletBalance!: number;

  @ApiProperty({ example: 0, description: 'Wallet amount applied in preview (apply at order placement)' })
  walletApplied!: number;

  @ApiProperty({ example: 250, description: 'Total loyalty points earned' })
  loyaltyPoints!: number;

  @ApiProperty({ example: 250, description: 'Points redeemable at checkout' })
  redeemablePoints!: number;

  @ApiProperty({ example: 0, description: 'Loading/unloading charges' })
  loadingCharges!: number;

  @ApiProperty({ example: 0, description: 'Unloading charges' })
  unloadingCharges!: number;

  @ApiProperty({ example: true, description: 'Free bike delivery eligibility' })
  bikeDeliveryFree!: boolean;
}
