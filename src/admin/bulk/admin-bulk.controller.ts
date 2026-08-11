import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminBulkService } from './admin-bulk.service';
import {
  AddBulkFollowUpDto,
  AddBulkInternalNoteDto,
  AssignExecutiveDto,
  BulkQueryDto,
  ConvertBulkToOrderDto,
  CreateBulkQuotationDto,
  RejectBulkEnquiryDto,
  UpdateBulkFollowUpStatusDto,
  UpdateBulkQuotationStatusDto,
  UpdateBulkStatusDto,
} from './dto/admin-bulk.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Bulk Procurement')
@Controller({ version: '1', path: 'admin/bulk' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminBulkController {
  constructor(
    private readonly bulkService: AdminBulkService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'List bulk procurement enquiries' })
  async findAll(@Query() query: BulkQueryDto) {
    const data = await this.bulkService.findAll(query);
    return { success: true, message: 'Bulk enquiries fetched', data };
  }

  @Get('stats')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Bulk enquiry pipeline stats' })
  async stats(@Query() query: BulkQueryDto) {
    const data = await this.bulkService.getStats(query);
    return { success: true, message: 'Bulk stats fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Get bulk enquiry details' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.bulkService.findOne(id);
    return { success: true, message: 'Bulk enquiry fetched', data };
  }

  @Patch(':id/assign')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Assign executive to bulk enquiry' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignExecutiveDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.assignExecutive(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'ASSIGN',
      resource: 'BulkEnquiry',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Executive assigned', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Update bulk enquiry status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBulkStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.updateStatus(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'BulkEnquiry',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Status updated', data };
  }

  @Post(':id/follow-ups')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Add follow-up to bulk enquiry' })
  async addFollowUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBulkFollowUpDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.addFollowUp(id, dto, admin);
    return { success: true, message: 'Follow-up added', data };
  }

  @Patch(':id/follow-ups/:followUpId')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Update follow-up status' })
  async updateFollowUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: UpdateBulkFollowUpStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.updateFollowUpStatus(
      id,
      followUpId,
      dto,
      admin,
    );
    return { success: true, message: 'Follow-up updated', data };
  }

  @Post(':id/notes')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Add internal note' })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBulkInternalNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.addInternalNote(id, dto, admin);
    return { success: true, message: 'Note added', data };
  }

  @Post(':id/quotations')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Create quotation for bulk enquiry' })
  async createQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBulkQuotationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.createQuotation(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'BulkEnquiryQuotation',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Quotation created', data };
  }

  @Patch(':id/quotations/:quotationId/status')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Update quotation status' })
  async updateQuotationStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: UpdateBulkQuotationStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.updateQuotationStatus(
      id,
      quotationId,
      dto,
      admin,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'BulkEnquiryQuotation',
      resourceId: quotationId,
      newValue: dto,
    });
    return { success: true, message: 'Quotation status updated', data };
  }

  @Post(':id/convert')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Convert bulk enquiry to order (no inventory deduction)',
  })
  async convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertBulkToOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.convertToOrder(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'BulkEnquiry',
      resourceId: id,
      newValue: {
        orderId: data.order.id,
        orderNumber: data.order.orderNumber,
        converted: true,
      },
    });
    return { success: true, message: 'Enquiry converted to order', data };
  }

  @Patch(':id/approve')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Approve bulk enquiry (mark in progress)' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.approve(id, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'APPROVE',
      resource: 'BulkEnquiry',
      resourceId: id,
    });
    return { success: true, message: 'Enquiry approved', data };
  }

  @Patch(':id/reject')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Reject bulk enquiry' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: RejectBulkEnquiryDto,
  ) {
    const data = await this.bulkService.reject(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'REJECT',
      resource: 'BulkEnquiry',
      resourceId: id,
    });
    return { success: true, message: 'Enquiry rejected', data };
  }

  @Patch(':id/cancel')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Cancel bulk enquiry' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: RejectBulkEnquiryDto,
  ) {
    const data = await this.bulkService.cancel(id, dto, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CANCEL',
      resource: 'BulkEnquiry',
      resourceId: id,
    });
    return { success: true, message: 'Enquiry cancelled', data };
  }

  @Patch(':id/quotation')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({
    summary: 'Legacy: mark enquiry as QUOTED (prefer POST quotations)',
  })
  async quotation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body('remarks') remarks?: string,
  ) {
    const data = await this.bulkService.sendQuotation(id, remarks, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'BulkEnquiry',
      resourceId: id,
    });
    return { success: true, message: 'Quotation sent', data };
  }

  @Patch(':id/complete')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Mark bulk enquiry as complete' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.bulkService.complete(id, admin);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'BulkEnquiry',
      resourceId: id,
    });
    return { success: true, message: 'Enquiry completed', data };
  }
}
