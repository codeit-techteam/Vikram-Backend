import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { HubDispatchService } from '../dispatch/hub-dispatch.service';

@ApiTags(SWAGGER_TAGS.DISPATCH)
@Controller({ version: '1', path: 'hub/fleet' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubFleetController {
  constructor(private readonly dispatchService: HubDispatchService) {}

  @Get('available')
  @HubPermission('vehicles')
  @ApiOperation({ summary: 'Available vehicles for dispatch planning' })
  async available(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.dispatchService.getAvailableFleet(user.hubId);
    return { success: true, message: 'Available fleet fetched', data };
  }

  @Get('stats')
  @HubPermission('vehicles')
  @ApiOperation({ summary: 'Live fleet dashboard counters' })
  async stats(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.dispatchService.getFleetStats(user.hubId);
    return { success: true, message: 'Fleet stats fetched', data };
  }
}
