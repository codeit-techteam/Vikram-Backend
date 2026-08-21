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
import { HubDispatchService } from './hub-dispatch.service';
import {
  HubDispatchCreateDto,
  HubDispatchLiveQueryDto,
  HubDispatchQueryDto,
  HubDispatchUpdateDto,
  HubOrderActionDto,
  HubVerifyDeliveryOtpDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.DISPATCH)
@Controller({ version: '1', path: 'hub/dispatch' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubDispatchController {
  constructor(private readonly dispatchService: HubDispatchService) {}

  @Get()
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'List dispatches at hub' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubDispatchQueryDto,
  ) {
    const data = await this.dispatchService.findAll(user.hubId, query);
    return { success: true, message: 'Dispatches fetched', data };
  }

  @Get('live')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Live dispatch queue for Dispatch Planning' })
  async live(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubDispatchLiveQueryDto,
  ) {
    const data = await this.dispatchService.getLiveQueue(user.hubId, query);
    return { success: true, message: 'Live dispatch queue fetched', data };
  }

  @Get('slots')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Available delivery slots for planning' })
  async slots(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.dispatchService.getDeliverySlots(user.hubId);
    return { success: true, message: 'Delivery slots fetched', data };
  }

  @Get('fleet-stats')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Fleet counters for Dispatch Planning' })
  async fleetStats(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.dispatchService.getFleetStats(user.hubId);
    return { success: true, message: 'Fleet stats fetched', data };
  }

  @Get(':id')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Get dispatch by id / dispatchNo / trackingNo' })
  async getOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.dispatchService.getById(user.hubId, id);
    return { success: true, message: 'Dispatch fetched', data };
  }

  @Post()
  @HubPermission('dispatch')
  @ApiOperation({
    summary:
      'Plan & create dispatch (assign vehicle, driver, slot → OUT_FOR_DELIVERY)',
  })
  async planAndDispatch(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubDispatchCreateDto,
  ) {
    const data = await this.dispatchService.planAndDispatch(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Dispatch created', data };
  }

  @Post('create')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Create dispatch for an order (legacy alias)' })
  async create(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubDispatchCreateDto,
  ) {
    const data = await this.dispatchService.create(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Dispatch created', data };
  }

  @Patch(':id')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Update dispatch assignment' })
  async update(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubDispatchUpdateDto,
  ) {
    const data = await this.dispatchService.update(user.hubId, id, dto);
    return { success: true, message: 'Dispatch updated', data };
  }

  @Patch(':id/start')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Start dispatch / mark out for delivery' })
  async start(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.dispatchService.start(
      user.hubId,
      id,
      user.fullName,
      dto,
    );
    return { success: true, message: 'Dispatch started', data };
  }

  @Patch(':id/reached')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Mark driver reached customer' })
  async reached(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.dispatchService.markReached(
      user.hubId,
      id,
      user.fullName,
      dto,
    );
    return { success: true, message: 'Driver marked reached', data };
  }

  @Patch(':id/otp')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Verify delivery OTP and complete' })
  async otp(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubVerifyDeliveryOtpDto,
  ) {
    const data = await this.dispatchService.verifyOtp(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: 'OTP verified', data };
  }

  @Patch(':id/delivered')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Mark dispatch delivered (requires OTP verified)' })
  async delivered(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.dispatchService.markDelivered(
      user.hubId,
      id,
      user.fullName,
      dto,
    );
    return { success: true, message: 'Dispatch delivered', data };
  }

  @Patch(':id/completed')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Complete dispatch' })
  async completed(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.dispatchService.complete(
      user.hubId,
      id,
      user.fullName,
      dto,
    );
    return { success: true, message: 'Dispatch completed', data };
  }

  @Patch(':id/complete')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Complete dispatch (legacy alias)' })
  async complete(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.dispatchService.complete(
      user.hubId,
      id,
      user.fullName,
    );
    return { success: true, message: 'Dispatch completed', data };
  }
}
