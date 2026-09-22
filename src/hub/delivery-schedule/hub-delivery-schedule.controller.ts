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
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { DeliveryScheduleService } from '../../modules/delivery/delivery-schedule.service';
import { OrderEventsService } from '../../modules/orders/order-events.service';
import { getCustomerOrderStatusLabel } from '../../common/delivery/customer-delivery.util';

export class HubDeliveryScheduleQueryDto {
  @ApiPropertyOptional({ example: '2026-09-23' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: ['today', 'tomorrow', 'scheduled', 'all'] })
  @IsOptional()
  @IsString()
  bucket?: 'today' | 'tomorrow' | 'scheduled' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class HubRescheduleRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  slotId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@ApiTags('Hub Delivery Schedule')
@Controller({ version: '1', path: 'hub' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubDeliveryScheduleController {
  constructor(
    private readonly scheduleService: DeliveryScheduleService,
    private readonly orderEvents: OrderEventsService,
  ) {}

  @Get('delivery-schedule')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Hub delivery schedule grouped by time slot' })
  async getSchedule(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubDeliveryScheduleQueryDto,
  ) {
    const data = await this.scheduleService.getSchedule({
      ...query,
      hubId: user.hubId,
    });
    return { success: true, message: 'Delivery schedule fetched', data };
  }

  @Post('orders/:id/reschedule-request')
  @HubPermission('orders')
  @ApiOperation({
    summary: 'Propose a new delivery slot (customer must accept)',
  })
  async requestReschedule(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: HubRescheduleRequestDto,
  ) {
    const data = await this.scheduleService.requestReschedule({
      orderId,
      hubId: user.hubId,
      slotId: dto.slotId,
      reason: dto.reason,
      actorId: user.id,
      actorName: user.fullName || user.employeeId || 'Hub',
    });
    this.orderEvents.emitOrderUpdated({
      orderId: data.id,
      orderNumber: data.orderNumber,
      status: data.orderStatus,
      statusLabel: getCustomerOrderStatusLabel(data.orderStatus),
      updatedAt: new Date().toISOString(),
      hubId: data.hubId,
      customerId: data.customerId,
    });
    return { success: true, message: 'Reschedule requested', data };
  }
}
