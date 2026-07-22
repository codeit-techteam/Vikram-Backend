import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { ApiAdminRoles } from '../decorators/api-admin-roles.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminInvoiceQueryDto } from '../../modules/invoice/dto/invoice-query.dto';
import {
  InvoiceListResponseDto,
  RegenerateInvoiceDto,
  RegenerateInvoiceResultDto,
} from '../../modules/invoice/dto/invoice-list.dto';
import { InvoiceService } from '../../modules/invoice/invoice.service';

@ApiTags(SWAGGER_TAGS.ADMIN_INVOICES)
@Controller({ version: '1', path: 'admin/invoices' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminInvoicesController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.ALL)
  @ApiAdminRoles(...ROLE_GROUPS.ALL)
  @ApiOperation({
    summary: 'List invoices',
    description:
      'Paginated invoice list for admin. Filter by status, customer, date range, or search.',
  })
  @ApiResponse({ status: 200, type: InvoiceListResponseDto })
  async listInvoices(@Query() query: AdminInvoiceQueryDto) {
    const data = await this.invoiceService.listAdminInvoices(query);
    return { success: true, message: 'Invoices fetched successfully', data };
  }

  @Get(':id')
  @SkipResponseWrap()
  @Header('Content-Type', 'application/pdf')
  @ApiProduces('application/pdf')
  @AdminRoles(...ROLE_GROUPS.ALL)
  @ApiAdminRoles(...ROLE_GROUPS.ALL)
  @ApiOperation({
    summary: 'Download invoice PDF',
    description: 'Returns GST-compliant PDF for the given invoice ID.',
  })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({ status: 404, description: 'Invoice not found', type: ApiErrorResponseDto })
  async getInvoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.invoiceService.getAdminInvoicePdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('regenerate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Regenerate invoice PDF',
    description:
      'Deletes cached PDF, regenerates from invoice snapshot, and optionally emails the customer.',
  })
  @ApiResponse({ status: 200, type: RegenerateInvoiceResultDto })
  @ApiResponse({ status: 400, description: 'Missing invoiceId or orderId', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Invoice not found', type: ApiErrorResponseDto })
  async regenerateInvoice(
    @Body() dto: RegenerateInvoiceDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.invoiceService.regenerateInvoice(dto, dto.sendEmail);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Invoice',
      resourceId: data.id,
      newValue: { regenerate: true, sendEmail: dto.sendEmail ?? false },
    });
    return {
      success: true,
      message: 'Invoice PDF regenerated successfully',
      data,
    };
  }
}
