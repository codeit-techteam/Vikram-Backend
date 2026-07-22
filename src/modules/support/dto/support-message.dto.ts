import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  SupportMessageAttachmentType,
  SupportMessageSenderType,
  SupportTicketPriority,
  SupportTicketReason,
  SupportTicketStatus,
} from '../../../../generated/prisma/client';
import { PaginationMetaDto, PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class SendSupportMessageDto {
  @ApiProperty({
    example: 'The delivery was delayed by two days. Please help.',
    description: 'Message body text',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/support/attachment.pdf',
    description: 'Optional attachment URL (upload integration pending)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string;

  @ApiPropertyOptional({
    enum: SupportMessageAttachmentType,
    description: 'Required when attachmentUrl is provided',
  })
  @ValidateIf((dto: SendSupportMessageDto) => Boolean(dto.attachmentUrl))
  @IsEnum(SupportMessageAttachmentType)
  attachmentType?: SupportMessageAttachmentType;
}

export class SupportMessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SupportMessageSenderType })
  senderType!: SupportMessageSenderType;

  @ApiProperty()
  senderId!: string;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional()
  attachmentUrl?: string | null;

  @ApiPropertyOptional({ enum: SupportMessageAttachmentType })
  attachmentType?: SupportMessageAttachmentType | null;

  @ApiProperty()
  isInternal!: boolean;

  @ApiPropertyOptional()
  readAt?: string | null;

  @ApiPropertyOptional({ description: 'Display name of admin sender' })
  adminName?: string | null;

  @ApiPropertyOptional({ description: 'Display name of customer sender' })
  customerName?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SupportMessageListQueryDto extends PaginationQueryDto {}

export class SupportMessageListResponseDto {
  @ApiProperty({ type: [SupportMessageResponseDto] })
  items!: SupportMessageResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class SupportUnreadCountResponseDto {
  @ApiProperty({ example: 3 })
  unreadCount!: number;
}

export class SupportConversationParticipantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN', 'CUSTOMER_EXECUTIVE'] })
  role!: 'CUSTOMER' | 'ADMIN' | 'CUSTOMER_EXECUTIVE';
}

export class SupportConversationResponseDto {
  @ApiProperty()
  ticketId!: string;

  @ApiProperty()
  ticketNumber!: string;

  @ApiProperty({ enum: SupportTicketStatus })
  status!: SupportTicketStatus;

  @ApiProperty({ enum: SupportTicketPriority })
  priority!: SupportTicketPriority;

  @ApiProperty({ enum: SupportTicketReason })
  reason!: SupportTicketReason;

  @ApiPropertyOptional()
  subject?: string | null;

  @ApiPropertyOptional()
  lastMessage?: string | null;

  @ApiPropertyOptional()
  lastMessageAt?: string | null;

  @ApiProperty()
  unreadCount!: number;

  @ApiPropertyOptional({ type: SupportConversationParticipantDto })
  assignedExecutive?: SupportConversationParticipantDto | null;

  @ApiProperty({ type: [SupportConversationParticipantDto] })
  participants!: SupportConversationParticipantDto[];

  @ApiProperty({ type: [SupportMessageResponseDto] })
  messages!: SupportMessageResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class AddInternalNoteDto {
  @ApiProperty({
    example: 'Customer called twice — follow up after hub confirmation.',
    description: 'Internal note visible only to admins and customer executives',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class MarkMessagesReadResponseDto {
  @ApiProperty({ example: 5 })
  markedCount!: number;

  @ApiProperty({ example: 0 })
  unreadCount!: number;
}
