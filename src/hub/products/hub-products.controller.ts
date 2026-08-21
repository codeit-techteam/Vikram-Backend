import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubProductsService } from './hub-products.service';
import {
  HubProductEtaDto,
  HubProductsQueryDto,
  HubProductStockDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.PRODUCTS)
@Controller({ version: '1', path: 'hub/products' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubProductsController {
  constructor(private readonly productsService: HubProductsService) {}

  @Get()
  @HubPermission('products')
  @ApiOperation({ summary: 'List products with hub availability' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubProductsQueryDto,
  ) {
    const data = await this.productsService.findAll(user.hubId, query);
    return { success: true, message: 'Hub products fetched', data };
  }

  @Get(':id')
  @HubPermission('products')
  @ApiOperation({ summary: 'Get product availability at hub' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.productsService.findOne(user.hubId, id);
    return { success: true, message: 'Hub product fetched', data };
  }

  @Patch(':id/stock')
  @HubPermission('products')
  @ApiOperation({ summary: 'Update product stock at hub' })
  async updateStock(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubProductStockDto,
  ) {
    const data = await this.productsService.updateStock(user.hubId, id, dto);
    return { success: true, message: 'Product stock updated', data };
  }

  @Patch(':id/eta')
  @HubPermission('products')
  @ApiOperation({ summary: 'Update product delivery ETA' })
  async updateEta(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubProductEtaDto,
  ) {
    const data = await this.productsService.updateEta(user.hubId, id, dto);
    return { success: true, message: 'Product ETA updated', data };
  }
}
