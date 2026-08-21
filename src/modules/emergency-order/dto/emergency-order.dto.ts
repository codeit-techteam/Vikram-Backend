import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  EmergencyOrderStatus,
  EmergencyPriorityLevel,
} from '../../../../generated/prisma/client';

export class CreateEmergencyOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Existing order ID' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({
    example: '2026-07-22T10:00:00.000Z',
    description: 'Required delivery deadline',
  })
  @IsDateString()
  requiredWithin!: string;

  @ApiPropertyOptional({
    enum: EmergencyPriorityLevel,
    default: EmergencyPriorityLevel.HIGH,
  })
  @IsOptional()
  @IsEnum(EmergencyPriorityLevel)
  priorityLevel?: EmergencyPriorityLevel;
}

export class EmergencyOrderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  requiredWithin!: string;

  @ApiProperty({ enum: EmergencyPriorityLevel })
  priorityLevel!: EmergencyPriorityLevel;

  @ApiProperty({ enum: EmergencyOrderStatus })
  status!: EmergencyOrderStatus;

  @ApiProperty()
  createdAt!: string;
}
