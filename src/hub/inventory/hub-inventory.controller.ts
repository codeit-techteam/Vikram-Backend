import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { HubInventoryService } from './hub-inventory.service';
import {
  HubInventoryAdjustDto,
  HubInventoryQueryDto,
  HubInventoryReceiveDto,
  HubInventoryTransferDto,
  HubInventoryUpdateDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.INVENTORY)
@Controller({ version: '1', path: 'hub/inventory' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubInventoryController {
  constructor(private readonly inventoryService: HubInventoryService) {}

  @Get()
  @HubPermission('inventory')
  @ApiOperation({ summary: 'List hub inventory with stock levels' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubInventoryQueryDto,
  ) {
    const data = await this.inventoryService.findAll(user.hubId, query);
    return { success: true, message: 'Hub inventory fetched', data };
  }

  @Get(':id')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.inventoryService.findOne(user.hubId, id);
    return { success: true, message: 'Inventory item fetched', data };
  }

  @Patch(':id')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Update hub inventory thresholds or stock' })
  async update(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubInventoryUpdateDto,
  ) {
    const data = await this.inventoryService.update(user.hubId, id, dto);
    return { success: true, message: 'Inventory updated', data };
  }

  @Post('receive')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Receive stock into hub inventory' })
  async receive(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubInventoryReceiveDto,
  ) {
    const data = await this.inventoryService.receive(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Stock received', data };
  }

  @Post('adjust')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Adjust hub inventory quantity' })
  async adjust(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubInventoryAdjustDto,
  ) {
    const data = await this.inventoryService.adjust(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Inventory adjusted', data };
  }

  @Post('transfer')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Transfer inventory between hubs' })
  async transfer(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubInventoryTransferDto,
  ) {
    const data = await this.inventoryService.transfer(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Inventory transfer completed', data };
  }
}
