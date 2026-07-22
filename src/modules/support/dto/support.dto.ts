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
  SupportTicketPriority,
  SupportMessageSenderType,
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

  @ApiProperty({ enum: SupportTicketPriority })
  priority!: SupportTicketPriority;

  @ApiPropertyOptional()
  resolvedAt?: string | null;

  @ApiPropertyOptional()
  closedAt?: string | null;

  @ApiPropertyOptional()
  assignedExecutiveName?: string | null;

  @ApiPropertyOptional({ description: 'Preview of the most recent message' })
  lastMessage?: string | null;

  @ApiPropertyOptional()
  lastMessageAt?: string | null;

  @ApiPropertyOptional({ description: 'Unread messages from admin/executive' })
  unreadCount?: number;

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        senderType: { enum: Object.values(SupportMessageSenderType) },
        message: { type: 'string' },
        adminName: { type: 'string', nullable: true },
        createdAt: { type: 'string' },
      },
    },
    deprecated: true,
    description: 'Use GET /support/:ticketId/messages for conversation history',
  })
  messages?: Array<{
    id: string;
    senderType: SupportMessageSenderType;
    message: string;
    adminName?: string | null;
    createdAt: string;
  }>;

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
