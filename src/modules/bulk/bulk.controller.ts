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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { BulkService } from './bulk.service';
import {
  BulkEnquiryListQueryDto,
  BulkEnquiryListResponseDto,
  BulkEnquiryResponseDto,
  BulkFormConfigDto,
  CreateBulkEnquiryDto,
} from './dto/bulk.dto';

@ApiTags(SWAGGER_TAGS.BULK)
@Controller({ version: '1', path: 'bulk' })
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}

  @Get('form-config')
  @Public()
  @ApiOperation({
    summary: 'Bulk enquiry form options (categories, delivery, brick types)',
  })
  @ApiResponse({ status: 200, type: BulkFormConfigDto })
  async formConfig(): Promise<{
    success: boolean;
    message: string;
    data: BulkFormConfigDto;
  }> {
    const data = await this.bulkService.getFormConfig();
    return {
      success: true,
      message: 'Bulk form config fetched successfully',
      data,
    };
  }

  @Get('meta/form-options')
  @Public()
  @ApiOperation({
    summary: 'Alias for form-config',
  })
  async formOptions(): Promise<{
    success: boolean;
    message: string;
    data: BulkFormConfigDto;
  }> {
    return this.formConfig();
  }

  @Post()
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create bulk procurement enquiry' })
  @ApiBody({ type: CreateBulkEnquiryDto })
  @ApiResponse({ status: 201, type: BulkEnquiryResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateBulkEnquiryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: BulkEnquiryResponseDto;
  }> {
    const data = await this.bulkService.createEnquiry(user.id, dto);
    return {
      success: true,
      message: 'Bulk enquiry submitted successfully',
      data,
    };
  }

  @Get()
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'List customer bulk enquiries' })
  @ApiResponse({ status: 200, type: BulkEnquiryListResponseDto })
  async list(
    @CurrentUser() user: AuthenticatedCustomer,
    @Query() query: BulkEnquiryListQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: BulkEnquiryListResponseDto;
  }> {
    const data = await this.bulkService.listEnquiries(user.id, query);
    return {
      success: true,
      message: 'Bulk enquiries fetched successfully',
      data,
    };
  }

  @Get(':id')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Get bulk enquiry details' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: BulkEnquiryResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: BulkEnquiryResponseDto;
  }> {
    const data = await this.bulkService.getEnquiryById(user.id, id);
    return {
      success: true,
      message: 'Bulk enquiry fetched successfully',
      data,
    };
  }

  @Patch(':id/cancel')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Cancel a bulk enquiry' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: BulkEnquiryResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: BulkEnquiryResponseDto;
  }> {
    const data = await this.bulkService.cancelEnquiry(user.id, id);
    return {
      success: true,
      message: 'Bulk enquiry cancelled successfully',
      data,
    };
  }
}
