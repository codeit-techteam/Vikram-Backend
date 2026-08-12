import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import {
  CreateExpertCallbackDto,
  ExpertCallbackListResponseDto,
  ExpertCallbackResponseDto,
} from './dto/expert-callback.dto';
import { ExpertCallbackService } from './expert-callback.service';

class ExpertCallbackListQueryDto {
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

@ApiTags(SWAGGER_TAGS.EXPERT_CALLBACK)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'expert-callbacks' })
export class ExpertCallbackController {
  constructor(private readonly expertCallbackService: ExpertCallbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a material expert callback',
    description:
      'Customer submits name + needs from Talk to Expert. Visible to Customer Executives.',
  })
  @ApiBody({ type: CreateExpertCallbackDto })
  @ApiResponse({ status: 201, type: ExpertCallbackResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  async create(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CreateExpertCallbackDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: ExpertCallbackResponseDto;
  }> {
    const data = await this.expertCallbackService.create(customer.id, dto);
    return {
      success: true,
      message: 'Callback request submitted successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List my material expert callback requests' })
  @ApiResponse({ status: 200, type: ExpertCallbackListResponseDto })
  async list(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Query() query: ExpertCallbackListQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: ExpertCallbackListResponseDto;
  }> {
    const data = await this.expertCallbackService.listForCustomer(
      customer.id,
      query.page ?? 1,
      query.limit ?? 20,
    );
    return {
      success: true,
      message: 'Callback requests fetched',
      data,
    };
  }
}
