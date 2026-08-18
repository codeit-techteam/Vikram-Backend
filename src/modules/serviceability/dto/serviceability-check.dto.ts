import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class ServiceabilityCheckQueryDto {
  @ApiProperty({ example: 22.9754, description: 'Customer latitude' })
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 88.4342, description: 'Customer longitude' })
  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ example: 22.9754, description: 'Alias for latitude' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 88.4342, description: 'Alias for longitude' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class ServiceabilityCheckResponseDto {
  @ApiProperty()
  serviceable!: boolean;

  @ApiProperty({ description: 'Estimated delivery time in minutes' })
  deliveryETA!: number;

  @ApiProperty({ example: 'Estimated delivery 45–70 mins' })
  deliveryMessage!: string;

  @ApiPropertyOptional({ description: 'Why serviceability failed (customer-facing)' })
  reason?: string;

  @ApiPropertyOptional({
    example: 'Kalyani Hub',
    description: 'Fulfilling hub name when the location is serviceable',
  })
  hubName?: string;
}
