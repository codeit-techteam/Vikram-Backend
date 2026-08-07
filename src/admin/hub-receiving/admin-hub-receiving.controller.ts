import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { RequisitionsService } from '../../modules/requisitions/requisitions.service';

@ApiTags('Admin Hub Receiving')
@Controller({ version: '1', path: 'admin/hub-receiving' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminHubReceivingController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'List hub receiving queue (in-transit + received with proof)',
  })
  async list(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.requisitionsService.listHubReceiving({
      search,
      status,
    });
    return { success: true, message: 'Hub receiving fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Hub receiving detail (read-only proof viewer)' })
  async getOne(@Param('id') id: string) {
    const data = await this.requisitionsService.getHubReceivingDetail(id);
    return { success: true, message: 'Hub receiving detail fetched', data };
  }
}
