import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { ApiAdminRoles } from '../decorators/api-admin-roles.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminFinanceService } from './admin-finance.service';
import {
  CreateRefundDto,
  DailyClosingResponseDto,
  FinanceDashboardCardsDto,
  FinanceDateRangeDto,
  GenerateHubSettlementDto,
  GenerateVendorSettlementDto,
  HubSettlementQueryDto,
  RefundLedgerQueryDto,
  RejectRefundDto,
  RejectSettlementDto,
  VendorSettlementQueryDto,
} from './dto/admin-finance.dto';

@ApiTags('Admin Finance')
@Controller({ version: '1', path: 'admin/finance' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminFinanceController {
  constructor(
    private readonly financeService: AdminFinanceService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Finance dashboard cards',
    description:
      "Returns today's collection, membership revenue, pending refunds, and pending hub/vendor settlements.",
  })
  @ApiResponse({ status: 200, type: FinanceDashboardCardsDto })
  async dashboard() {
    const data = await this.financeService.getDashboardCards();
    return { success: true, message: 'Finance dashboard fetched', data };
  }

  @Get('daily-closing')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Daily closing report',
    description:
      "Today's revenue, refunds, orders, and pending settlement summary. Optional date range via fromDate/toDate.",
  })
  @ApiResponse({ status: 200, type: DailyClosingResponseDto })
  async dailyClosing(@Query() query: FinanceDateRangeDto) {
    const data = await this.financeService.getDailyClosing(query);
    return { success: true, message: 'Daily closing report fetched', data };
  }

  @Get('refunds')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Refund ledger',
    description:
      'List refund transactions with pending/approved/rejected summary totals.',
  })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async listRefunds(@Query() query: RefundLedgerQueryDto) {
    const data = await this.financeService.listRefunds(query);
    return { success: true, message: 'Refund ledger fetched', data };
  }

  @Post('refund')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Create refund request',
    description:
      'Creates a pending refund entry for a customer (and optionally an order).',
  })
  @ApiResponse({ status: 201, type: ApiResponseDto })
  @ApiResponse({ status: 404, description: 'Customer or order not found' })
  @ApiResponse({ status: 400, description: 'Duplicate refund for order' })
  async createRefund(
    @Body() dto: CreateRefundDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.createRefund(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Refund',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Refund request created', data };
  }

  @Post('refund/:id/approve')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Approve refund',
    description:
      'Approves refund and marks linked order payment as REFUNDED when applicable.',
  })
  @ApiParam({ name: 'id', description: 'Refund UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  @ApiResponse({ status: 404, description: 'Refund not found' })
  @ApiResponse({ status: 400, description: 'Refund not pending' })
  async approveRefund(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.approveRefund(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'APPROVE',
      resource: 'Refund',
      resourceId: id,
    });
    return { success: true, message: 'Refund approved', data };
  }

  @Post('refund/:id/reject')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reject refund' })
  @ApiParam({ name: 'id', description: 'Refund UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async rejectRefund(
    @Param('id') id: string,
    @Body() dto: RejectRefundDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.rejectRefund(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'REJECT',
      resource: 'Refund',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Refund rejected', data };
  }

  @Get('hub-settlements')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Hub settlement summary',
    description:
      'Paginated hub settlement batches with status-wise summary totals.',
  })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async listHubSettlements(@Query() query: HubSettlementQueryDto) {
    const data = await this.financeService.listHubSettlements(query);
    return { success: true, message: 'Hub settlements fetched', data };
  }

  @Post('hub-settlements/generate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Generate hub settlement',
    description:
      'Creates a pending settlement batch from unsettled delivered orders for a hub and period.',
  })
  @ApiResponse({ status: 201, type: ApiResponseDto })
  @ApiResponse({ status: 400, description: 'No eligible orders' })
  async generateHubSettlement(
    @Body() dto: GenerateHubSettlementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.generateHubSettlement(dto, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'HubSettlement',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Hub settlement generated', data };
  }

  @Get('hub-settlements/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Hub settlement details',
    description: 'Settlement batch with linked delivered orders.',
  })
  @ApiParam({ name: 'id', description: 'Settlement batch UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  @ApiResponse({ status: 404, description: 'Settlement not found' })
  async getHubSettlementDetails(@Param('id') id: string) {
    const data = await this.financeService.getHubSettlementDetails(id);
    return { success: true, message: 'Hub settlement details fetched', data };
  }

  @Post('hub-settlements/:id/approve')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Approve hub settlement' })
  @ApiParam({ name: 'id', description: 'Settlement batch UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async approveHubSettlement(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.approveHubSettlement(id, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'APPROVE',
      resource: 'HubSettlement',
      resourceId: id,
    });
    return { success: true, message: 'Hub settlement approved', data };
  }

  @Post('hub-settlements/:id/reject')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reject hub settlement' })
  @ApiParam({ name: 'id', description: 'Settlement batch UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async rejectHubSettlement(
    @Param('id') id: string,
    @Body() dto: RejectSettlementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.rejectHubSettlement(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'REJECT',
      resource: 'HubSettlement',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Hub settlement rejected', data };
  }

  @Get('vendor-settlements')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Vendor settlement history',
    description:
      'Paginated vendor settlement batches grouped by product brand.',
  })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async listVendorSettlements(@Query() query: VendorSettlementQueryDto) {
    const data = await this.financeService.listVendorSettlements(query);
    return { success: true, message: 'Vendor settlements fetched', data };
  }

  @Post('vendor-settlements/generate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Generate vendor settlement',
    description:
      'Creates a pending settlement batch from delivered order items for a product brand.',
  })
  @ApiResponse({ status: 201, type: ApiResponseDto })
  async generateVendorSettlement(
    @Body() dto: GenerateVendorSettlementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.generateVendorSettlement(
      dto,
      admin.id,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'VendorSettlement',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Vendor settlement generated', data };
  }

  @Get('vendor-settlements/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Vendor settlement details' })
  @ApiParam({ name: 'id', description: 'Settlement batch UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async getVendorSettlementDetails(@Param('id') id: string) {
    const data = await this.financeService.getVendorSettlementDetails(id);
    return {
      success: true,
      message: 'Vendor settlement details fetched',
      data,
    };
  }

  @Post('vendor-settlements/:id/approve')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Approve vendor settlement' })
  @ApiParam({ name: 'id', description: 'Settlement batch UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async approveVendorSettlement(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.approveVendorSettlement(
      id,
      admin.id,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'APPROVE',
      resource: 'VendorSettlement',
      resourceId: id,
    });
    return { success: true, message: 'Vendor settlement approved', data };
  }

  @Post('vendor-settlements/:id/reject')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reject vendor settlement' })
  @ApiParam({ name: 'id', description: 'Settlement batch UUID' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  async rejectVendorSettlement(
    @Param('id') id: string,
    @Body() dto: RejectSettlementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.financeService.rejectVendorSettlement(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'REJECT',
      resource: 'VendorSettlement',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Vendor settlement rejected', data };
  }
}
