import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { InvoiceService } from './invoice.service';

@ApiTags(SWAGGER_TAGS.INVOICE)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'orders' })
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get(':orderId/invoice')
  @ApiOperation({
    summary: 'Get order invoice (JSON)',
    description:
      'Returns GST invoice details as JSON. Auto-generates invoice on first request if missing.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
    type: ApiErrorResponseDto,
  })
  async getInvoice(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<{ success: boolean; message: string; data: InvoiceResponseDto }> {
    const data = await this.invoiceService.getInvoice(customer.id, orderId);
    return {
      success: true,
      message: 'Invoice fetched successfully',
      data,
    };
  }

  @Get(':orderId/invoice/pdf')
  @SkipResponseWrap()
  @Header('Content-Type', 'application/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Download order invoice PDF',
    description:
      'Generates and returns a GST-compliant PDF invoice. PDF is cached on disk after first generation.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
    type: ApiErrorResponseDto,
  })
  async getInvoicePdf(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.invoiceService.getInvoicePdf(
      customer.id,
      orderId,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
