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
import {
  OrderStatusResponseDto,
  OrderTimelineEventDto,
} from '../orders/dto/order-response.dto';
import { OrderTrackingService } from './order-tracking.service';

@ApiTags(SWAGGER_TAGS.ORDER_TRACKING)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'orders' })
export class OrderTrackingController {
  constructor(private readonly orderTrackingService: OrderTrackingService) {}

  @Get(':orderId/timeline')
  @ApiOperation({
    summary: 'Get order timeline',
    description:
      'Returns chronological status events: Order Placed → Confirmed → Hub Assigned → Processing → Packed → Ready for Dispatch → Dispatched → Delivered (or Cancelled).',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, type: [OrderTimelineEventDto] })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
  async getTimeline(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: OrderTimelineEventDto[];
  }> {
    const data = await this.orderTrackingService.getTimeline(customer.id, orderId);
    return {
      success: true,
      message: 'Order timeline fetched successfully',
      data,
    };
  }

  @Get(':orderId/tracking')
  @ApiOperation({
    summary: 'Get live order tracking payload',
    description:
      'Returns status timeline, assigned hub, and driver details for the customer tracking screen.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Tracking payload' })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
  async getTracking(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const data = await this.orderTrackingService.getTracking(customer.id, orderId);
    return {
      success: true,
      message: 'Order tracking fetched successfully',
      data,
    };
  }

  @Get(':orderId/status')
  @ApiOperation({
    summary: 'Get current order status',
    description: 'Returns only the current status of the order.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, type: OrderStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorResponseDto })
  async getStatus(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: OrderStatusResponseDto;
  }> {
    const data = await this.orderTrackingService.getStatus(customer.id, orderId);
    return {
      success: true,
      message: 'Order status fetched successfully',
      data,
    };
  }
}
