import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('Admin Dashboard')
@Controller({ version: '1', path: 'admin/dashboard' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get admin dashboard summary stats' })
  @ApiResponse({ status: 200, description: 'Dashboard stats fetched' })
  async getDashboard() {
    const data = await this.dashboardService.getDashboard();
    return { success: true, message: 'Dashboard fetched successfully', data };
  }
}
