import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DELIVERY_PREFERENCE_TYPES } from '../../delivery/delivery-preference.constants';

export const RAZORPAY_CHECKOUT_METHODS = [
  'upi',
  'card',
  'netbanking',
  'wallet',
] as const;

export type RazorpayCheckoutMethod =
  (typeof RAZORPAY_CHECKOUT_METHODS)[number];

export class CreateRazorpayOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;

  @ApiPropertyOptional({ enum: DELIVERY_PREFERENCE_TYPES })
  @IsOptional()
  @IsEnum(DELIVERY_PREFERENCE_TYPES)
  deliveryPreferenceType?: (typeof DELIVERY_PREFERENCE_TYPES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  scheduledSlotId?: string;

  @ApiPropertyOptional({ maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  deliveryCustomerRemark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Reuse an existing unpaid internal order instead of creating a new one.',
  })
  @IsOptional()
  @IsUUID()
  internalOrderId?: string;

  @ApiPropertyOptional({ enum: RAZORPAY_CHECKOUT_METHODS })
  @IsOptional()
  @IsEnum(RAZORPAY_CHECKOUT_METHODS)
  checkoutMethod?: RazorpayCheckoutMethod;
}

export class VerifyRazorpayPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  internalOrderId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  razorpay_payment_id!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  razorpay_order_id!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  razorpay_signature!: string;
}

export class CancelRazorpayPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  internalOrderId!: string;
}
