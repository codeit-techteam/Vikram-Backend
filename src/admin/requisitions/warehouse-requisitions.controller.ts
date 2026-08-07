import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
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
import { RequisitionsService } from '../../modules/requisitions/requisitions.service';
import {
  AllocateRequisitionDto,
  ApproveRequisitionDto,
  DispatchRequisitionDto,
  RejectRequisitionDto,
  RequisitionCommentDto,
  RequisitionPaginationQueryDto,
} from '../../modules/requisitions/dto/requisitions.dto';

/**
 * Warehouse-facing aliases for admin requisition APIs.
 * Path: /warehouse/requisitions/*
 */
@ApiTags('Warehouse Requisitions')
@Controller({ version: '1', path: 'warehouse/requisitions' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class WarehouseRequisitionsController {
  constructor(
    private readonly requisitionsService: RequisitionsService,
    private readonly auditService: AuditService,
  ) {}

  private actor(admin: AuthenticatedAdmin) {
    return {
      id: admin.id,
      name: admin.email,
      role: admin.role,
    };
  }

  @Get('stats')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Warehouse requisition stats' })
  async stats() {
    const data = await this.requisitionsService.getStats();
    return { success: true, message: 'Requisition stats fetched', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List warehouse requisitions' })
  async findAll(@Query() query: RequisitionPaginationQueryDto) {
    const data = await this.requisitionsService.findAll(
      query,
      undefined,
      'admin',
    );
    return { success: true, message: 'Requisitions fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async findOne(@Param('id') id: string) {
    const data = await this.requisitionsService.findOne(id);
    return { success: true, message: 'Requisition fetched', data };
  }

  @Patch(':id/approve')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Approve (supports partial qty per item)' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveRequisitionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.requisitionsService.approve(
      id,
      this.actor(admin),
      dto,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'requisition',
      resourceId: id,
      newValue: { status: 'APPROVED', partial: true },
    });
    return { success: true, message: 'Requisition approved', data };
  }

  @Patch(':id/partial')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Partial approve alias (same as approve with lower qty)' })
  async partial(
    @Param('id') id: string,
    @Body() dto: ApproveRequisitionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.approve(id, dto, admin);
  }

  @Patch(':id/reject')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectRequisitionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.requisitionsService.reject(
      id,
      this.actor(admin),
      dto,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'requisition',
      resourceId: id,
      newValue: { status: 'REJECTED' },
    });
    return { success: true, message: 'Requisition rejected', data };
  }

  @Patch(':id/allocate')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async allocate(
    @Param('id') id: string,
    @Body() dto: AllocateRequisitionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.requisitionsService.allocate(
      id,
      this.actor(admin),
      dto,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'requisition',
      resourceId: id,
      newValue: { status: 'ALLOCATED' },
    });
    return { success: true, message: 'Requisition allocated', data };
  }

  @Post('dispatch')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Create dispatch — body must include requisitionId' })
  async createDispatch(
    @Body() body: DispatchRequisitionDto & { requisitionId: string },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const { requisitionId, ...dto } = body;
    const data = await this.requisitionsService.dispatch(
      requisitionId,
      this.actor(admin),
      dto,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'requisition',
      resourceId: requisitionId,
      newValue: { status: 'IN_TRANSIT' },
    });
    return { success: true, message: 'Dispatch created', data };
  }

  @Patch(':id/dispatch')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async dispatch(
    @Param('id') id: string,
    @Body() dto: DispatchRequisitionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.requisitionsService.dispatch(
      id,
      this.actor(admin),
      dto,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'requisition',
      resourceId: id,
      newValue: { status: 'IN_TRANSIT' },
    });
    return { success: true, message: 'Requisition dispatched', data };
  }

  @Post(':id/comments')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async comment(
    @Param('id') id: string,
    @Body() dto: RequisitionCommentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.requisitionsService.addComment(
      id,
      this.actor(admin),
      dto,
    );
    return { success: true, message: 'Comment added', data };
  }

  @Get(':id/export')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @Header('Content-Type', 'text/csv')
  async export(@Param('id') id: string) {
    const detail = await this.requisitionsService.findOne(id);
    const lines = [
      'SKU,Product,Requested,Approved,Allocated,Received,Unit,Unit Price',
      ...detail.materials.map(
        (m) =>
          `${m.sku ?? ''},${m.productName},${m.requestedQty},${m.approvedQty ?? ''},${m.allocatedQty ?? ''},${m.receivedQty ?? ''},${m.unit},${m.unitPrice}`,
      ),
    ];
    return new StreamableFile(Buffer.from(lines.join('\n'), 'utf-8'), {
      type: 'text/csv',
      disposition: `attachment; filename="requisition-${detail.requestNo ?? id}.csv"`,
    });
  }
}
