import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
      'Customer can raise a ticket for Late Delivery, Wrong Product, Damaged Material, or Other.',
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
  @ApiOperation({ summary: 'List my support tickets' })
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

  @Get(':ticketId')
  @ApiOperation({ summary: 'Get support ticket details' })
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
