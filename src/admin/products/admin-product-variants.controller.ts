import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AdminProductVariantsService } from './admin-product-variants.service';
import {
  CreateProductVariantDto,
  ReorderProductVariantsDto,
  UpdateProductVariantDto,
  UpdateProductVariantStatusDto,
} from './dto/admin-product-variants.dto';

@ApiTags('Admin Product Variants')
@Controller({ version: '1', path: 'admin/products/:productId/variants' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminProductVariantsController {
  constructor(
    private readonly variantsService: AdminProductVariantsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List variants for a product' })
  async list(@Param('productId', ParseUUIDPipe) productId: string) {
    const data = await this.variantsService.list(productId);
    return { success: true, message: 'Variants fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create a product variant' })
  async create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductVariantDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.variantsService.create(productId, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'ProductVariant',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Variant created', data };
  }

  @Patch('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder product variants' })
  async reorder(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ReorderProductVariantsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.variantsService.reorder(productId, dto.variantIds);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'ProductVariant',
      resourceId: productId,
      newValue: { reorder: dto.variantIds },
    });
    return { success: true, message: 'Variants reordered', data };
  }

  @Patch(':variantId/status')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Enable or disable a product variant' })
  async setStatus(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateProductVariantStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.variantsService.setStatus(
      productId,
      variantId,
      dto.isActive,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'ProductVariant',
      resourceId: variantId,
      newValue: dto,
    });
    return { success: true, message: 'Variant status updated', data };
  }

  @Post(':variantId/duplicate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Duplicate a product variant' })
  async duplicate(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.variantsService.duplicate(productId, variantId);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'ProductVariant',
      resourceId: data.id,
      newValue: { duplicatedFrom: variantId },
    });
    return { success: true, message: 'Variant duplicated', data };
  }

  @Patch(':variantId')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update a product variant' })
  async update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateProductVariantDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.variantsService.update(productId, variantId, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'ProductVariant',
      resourceId: variantId,
      newValue: dto,
    });
    return { success: true, message: 'Variant updated', data };
  }

  @Delete(':variantId')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Soft-delete a product variant' })
  async remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.variantsService.remove(productId, variantId);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'ProductVariant',
      resourceId: variantId,
    });
    return { success: true, message: 'Variant deleted', data };
  }
}
