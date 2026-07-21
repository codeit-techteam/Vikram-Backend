import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubDashboardService } from './hub-dashboard.service';

@ApiTags(SWAGGER_TAGS.HUB_DASHBOARD)
@Controller({ version: '1', path: 'hub/dashboard' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubDashboardController {
  constructor(private readonly dashboardService: HubDashboardService) {}

  @Get()
  @HubPermission('dashboard')
  @ApiOperation({ summary: 'Get hub dashboard KPIs' })
  async getDashboard(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.dashboardService.getDashboard(user.hubId);
    return { success: true, message: 'Hub dashboard fetched', data };
  }
}
