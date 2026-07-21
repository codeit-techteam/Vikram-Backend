import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminProductsService } from './admin-products.service';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto, ProductQueryDto } from './dto/admin-products.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Products')
@Controller({ version: '1', path: 'admin/products' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminProductsController {
  constructor(
    private readonly productsService: AdminProductsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List products with filters and pagination' })
  async findAll(@Query() query: ProductQueryDto) {
    const data = await this.productsService.findAll(query);
    return { success: true, message: 'Products fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get product by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.productsService.findOne(id);
    return { success: true, message: 'Product fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create a product' })
  async create(@Body() dto: CreateProductDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.productsService.create(dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREATE', resource: 'Product', resourceId: data.id, newValue: dto });
    return { success: true, message: 'Product created', data };
  }

  @Post('bulk-upload')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Bulk upload products' })
  async bulkUpload(@Body() products: CreateProductDto[], @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.productsService.bulkUpload(products);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREATE', resource: 'Product', newValue: { count: products.length } });
    return { success: true, message: 'Bulk upload complete', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update product' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.productsService.update(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'Product', resourceId: id, newValue: dto });
    return { success: true, message: 'Product updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Soft delete product' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.productsService.remove(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DELETE', resource: 'Product', resourceId: id });
    return { success: true, message: 'Product deleted', data };
  }

  @Patch(':id/stock')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Update product stock status' })
  async updateStock(@Param('id') id: string, @Body('status') status: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.productsService.updateStock(id, status);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'ProductStock', resourceId: id, newValue: { status } });
    return { success: true, message: 'Stock status updated', data };
  }

  @Patch(':id/membership-price')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update product membership price' })
  async updateMembershipPrice(@Param('id') id: string, @Body('price') price: number) {
    const data = await this.productsService.updateMembershipPrice(id, price);
    return { success: true, message: 'Membership price updated', data };
  }

  @Patch(':id/bulk-price')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update product bulk price and threshold' })
  async updateBulkPrice(@Param('id') id: string, @Body('price') price: number, @Body('threshold') threshold?: number) {
    const data = await this.productsService.updateBulkPrice(id, price, threshold);
    return { success: true, message: 'Bulk price updated', data };
  }

  @Patch(':id/inventory')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Update hub inventory for product' })
  async updateInventory(@Param('id') id: string, @Body() dto: UpdateInventoryDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.productsService.updateInventory(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'HubInventory', resourceId: id, newValue: dto });
    return { success: true, message: 'Inventory updated', data };
  }
}
