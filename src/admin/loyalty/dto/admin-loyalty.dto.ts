import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class LoyaltyAdjustDto {
  @ApiProperty({ description: 'Positive or negative number' })
  @IsInt()
  points: number;
  @ApiProperty() @IsString() reason: string;
}

export class LoyaltyRewardDto {
  @ApiProperty() @IsInt() @Min(1) points: number;
  @ApiProperty() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
}

export class LoyaltyRedeemDto {
  @ApiProperty() @IsInt() @Min(1) points: number;
  @ApiProperty() @IsString() reason: string;
}

export class LoyaltyQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
  @ApiPropertyOptional({
    description:
      'Search by customer name, phone, customer ID, company, or city',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
