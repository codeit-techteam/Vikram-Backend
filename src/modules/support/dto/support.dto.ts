import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SupportTicketReason,
  SupportTicketStatus,
} from '../../../../generated/prisma/client';
import { PaginationMetaDto } from '../../../common/dto/pagination.dto';

export class CreateSupportTicketDto {
  @ApiProperty({ enum: SupportTicketReason })
  @IsEnum(SupportTicketReason)
  reason!: SupportTicketReason;

  @ApiPropertyOptional({ description: 'Related order UUID' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ example: 'Delivery delayed by 2 days' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiProperty({ example: 'Order was supposed to arrive yesterday.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;
}

export class SupportTicketResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ticketNumber!: string;

  @ApiPropertyOptional()
  orderId?: string | null;

  @ApiPropertyOptional()
  orderNumber?: string | null;

  @ApiProperty({ enum: SupportTicketReason })
  reason!: SupportTicketReason;

  @ApiPropertyOptional()
  subject?: string | null;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: SupportTicketStatus })
  status!: SupportTicketStatus;

  @ApiPropertyOptional()
  resolvedAt?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SupportTicketListResponseDto {
  @ApiProperty({ type: [SupportTicketResponseDto] })
  items!: SupportTicketResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
