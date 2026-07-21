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
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubOrdersService } from './hub-orders.service';
import {
  HubAssignDriverDto,
  HubAssignLoaderDto,
  HubAssignTeamDto,
  HubAssignVehicleDto,
  HubCancelOrderDto,
  HubOrderActionDto,
  HubOrderQueryDto,
  HubPodDto,
  HubRejectOrderDto,
  HubTimelineEntryDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_ORDERS)
@Controller({ version: '1', path: 'hub/orders' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubOrdersController {
  constructor(private readonly ordersService: HubOrdersService) {}

  @Get()
  @HubPermission('orders')
  @ApiOperation({ summary: 'List hub orders with filters' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubOrderQueryDto,
  ) {
    const data = await this.ordersService.findAll(user.hubId, query);
    return { success: true, message: 'Hub orders fetched', data };
  }

  @Get(':id/timeline')
  @HubPermission('timeline')
  @ApiOperation({ summary: 'Get order timeline' })
  async timeline(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.ordersService.getTimeline(user.hubId, id);
    return { success: true, message: 'Order timeline fetched', data };
  }

  @Get(':id')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Get hub order details' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.ordersService.findOne(user.hubId, id);
    return { success: true, message: 'Hub order fetched', data };
  }

  @Post(':id/timeline')
  @HubPermission('timeline')
  @ApiOperation({ summary: 'Add order timeline entry' })
  async addTimeline(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubTimelineEntryDto,
  ) {
    const data = await this.ordersService.addTimeline(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Timeline entry added', data };
  }

  @Patch(':id/accept')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Accept order at hub' })
  async accept(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.accept(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order accepted', data };
  }

  @Patch(':id/reject')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Reject order at hub' })
  async reject(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubRejectOrderDto,
  ) {
    const data = await this.ordersService.reject(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order rejected', data };
  }

  @Patch(':id/ready')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark order ready for dispatch' })
  async ready(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.markReady(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order marked ready', data };
  }

  @Patch(':id/loading')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark order as loading' })
  async loading(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.markLoading(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order loading started', data };
  }

  @Patch(':id/dispatch')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Dispatch order' })
  async dispatch(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.dispatch(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order dispatched', data };
  }

  @Patch(':id/deliver')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark order delivered' })
  async deliver(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.deliver(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order delivered', data };
  }

  @Patch(':id/cancel')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Cancel order at hub' })
  async cancel(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubCancelOrderDto,
  ) {
    const data = await this.ordersService.cancel(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order cancelled', data };
  }

  @Patch(':id/assign-driver')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign driver to order' })
  async assignDriver(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignDriverDto,
  ) {
    const data = await this.ordersService.assignDriver(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Driver assigned', data };
  }

  @Patch(':id/assign-vehicle')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign vehicle to order' })
  async assignVehicle(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignVehicleDto,
  ) {
    const data = await this.ordersService.assignVehicle(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Vehicle assigned', data };
  }

  @Patch(':id/assign-loader')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign loader to order' })
  async assignLoader(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignLoaderDto,
  ) {
    const data = await this.ordersService.assignLoader(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Loader assigned', data };
  }

  @Patch(':id/assign-team')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign driver, vehicle and loader team' })
  async assignTeam(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignTeamDto,
  ) {
    const data = await this.ordersService.assignTeam(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Team assigned', data };
  }

  @Post(':id/pod')
  @HubPermission('pod')
  @ApiOperation({ summary: 'Submit proof of delivery' })
  async pod(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubPodDto,
  ) {
    const data = await this.ordersService.submitPod(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Proof of delivery submitted', data };
  }
}
