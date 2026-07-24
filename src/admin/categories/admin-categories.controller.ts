import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminCategoriesService } from './admin-categories.service';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoriesDto } from './dto/admin-categories.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Categories')
@Controller({ version: '1', path: 'admin/categories' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: AdminCategoriesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List all categories' })
  async findAll() {
    const data = await this.categoriesService.findAll();
    return { success: true, message: 'Categories fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get category by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.categoriesService.findOne(id);
    return { success: true, message: 'Category fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create category' })
  async create(@Body() dto: CreateCategoryDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.categoriesService.create(dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREATE', resource: 'Category', resourceId: data.id, newValue: dto });
    return { success: true, message: 'Category created', data };
  }

  @Patch('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder categories' })
  async reorder(@Body() dto: ReorderCategoriesDto) {
    const data = await this.categoriesService.reorder(dto);
    return { success: true, message: 'Categories reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update category' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.categoriesService.update(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'Category', resourceId: id, newValue: dto });
    return { success: true, message: 'Category updated', data };
  }

  @Patch(':id/toggle')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Toggle category active/inactive' })
  async toggle(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.categoriesService.toggleActive(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'Category', resourceId: id });
    return { success: true, message: 'Category status toggled', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete category (soft)' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.categoriesService.remove(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DELETE', resource: 'Category', resourceId: id });
    return { success: true, message: 'Category deleted', data };
  }
}
