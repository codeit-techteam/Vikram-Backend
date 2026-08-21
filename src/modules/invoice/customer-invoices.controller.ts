import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { CustomerInvoiceQueryDto } from './dto/invoice-query.dto';
import { InvoiceListResponseDto } from './dto/invoice-list.dto';
import { InvoiceService } from './invoice.service';

@ApiTags(SWAGGER_TAGS.INVOICE)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'customer/invoices' })
export class CustomerInvoicesController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @ApiOperation({
    summary: 'Invoice history',
    description:
      'Paginated list of invoices for the authenticated customer. Supports status filter and search by invoice/order number.',
  })
  @ApiResponse({ status: 200, type: InvoiceListResponseDto })
  async listInvoices(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Query() query: CustomerInvoiceQueryDto,
  ) {
    const data = await this.invoiceService.listCustomerInvoices(
      customer.id,
      query,
    );
    return {
      success: true,
      message: 'Invoice history fetched successfully',
      data,
    };
  }
}
