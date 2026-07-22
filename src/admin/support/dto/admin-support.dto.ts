import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  SupportTicketHistoryAction,
  SupportMessageAttachmentType,
  SupportMessageSenderType,
  SupportTicketPriority,
  SupportTicketReason,
  SupportTicketStatus,
} from '../../../../generated/prisma/client';
import { PaginationMetaDto, PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class AdminSupportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus, description: 'Filter by ticket status' })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: SupportTicketPriority, description: 'Filter by priority' })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @ApiPropertyOptional({ description: 'Filter by assigned executive admin UUID' })
  @IsOptional()
  @IsUUID()
  executiveId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer UUID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter tickets created on or after (ISO date)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter tickets created on or before (ISO date)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Search ticket number, subject, or customer phone/name' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class AssignSupportExecutiveDto {
  @ApiProperty({ description: 'Admin user UUID of the customer executive to assign' })
  @IsUUID()
  executiveId!: string;
}

export class AdminSupportReplyDto {
  @ApiProperty({ example: 'We have escalated your delivery issue to the hub team.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

export class AdminSupportNoteDto {
  @ApiProperty({ example: 'Customer called twice — follow up after hub confirmation.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class UpdateSupportStatusDto {
  @ApiProperty({ enum: SupportTicketStatus, example: SupportTicketStatus.IN_PROGRESS })
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;

  @ApiPropertyOptional({ description: 'Optional remark recorded in ticket history' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateSupportPriorityDto {
  @ApiProperty({ enum: SupportTicketPriority, example: SupportTicketPriority.HIGH })
  @IsEnum(SupportTicketPriority)
  priority!: SupportTicketPriority;
}

export class SupportExecutiveSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;
}

export class SupportCustomerSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  fullName?: string | null;

  @ApiProperty()
  phone!: string;
}

export class SupportTicketListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ticketNumber!: string;

  @ApiProperty({ enum: SupportTicketReason })
  reason!: SupportTicketReason;

  @ApiPropertyOptional()
  subject?: string | null;

  @ApiProperty({ enum: SupportTicketStatus })
  status!: SupportTicketStatus;

  @ApiProperty({ enum: SupportTicketPriority })
  priority!: SupportTicketPriority;

  @ApiPropertyOptional()
  orderId?: string | null;

  @ApiPropertyOptional()
  orderNumber?: string | null;

  @ApiProperty({ type: SupportCustomerSummaryDto })
  customer!: SupportCustomerSummaryDto;

  @ApiPropertyOptional({ type: SupportExecutiveSummaryDto })
  assignedExecutive?: SupportExecutiveSummaryDto | null;

  @ApiPropertyOptional({ description: 'Preview of the most recent message' })
  lastMessage?: string | null;

  @ApiPropertyOptional()
  lastMessageAt?: string | null;

  @ApiPropertyOptional({ description: 'Unread messages from customer' })
  unreadCount?: number;

  @ApiPropertyOptional()
  resolvedAt?: string | null;

  @ApiPropertyOptional()
  closedAt?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SupportTicketListResponseDto {
  @ApiProperty({ type: [SupportTicketListItemDto] })
  items!: SupportTicketListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class SupportTicketMessageDto {
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

  @ApiPropertyOptional()
  adminName?: string | null;

  @ApiPropertyOptional()
  customerName?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SupportTicketNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  adminName!: string;

  @ApiProperty()
  createdAt!: string;
}

export class SupportTicketHistoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SupportTicketHistoryAction })
  action!: SupportTicketHistoryAction;

  @ApiPropertyOptional()
  field?: string | null;

  @ApiPropertyOptional()
  oldValue?: string | null;

  @ApiPropertyOptional()
  newValue?: string | null;

  @ApiPropertyOptional()
  adminEmail?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class SupportTicketDetailDto extends SupportTicketListItemDto {
  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [SupportTicketMessageDto] })
  messages!: SupportTicketMessageDto[];

  @ApiProperty({ type: [SupportTicketNoteDto] })
  notes!: SupportTicketNoteDto[];

  @ApiProperty({ type: [SupportTicketHistoryItemDto] })
  history!: SupportTicketHistoryItemDto[];
}
