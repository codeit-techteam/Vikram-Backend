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
  AssignLogisticsDto,
  DispatchRequisitionDto,
  RejectRequisitionDto,
  RequisitionCommentDto,
  RequisitionPaginationQueryDto,
} from '../../modules/requisitions/dto/requisitions.dto';

@ApiTags('Admin Requisitions')
@Controller({ version: '1', path: 'admin/requisitions' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminRequisitionsController {
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
  @ApiOperation({ summary: 'Warehouse requisition dashboard stats' })
  async stats(@Query('hubId') hubId?: string) {
    const data = await this.requisitionsService.getStats(hubId);
    return { success: true, message: 'Requisition stats fetched', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List all requisitions' })
  async findAll(@Query() query: RequisitionPaginationQueryDto) {
    const data = await this.requisitionsService.findAll(
      query,
      query.hubId,
      'admin',
    );
    return { success: true, message: 'Requisitions fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get requisition detail' })
  async findOne(@Param('id') id: string) {
    const data = await this.requisitionsService.findOne(id);
    return { success: true, message: 'Requisition fetched', data };
  }

  @Patch(':id/approve')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Approve requisition with per-item quantities' })
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
      newValue: { status: 'APPROVED' },
    });
    return { success: true, message: 'Requisition approved', data };
  }

  @Patch(':id/reject')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Reject requisition' })
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
      newValue: { status: 'REJECTED', reason: dto.reason },
    });
    return { success: true, message: 'Requisition rejected', data };
  }

  @Patch(':id/allocate')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Allocate warehouse inventory' })
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

  @Patch(':id/assign-logistics')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Assign vehicle/driver to allocated transfer' })
  async assignLogistics(
    @Param('id') id: string,
    @Body() dto: AssignLogisticsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.requisitionsService.assignLogistics(
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
      newValue: {
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
      },
    });
    return { success: true, message: 'Logistics assigned', data };
  }

  @Patch(':id/dispatch')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Dispatch requisition shipment' })
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
  @ApiOperation({ summary: 'Add warehouse comment' })
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
  @ApiOperation({ summary: 'Export requisition as CSV' })
  async exportCsv(@Param('id') id: string) {
    const detail = await this.requisitionsService.findOne(id);
    const lines = [
      'SKU,Product,Requested,Approved,Allocated,Received,Unit,Unit Price',
      ...detail.materials.map(
        (m) =>
          `${m.sku ?? ''},${m.productName},${m.requestedQty},${m.approvedQty ?? ''},${m.allocatedQty ?? ''},${m.receivedQty ?? ''},${m.unit},${m.unitPrice}`,
      ),
    ];
    const buffer = Buffer.from(lines.join('\n'), 'utf-8');
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${detail.requestNo}.csv"`,
    });
  }
}
