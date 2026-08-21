import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { HubReportsService } from './hub-reports.service';
import { HubReportsQueryDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_REPORTS)
@Controller({ version: '1', path: 'hub/reports' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubReportsController {
  constructor(private readonly reportsService: HubReportsService) {}

  @Get()
  @HubPermission('reports')
  @ApiOperation({ summary: 'Get hub operational reports' })
  async getReports(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubReportsQueryDto,
  ) {
    const data = await this.reportsService.getReports(user.hubId, query);
    return { success: true, message: 'Hub reports fetched', data };
  }
}
