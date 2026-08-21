import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminSearchService } from './admin-search.service';

@ApiTags('Admin Search')
@Controller({ version: '1', path: 'admin/search' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles(...ROLE_GROUPS.ALL)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminSearchController {
  constructor(private readonly searchService: AdminSearchService) {}

  @Get()
  @ApiOperation({
    summary:
      'Global admin search across customers, products, orders, memberships, bulk',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search query (min 2 chars)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Results per entity type (default: 10)',
  })
  async search(@Query('q') q: string, @Query('limit') limit?: number) {
    const data = await this.searchService.globalSearch(
      q,
      limit ? Number(limit) : 10,
    );
    return { success: true, message: 'Search results', data };
  }
}
