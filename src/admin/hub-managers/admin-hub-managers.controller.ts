import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminHubManagersService } from './admin-hub-managers.service';
import {
  CreateHubManagerDto,
  HubManagerQueryDto,
  ResetHubManagerPasswordDto,
  TransferHubManagerDto,
  UpdateHubManagerDto,
} from './dto/admin-hub-managers.dto';

@ApiTags('Admin Hub Managers')
@Controller({ version: '1', path: 'admin/hub-managers' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminHubManagersController {
  constructor(private readonly hubManagersService: AdminHubManagersService) {}

  @Get()
  @ApiOperation({ summary: 'List hub managers' })
  async findAll(@Query() query: HubManagerQueryDto) {
    const data = await this.hubManagersService.findAll(query);
    return { success: true, message: 'Hub managers fetched', data };
  }

  @Get('hubs')
  @ApiOperation({ summary: 'List hubs available for manager assignment' })
  async listHubs() {
    const data = await this.hubManagersService.listHubs();
    return { success: true, message: 'Hubs fetched', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hub manager by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.hubManagersService.findOne(id);
    return { success: true, message: 'Hub manager fetched', data };
  }

  @Post()
  @ApiOperation({ summary: 'Create hub manager with login credentials' })
  async create(
    @Body() dto: CreateHubManagerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubManagersService.create(dto, admin.id, admin.email);
    return { success: true, message: 'Hub manager created', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update hub manager profile' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHubManagerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubManagersService.update(id, dto, admin.id, admin.email);
    return { success: true, message: 'Hub manager updated', data };
  }

  @Patch(':id/transfer-hub')
  @ApiOperation({ summary: 'Transfer hub manager to another hub' })
  async transferHub(
    @Param('id') id: string,
    @Body() dto: TransferHubManagerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubManagersService.transferHub(id, dto, admin.id, admin.email);
    return { success: true, message: 'Hub manager transferred', data };
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate hub manager login' })
  async deactivate(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.hubManagersService.deactivate(id, admin.id, admin.email);
    return { success: true, message: 'Hub manager deactivated', data };
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate hub manager login' })
  async reactivate(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.hubManagersService.reactivate(id, admin.id, admin.email);
    return { success: true, message: 'Hub manager reactivated', data };
  }

  @Patch(':id/reset-password')
  @ApiOperation({ summary: 'Reset hub manager password' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetHubManagerPasswordDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubManagersService.resetPassword(id, dto, admin.id, admin.email);
    return { success: true, message: 'Password reset successfully', data };
  }
}
