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
import { HubSearchService } from './hub-search.service';
import { HubSearchQueryDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_SEARCH)
@Controller({ version: '1', path: 'hub/search' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubSearchController {
  constructor(private readonly searchService: HubSearchService) {}

  @Get()
  @HubPermission('search')
  @ApiOperation({
    summary:
      'Search hub orders, products/SKU, drivers, vehicles/trucks, dispatches, requisitions (type=all for header search)',
  })
  async search(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubSearchQueryDto,
  ) {
    const data = await this.searchService.search(user.hubId, query);
    return { success: true, message: 'Search results fetched', data };
  }
}
