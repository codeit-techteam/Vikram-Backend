import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { BulkService } from './bulk.service';
import {
  BulkEnquiryListResponseDto,
  BulkEnquiryResponseDto,
  CreateBulkEnquiryDto,
} from './dto/bulk.dto';

@ApiTags(SWAGGER_TAGS.BULK)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'bulk' })
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create bulk procurement enquiry' })
  @ApiBody({ type: CreateBulkEnquiryDto })
  @ApiResponse({ status: 201, type: BulkEnquiryResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateBulkEnquiryDto,
  ): Promise<{ success: boolean; message: string; data: BulkEnquiryResponseDto }> {
    const data = await this.bulkService.createEnquiry(user.id, dto);
    return {
      success: true,
      message: 'Bulk enquiry submitted successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List customer bulk enquiries' })
  @ApiResponse({ status: 200, type: BulkEnquiryListResponseDto })
  async list(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: BulkEnquiryListResponseDto }> {
    const data = await this.bulkService.listEnquiries(user.id);
    return {
      success: true,
      message: 'Bulk enquiries fetched successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bulk enquiry details' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: BulkEnquiryResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string; data: BulkEnquiryResponseDto }> {
    const data = await this.bulkService.getEnquiryById(user.id, id);
    return {
      success: true,
      message: 'Bulk enquiry fetched successfully',
      data,
    };
  }
}
