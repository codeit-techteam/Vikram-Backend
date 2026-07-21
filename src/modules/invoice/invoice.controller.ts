import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
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
      'Returns invoice details for MVP as JSON. PDF generation will be added in a later phase. Auto-generates invoice on first request if missing.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
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
}
