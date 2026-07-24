import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { CustomerSitesService } from './customer-sites.service';
import {
  CreateSiteDto,
  SiteResponseDto,
  UpdateSiteDto,
} from './dto/site.dto';

@ApiTags(SWAGGER_TAGS.CUSTOMER)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'customer' })
export class CustomerSitesController {
  constructor(private readonly sitesService: CustomerSitesService) {}

  @Get('sites')
  @ApiOperation({ summary: 'List saved delivery sites' })
  @ApiResponse({ status: 200, type: [SiteResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: SiteResponseDto[] }> {
    const data = await this.sitesService.list(user.id);
    return { success: true, message: 'Sites fetched successfully', data };
  }

  @Get('current-site')
  @ApiOperation({ summary: 'Get primary delivery site' })
  @ApiResponse({ status: 200, type: SiteResponseDto })
  async current(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{
    success: boolean;
    message: string;
    data: SiteResponseDto | null;
  }> {
    const data = await this.sitesService.getCurrent(user.id);
    return {
      success: true,
      message: data ? 'Primary site fetched' : 'No primary site set',
      data,
    };
  }

  @Post('sites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a saved delivery site' })
  @ApiResponse({ status: 201, type: SiteResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateSiteDto,
  ): Promise<{ success: boolean; message: string; data: SiteResponseDto }> {
    const data = await this.sitesService.create(user.id, dto);
    return { success: true, message: 'Site saved successfully', data };
  }

  @Put('sites/:id')
  @ApiOperation({ summary: 'Update a delivery site' })
  @ApiParam({ name: 'id', description: 'Site UUID' })
  @ApiResponse({ status: 200, type: SiteResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteDto,
  ): Promise<{ success: boolean; message: string; data: SiteResponseDto }> {
    const data = await this.sitesService.update(user.id, id, dto);
    return { success: true, message: 'Site updated successfully', data };
  }

  @Delete('sites/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a delivery site' })
  @ApiParam({ name: 'id', description: 'Site UUID' })
  async remove(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string; data: null }> {
    await this.sitesService.remove(user.id, id);
    return { success: true, message: 'Site deleted successfully', data: null };
  }

  @Patch('sites/:id/primary')
  @ApiOperation({ summary: 'Set delivery site as primary' })
  @ApiParam({ name: 'id', description: 'Site UUID' })
  @ApiResponse({ status: 200, type: SiteResponseDto })
  async setPrimary(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string; data: SiteResponseDto }> {
    const data = await this.sitesService.setPrimary(user.id, id);
    return {
      success: true,
      message: 'Primary site updated successfully',
      data,
    };
  }
}
