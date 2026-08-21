import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AuditService } from './audit.service';

@ApiTags('Admin Audit Logs')
@Controller({ version: '1', path: 'admin/audit-logs' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get admin audit logs (SUPER_ADMIN only)' })
  @ApiQuery({ name: 'adminUserId', required: false })
  @ApiQuery({ name: 'resource', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('adminUserId') adminUserId?: string,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.auditService.findAll({
      adminUserId,
      resource,
      action,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    return { success: true, message: 'Audit logs fetched', data };
  }
}
