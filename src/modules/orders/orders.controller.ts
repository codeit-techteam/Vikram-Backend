import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderResponseDto, PlaceOrderDto } from './dto/order.dto';
import { OrderListQueryDto } from './dto/order-query.dto';
import {
  OrderDetailResponseDto,
  OrderListResponseDto,
} from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags(SWAGGER_TAGS.ORDERS)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'orders' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place order',
    description: `
Places an order from the customer cart (MVP — Cash/Manual payment only).

**Flow**
1. Validate cart & stock
2. Validate delivery address
3. Assign nearest hub with stock (or mark Awaiting Hub Allocation)
4. Reserve inventory at hub
5. Generate order number (\`BJW-YYYY-NNNNNN\`)
6. Create order + items + timeline
7. Clear cart
8. Create customer notification

Does **not** charge online payment, apply coupons, EMI, or credit. Supports loyalty redemption at placement.
    `,
  })
  @ApiBody({
    type: PlaceOrderDto,
    examples: {
      cash: {
        summary: 'Cash on delivery',
        value: {
          addressId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          paymentMethod: 'CASH',
          notes: 'Call before delivery',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Order placed', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Empty cart / stock / validation', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Address not found', type: ApiErrorResponseDto })
  async placeOrder(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: PlaceOrderDto,
  ): Promise<{ success: boolean; message: string; data: OrderResponseDto }> {
    const data = await this.ordersService.placeOrder(customer.id, dto);
    return {
      success: true,
      message: 'Order placed successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List customer orders',
    description:
      'Returns paginated order history for the authenticated customer. Supports status and date-range filters. Sorted newest first.',
  })
  @ApiResponse({ status: 200, description: 'Orders fetched', type: OrderListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorResponseDto })
  async findAll(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Query() query: OrderListQueryDto,
  ): Promise<{ success: boolean; message: string; data: OrderListResponseDto }> {
    const data = await this.ordersService.findAll(customer.id, query);
    return {
      success: true,
      message: 'Orders fetched successfully',
      data,
    };
  }

  @Get(':orderId')
  @ApiOperation({
    summary: 'Get order details',
    description:
      'Returns full order details including customer, items, hub, address, payment, timeline, and invoice status.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, type: OrderDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
  async findOne(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<{ success: boolean; message: string; data: OrderDetailResponseDto }> {
    const data = await this.ordersService.findOne(customer.id, orderId);
    return {
      success: true,
      message: 'Order details fetched successfully',
      data,
    };
  }

  @Post(':orderId/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder items from a past order',
    description:
      'Returns productId + quantity snapshots from the order so the client can add them to cart.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Reorder products returned' })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
  async reorder(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const data = await this.ordersService.reorder(customer.id, orderId);
    return {
      success: true,
      message: data.message,
      data,
    };
  }

  @Patch(':orderId/cancel')
  @ApiOperation({
    summary: 'Cancel an order',
    description:
      'Cancels the order only if status is Pending, Confirmed, Hub Assigned, or Awaiting Hub Allocation. Creates a timeline entry and notification.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, type: OrderDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Not eligible for cancellation', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
  async cancel(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CancelOrderDto,
  ): Promise<{ success: boolean; message: string; data: OrderDetailResponseDto }> {
    const data = await this.ordersService.cancel(customer.id, orderId, dto);
    return {
      success: true,
      message: 'Order cancelled successfully',
      data,
    };
  }
}
