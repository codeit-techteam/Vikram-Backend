import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import {
  CreateSupportTicketDto,
  SupportTicketListResponseDto,
  SupportTicketResponseDto,
} from './dto/support.dto';
import {
  MarkMessagesReadResponseDto,
  SendSupportMessageDto,
  SupportConversationResponseDto,
  SupportMessageListResponseDto,
  SupportMessageResponseDto,
  SupportUnreadCountResponseDto,
} from './dto/support-message.dto';
import { SupportService } from './support.service';

class SupportListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

class SupportMessageQueryDto extends SupportListQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  override limit?: number = 50;
}

@ApiTags(SWAGGER_TAGS.SUPPORT)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'support' })
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Raise support ticket',
    description:
      'Customer can raise a ticket for Late Delivery, Wrong Product, Damaged Material, or Other. Creates the first conversation message from the description.',
  })
  @ApiResponse({ status: 201, type: SupportTicketResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error', type: ApiErrorResponseDto })
  async create(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CreateSupportTicketDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: SupportTicketResponseDto;
  }> {
    const data = await this.supportService.create(customer.id, dto);
    return {
      success: true,
      message: 'Support ticket created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List my support tickets',
    description: 'Returns paginated tickets with last message preview and unread counts.',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: SupportTicketListResponseDto })
  async findAll(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Query() query: SupportListQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: SupportTicketListResponseDto;
  }> {
    const data = await this.supportService.findAll(
      customer.id,
      query.page ?? 1,
      query.limit ?? 20,
    );
    return {
      success: true,
      message: 'Support tickets fetched successfully',
      data,
    };
  }

  @Get(':ticketId/unread-count')
  @ApiOperation({
    summary: 'Get unread message count',
    description: 'Returns the number of unread admin messages for this ticket.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, type: SupportUnreadCountResponseDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async getUnreadCount(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    const data = await this.supportService.getUnreadCount(customer.id, ticketId);
    return { success: true, message: 'Unread count fetched', data };
  }

  @Get(':ticketId/messages')
  @ApiOperation({
    summary: 'Get conversation history',
    description:
      'Returns paginated messages sorted oldest to newest. Internal notes are never included.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: SupportConversationResponseDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async getMessages(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query() query: SupportMessageQueryDto,
  ) {
    const data = await this.supportService.getConversation(
      customer.id,
      ticketId,
      query.page ?? 1,
      query.limit ?? 50,
    );
    return { success: true, message: 'Conversation fetched', data };
  }

  @Post(':ticketId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send message on ticket',
    description:
      'Customer reply. Sets ticket status to WAITING_FOR_ADMIN. Replies after RESOLVED automatically reopen the ticket.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 201, type: SupportMessageResponseDto })
  @ApiResponse({ status: 400, description: 'Ticket is closed', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async sendMessage(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    const data = await this.supportService.sendMessage(
      customer.id,
      ticketId,
      dto,
    );
    return { success: true, message: 'Message sent', data };
  }

  @Patch(':ticketId/messages/read')
  @ApiOperation({
    summary: 'Mark admin messages as read',
    description: 'Marks all unread admin/executive messages as read when customer opens the ticket.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, type: MarkMessagesReadResponseDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async markMessagesRead(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    const data = await this.supportService.markMessagesRead(customer.id, ticketId);
    return { success: true, message: 'Messages marked as read', data };
  }

  @Get(':ticketId')
  @ApiOperation({
    summary: 'Get support ticket details',
    description: 'Returns ticket summary. Marks admin messages as read automatically.',
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, type: SupportTicketResponseDto })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ApiErrorResponseDto })
  async findOne(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: SupportTicketResponseDto;
  }> {
    const data = await this.supportService.findOne(customer.id, ticketId);
    return {
      success: true,
      message: 'Support ticket fetched successfully',
      data,
    };
  }
}
