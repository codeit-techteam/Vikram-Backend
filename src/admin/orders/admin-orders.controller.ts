import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminOrdersService } from './admin-orders.service';
import {
  AdminOrderQueryDto,
  UpdateOrderStatusDto,
  AssignHubDto,
  AssignDriverDto,
  CancelOrderDto,
  UpdateAdminInternalNoteDto,
} from './dto/admin-orders.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { InvoiceService } from '../../modules/invoice/invoice.service';

@ApiTags('Admin Orders')
@Controller({ version: '1', path: 'admin/orders' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminOrdersController {
  constructor(
    private readonly ordersService: AdminOrdersService,
    private readonly auditService: AuditService,
    private readonly invoiceService: InvoiceService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List all orders with filters and pagination' })
  async findAll(@Query() query: AdminOrderQueryDto) {
    const data = await this.ordersService.findAll(query);
    return { success: true, message: 'Orders fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get order details with timeline and invoice' })
  async findOne(@Param('id') id: string) {
    const data = await this.ordersService.findOne(id);
    return { success: true, message: 'Order fetched', data };
  }

  @Get(':id/timeline')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get order timeline' })
  async timeline(@Param('id') id: string) {
    const data = await this.ordersService.getTimeline(id);
    return { success: true, message: 'Order timeline fetched', data };
  }

  @Get(':id/tracking')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get order tracking summary for admin' })
  async tracking(@Param('id') id: string) {
    const data = await this.ordersService.getTracking(id);
    return { success: true, message: 'Order tracking fetched', data };
  }

  @Get(':id/invoice')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get order invoice JSON (same invoice as customer/hub)' })
  async getInvoice(@Param('id') id: string) {
    const data = await this.invoiceService.getInvoiceByOrderId(id);
    return { success: true, message: 'Invoice fetched', data };
  }

  @Get(':id/invoice/pdf')
  @SkipResponseWrap()
  @Header('Content-Type', 'application/pdf')
  @ApiProduces('application/pdf')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Download order invoice PDF (single source)' })
  async getInvoicePdf(@Param('id') id: string): Promise<StreamableFile> {
    const { buffer, filename } = await this.invoiceService.getInvoicePdfByOrderId(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ordersService.updateStatus(id, dto, admin.email);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Order',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Order status updated', data };
  }

  @Patch(':id/assign-hub')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Assign hub to order' })
  async assignHub(
    @Param('id') id: string,
    @Body() dto: AssignHubDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ordersService.assignHub(id, dto.hubId, admin.email);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'ASSIGN',
      resource: 'Order',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Hub assigned to order', data };
  }

  @Patch(':id/assign-driver')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Assign driver to order' })
  async assignDriver(
    @Param('id') id: string,
    @Body() dto: AssignDriverDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ordersService.assignDriver(id, dto, admin.email);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'ASSIGN',
      resource: 'Order',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Driver assigned', data };
  }

  @Patch(':id/cancel')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Cancel order' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ordersService.cancelOrder(id, dto, admin.email);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CANCEL',
      resource: 'Order',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Order cancelled', data };
  }

  @Patch(':id/internal-note')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Update admin internal note (never overwrites customer remarks)' })
  async updateInternalNote(
    @Param('id') id: string,
    @Body() dto: UpdateAdminInternalNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ordersService.updateInternalNote(id, dto.note ?? null);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Order',
      resourceId: id,
      newValue: { adminInternalNote: dto.note ?? null },
    });
    return { success: true, message: 'Internal note saved', data };
  }
}
