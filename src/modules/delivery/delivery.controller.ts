import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { DeliveryService } from './delivery.service';
import { DeliveryOptionsService } from './delivery-options.service';
import { DeliverySlotService } from './delivery-slot.service';
import {
  DeliveryEtaBodyDto,
  DeliveryEtaQueryDto,
  DeliveryEtaResponseDto,
} from './dto/delivery-eta.dto';
import {
  DeliveryOptionsQueryDto,
  DeliveryOptionsResponseDto,
  HoldDeliverySlotDto,
} from './dto/delivery-options.dto';

@ApiTags('Delivery')
@Controller({ version: '1', path: 'delivery' })
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly deliveryOptionsService: DeliveryOptionsService,
    private readonly deliverySlotService: DeliverySlotService,
  ) {}

  @Public()
  @Get('eta')
  @ApiOperation({
    summary: 'Calculate dynamic delivery ETA from nearest hub',
    description:
      'Uses user lat/lng → nearest active hub → inventory check → picking+packing+loading+travel+traffic buffer.',
  })
  @ApiResponse({ status: 200, type: DeliveryEtaResponseDto })
  async getEta(@Query() query: DeliveryEtaQueryDto) {
    const data = await this.deliveryService.calculateEtaFromQuery(query);
    return {
      success: true,
      message: data.serviceable
        ? 'ETA calculated successfully'
        : 'Location not serviceable',
      data,
    };
  }

  @Public()
  @Post('eta')
  @ApiOperation({
    summary: 'Calculate ETA with full cart payload',
  })
  @ApiBody({ type: DeliveryEtaBodyDto })
  @ApiResponse({ status: 200, type: DeliveryEtaResponseDto })
  async postEta(@Body() body: DeliveryEtaBodyDto) {
    const data = await this.deliveryService.calculateEta(body);
    return {
      success: true,
      message: data.serviceable
        ? 'ETA calculated successfully'
        : 'Location not serviceable',
      data,
    };
  }

  @Get('options')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'List available delivery preferences and time slots',
    description:
      'Computes ASAP / today / tomorrow / scheduled slots from hub hours, cart logistics, and live capacity.',
  })
  @ApiResponse({ status: 200, type: DeliveryOptionsResponseDto })
  async getOptions(
    @CurrentUser() user: AuthenticatedCustomer,
    @Query() query: DeliveryOptionsQueryDto,
  ) {
    const data = await this.deliveryOptionsService.getOptionsForCustomer(
      user.id,
      query.addressId,
    );
    return {
      success: true,
      message: data.serviceable
        ? 'Delivery options ready'
        : 'Delivery unavailable at this location',
      data,
    };
  }

  @Post('slots/:slotId/hold')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'Temporarily hold a delivery slot during checkout',
  })
  async holdSlot(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('slotId') slotId: string,
    @Body() _body: HoldDeliverySlotDto,
  ) {
    const reservation = await this.deliverySlotService.holdSlot({
      customerId: user.id,
      slotId,
    });
    return {
      success: true,
      message: 'Delivery slot held',
      data: {
        reservationId: reservation.id,
        slotId: reservation.slotId,
        status: reservation.status,
        expiresAt: reservation.expiresAt?.toISOString() ?? null,
      },
    };
  }
}
