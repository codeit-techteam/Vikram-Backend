import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AdminAdvertisementsService } from './admin-advertisements.service';
import {
  CreateAdvertisementDto,
  ReorderItemsDto,
  UpdateAdvertisementDto,
} from './dto/admin-advertisements.dto';

@ApiTags('Admin Advertisements')
@Controller({ version: '1', path: 'admin/advertisements' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminAdvertisementsController {
  constructor(
    private readonly adsService: AdminAdvertisementsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List brand advertisements' })
  async findAll() {
    const data = await this.adsService.findAll();
    return { success: true, message: 'Advertisements fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get advertisement by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.adsService.findOne(id);
    return { success: true, message: 'Advertisement fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create brand advertisement' })
  async create(
    @Body() dto: CreateAdvertisementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adsService.create(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Advertisement',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Advertisement created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder advertisements' })
  async reorder(@Body() body: ReorderItemsDto) {
    const data = await this.adsService.reorder(body.items);
    return { success: true, message: 'Advertisements reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update advertisement' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvertisementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adsService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Advertisement',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Advertisement updated', data };
  }

  @Patch(':id/activate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Activate advertisement' })
  async activate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adsService.activate(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'Advertisement',
      resourceId: id,
    });
    return { success: true, message: 'Advertisement activated', data };
  }

  @Patch(':id/deactivate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Deactivate advertisement' })
  async deactivate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adsService.deactivate(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'Advertisement',
      resourceId: id,
    });
    return { success: true, message: 'Advertisement deactivated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete advertisement' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adsService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Advertisement',
      resourceId: id,
    });
    return { success: true, message: 'Advertisement deleted', data };
  }
}
