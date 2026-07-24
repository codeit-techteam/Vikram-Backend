import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AdminHubsService } from './admin-hubs.service';
import {
  AdminHubOrdersQueryDto,
  AdminHubQueryDto,
  AddHubDriversDto,
  AddHubInventoryDto,
  AssignHubManagerDto,
  CreateAdminHubDto,
  CreateHubManagerDto,
  ProvisionHubDto,
  UpdateAdminHubDto,
  UpdateHubCoverageDto,
  UpdateHubStatusDto,
} from './dto/admin-hubs.dto';

@ApiTags('Admin Hubs')
@Controller({ version: '1', path: 'admin/hubs' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminHubsController {
  constructor(private readonly hubsService: AdminHubsService) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'List all hubs',
    description:
      'Paginated hub list with search, filters (status, city, state, manager), and sort. SUPER_ADMIN and WAREHOUSE_MANAGER (read-only).',
  })
  @ApiResponse({ status: 200, description: 'Hubs fetched successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — CUSTOMER_EXECUTIVE has no access' })
  async findAll(@Query() query: AdminHubQueryDto) {
    const data = await this.hubsService.findAll(query);
    return { success: true, message: 'Hubs fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Create a hub',
    description: 'SUPER_ADMIN only. Creates a new hub in the network.',
  })
  @ApiResponse({ status: 201, description: 'Hub created successfully' })
  @ApiResponse({ status: 409, description: 'Hub code already exists' })
  async create(
    @Body() dto: CreateAdminHubDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.create(dto, admin.id, admin.email);
    return { success: true, message: 'Hub created', data };
  }

  @Post('provision')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Provision hub with manager, inventory, and coverage',
    description:
      'Atomic create: hub + hub manager credentials + inventory + optional drivers/vehicles. Returns one-time plaintext password.',
  })
  @ApiResponse({ status: 201, description: 'Hub provisioned successfully' })
  @ApiResponse({ status: 409, description: 'Hub code or manager already exists' })
  async provision(
    @Body() dto: ProvisionHubDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.provision(dto, admin.id, admin.email);
    return { success: true, message: 'Hub provisioned', data };
  }

  @Get(':id/inventory')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'Hub inventory summary',
    description: 'Returns total products, stock value, low stock and out-of-stock counts.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async getInventory(@Param('id') id: string) {
    const data = await this.hubsService.getInventorySummary(id);
    return { success: true, message: 'Hub inventory summary fetched', data };
  }

  @Get(':id/orders')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'Hub orders',
    description:
      'List hub orders grouped by lifecycle: PENDING, PROCESSING, DISPATCHED, DELIVERED, CANCELLED.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async getOrders(@Param('id') id: string, @Query() query: AdminHubOrdersQueryDto) {
    const data = await this.hubsService.getOrders(id, query);
    return { success: true, message: 'Hub orders fetched', data };
  }

  @Get(':id/performance')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'Hub performance metrics',
    description:
      "Returns today's orders, monthly orders, revenue, average dispatch time, and fulfillment percentage.",
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async getPerformance(@Param('id') id: string) {
    const data = await this.hubsService.getPerformance(id);
    return { success: true, message: 'Hub performance fetched', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Update hub operational status',
    description: 'Enable, disable, or suspend a hub. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateHubStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.updateStatus(id, dto, admin.id, admin.email);
    return { success: true, message: 'Hub status updated', data };
  }

  @Patch(':id/manager')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Assign warehouse manager to hub',
    description:
      'Assigns a hub manager to this hub. Deactivates any other active manager on the hub. Only one active manager per hub.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async assignManager(
    @Param('id') id: string,
    @Body() dto: AssignHubManagerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.assignManager(id, dto, admin.id, admin.email);
    return { success: true, message: 'Hub manager assigned', data };
  }

  @Post(':id/manager')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Create hub manager with login credentials',
    description:
      'Creates a Hub Manager user, hashes password, and assigns them exclusively to this hub.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async createManager(
    @Param('id') id: string,
    @Body() dto: CreateHubManagerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.createManagerForHub(
      id,
      dto,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Hub manager created', data };
  }

  @Post(':id/inventory')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Add or upsert hub inventory from catalog products' })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async addInventory(
    @Param('id') id: string,
    @Body() dto: AddHubInventoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.addInventory(
      id,
      dto.items,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Hub inventory saved', data };
  }

  @Post(':id/drivers')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Add drivers (and optional vehicles) to a hub' })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async addDrivers(
    @Param('id') id: string,
    @Body() dto: AddHubDriversDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.addDrivers(
      id,
      dto.drivers,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Drivers added', data };
  }

  @Patch(':id/coverage')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update hub coverage radius, coords, and polygon' })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async updateCoverage(
    @Param('id') id: string,
    @Body() dto: UpdateHubCoverageDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.updateCoverage(
      id,
      dto,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Hub coverage updated', data };
  }

  @Put(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Update hub (PUT alias)',
    description: 'Same as PATCH /admin/hubs/:id',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async replace(
    @Param('id') id: string,
    @Body() dto: UpdateAdminHubDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.update(id, dto, admin.id, admin.email);
    return { success: true, message: 'Hub updated', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'Get hub details',
    description:
      'Returns hub info, manager, inventory summary, pending/completed orders, drivers, vehicles, and performance.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async findOne(@Param('id') id: string) {
    const data = await this.hubsService.findOne(id);
    return { success: true, message: 'Hub fetched', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Update hub',
    description: 'Update any editable hub field. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminHubDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.hubsService.update(id, dto, admin.id, admin.email);
    return { success: true, message: 'Hub updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Soft delete hub',
    description: 'Marks hub as deleted. Never hard deletes. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Hub UUID' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.hubsService.remove(id, admin.id, admin.email);
    return { success: true, message: 'Hub deleted', data };
  }
}
