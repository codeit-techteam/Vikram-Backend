import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { RequisitionsService } from '../../modules/requisitions/requisitions.service';

/** Alias: GET /hub/materials → requisition materials search */
@ApiTags('Hub Materials')
@Controller({ version: '1', path: 'hub/materials' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubMaterialsController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  @Get()
  @HubPermission('inventory')
  @ApiOperation({
    summary: 'List/search materials for requisitions (alias of materials/search)',
  })
  async list(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query('search') search?: string,
  ) {
    const data = await this.requisitionsService.searchMaterials(
      user.hubId,
      search,
    );
    return { success: true, message: 'Materials fetched', data };
  }
}
