import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import {
  MembershipStatus,
  PaymentStatus,
} from '../../../../generated/prisma/client';

export class PurchaseMembershipDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Membership plan ID to purchase',
  })
  @IsUUID()
  planId!: string;
}

export class RenewMembershipDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Plan ID to renew with. Defaults to current active plan.',
  })
  @IsOptional()
  @IsUUID()
  planId?: string;
}

export class MembershipPlanResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  durationDays!: number;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty({ type: [String] })
  benefits!: string[];

  @ApiProperty()
  status!: string;
}

export class CustomerMembershipResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty({ type: MembershipPlanResponseDto })
  plan!: MembershipPlanResponseDto;

  @ApiProperty()
  purchaseDate!: string;

  @ApiProperty()
  expiryDate!: string;

  @ApiProperty({ enum: MembershipStatus })
  status!: MembershipStatus;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiPropertyOptional()
  renewalDate?: string | null;

  @ApiProperty({ description: 'Days remaining until expiry (0 if expired)' })
  daysRemaining!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class MembershipSummaryDto {
  @ApiPropertyOptional({ type: CustomerMembershipResponseDto, nullable: true })
  current!: CustomerMembershipResponseDto | null;

  @ApiProperty({ description: 'Whether customer has ever had a membership' })
  hasMembershipHistory!: boolean;
}
