import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubEmergencyService } from './hub-emergency.service';
import { HubEmergencyPriorityDto, HubEmergencyQueryDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_EMERGENCY)
@Controller({ version: '1', path: 'hub/emergency-orders' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubEmergencyController {
  constructor(private readonly emergencyService: HubEmergencyService) {}

  @Get()
  @HubPermission('orders')
  @ApiOperation({ summary: 'List emergency orders (priority sorted)' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubEmergencyQueryDto,
  ) {
    const data = await this.emergencyService.findAll(user.hubId, query);
    return { success: true, message: 'Emergency orders fetched', data };
  }

  @Patch(':id/accept')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Accept emergency order' })
  async accept(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.emergencyService.accept(user.hubId, id, user.fullName);
    return { success: true, message: 'Emergency order accepted', data };
  }

  @Patch(':id/priority')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Update emergency order priority' })
  async priority(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubEmergencyPriorityDto,
  ) {
    const data = await this.emergencyService.setPriority(user.hubId, id, dto);
    return { success: true, message: 'Emergency priority updated', data };
  }

  @Patch(':id/complete')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Complete emergency order' })
  async complete(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.emergencyService.complete(user.hubId, id, user.fullName);
    return { success: true, message: 'Emergency order completed', data };
  }
}
