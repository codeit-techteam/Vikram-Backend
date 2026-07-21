import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubBulkService } from './hub-bulk.service';
import { HubBulkQueryDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_BULK)
@Controller({ version: '1', path: 'hub/bulk-orders' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubBulkController {
  constructor(private readonly bulkService: HubBulkService) {}

  @Get()
  @HubPermission('orders')
  @ApiOperation({ summary: 'List bulk procurement orders at hub' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubBulkQueryDto,
  ) {
    const data = await this.bulkService.findAll(user.hubId, query);
    return { success: true, message: 'Bulk orders fetched', data };
  }

  @Get(':id')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Get bulk order details' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.bulkService.findOne(user.hubId, id);
    return { success: true, message: 'Bulk order fetched', data };
  }

  @Patch(':id/accept')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Accept bulk order' })
  async accept(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.bulkService.accept(user.hubId, id, user.fullName);
    return { success: true, message: 'Bulk order accepted', data };
  }

  @Patch(':id/complete')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Complete bulk order' })
  async complete(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.bulkService.complete(user.hubId, id, user.fullName);
    return { success: true, message: 'Bulk order completed', data };
  }
}
