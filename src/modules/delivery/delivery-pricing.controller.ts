import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { DeliveryVehicleType } from '../../../generated/prisma/client';
import { DeliveryPricingService } from './delivery-pricing.service';
import { DeliveryVehicleSelectionService } from './engine/delivery-vehicle-selection.service';
import {
  CalculateDeliveryPricingDto,
  DeliveryPricingListQueryDto,
} from './dto/delivery-pricing.dto';
import {
  DELIVERY_VEHICLE_DISPLAY_NAMES,
  DELIVERY_VEHICLE_TYPES,
} from './delivery-pricing.constants';

@ApiTags('Delivery Pricing')
@Controller({ version: '1', path: 'delivery-pricing' })
export class DeliveryPricingController {
  constructor(
    private readonly pricingService: DeliveryPricingService,
    private readonly vehicleSelection: DeliveryVehicleSelectionService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active delivery pricing rules' })
  async list(@Query() query: DeliveryPricingListQueryDto) {
    const data = await this.pricingService.listRules({
      vehicleType: query.vehicleType,
      status: query.status,
    });
    return {
      success: true,
      message: 'Delivery pricing rules',
      data,
    };
  }

  @Public()
  @Get('vehicles')
  @ApiOperation({
    summary:
      'List delivery vehicle types with capacity config (capacities may be null until Admin sets them)',
  })
  async vehicles() {
    const configs = await this.vehicleSelection.listVehicleConfigs(false);
    const byType = new Map(configs.map((c) => [c.vehicleType, c]));
    return {
      success: true,
      message: 'Delivery vehicle types',
      data: DELIVERY_VEHICLE_TYPES.map((type) => {
        const cfg = byType.get(type);
        return {
          vehicleType: type,
          displayName: cfg?.displayName ?? DELIVERY_VEHICLE_DISPLAY_NAMES[type],
          imageUrl: cfg?.imageUrl ?? null,
          maxWeightKg: cfg?.maxWeightKg ?? null,
          maxVolumeCft: cfg?.maxVolumeCft ?? null,
          maxQuantity: cfg?.maxQuantity ?? null,
          capacityUtilizationLimit: cfg?.capacityUtilizationLimit ?? 100,
          priority: cfg?.priority ?? null,
          active: cfg?.active ?? true,
          hasConfiguredCapacity: cfg?.hasConfiguredCapacity ?? false,
        };
      }),
    };
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @Post('calculate')
  @ApiOperation({
    summary:
      'Calculate delivery charge: Quantity → Load → Vehicle → Distance → Price (server-side)',
  })
  async calculate(
    @Body() dto: CalculateDeliveryPricingDto,
    @CurrentUser() user?: AuthenticatedCustomer | null,
  ) {
    const customerId = user?.id;
    const applyFree = dto.applyFreeBikeBenefit !== false && !!customerId;

    if (dto.cartItems?.length) {
      if (dto.distanceKm == null) {
        throw new BadRequestException(
          'distanceKm is required when calculating from cartItems',
        );
      }
      const data = await this.pricingService.calculateFromCart({
        cartItems: dto.cartItems,
        distanceKm: dto.distanceKm,
        customerId,
        applyFreeBikeBenefit: applyFree,
      });
      return {
        success: true,
        message: data.available
          ? 'Delivery charge calculated'
          : (data.message ?? 'Delivery pricing unavailable'),
        data,
      };
    }

    if (dto.vehicleType == null || dto.distanceKm == null) {
      throw new BadRequestException(
        'Provide cartItems + distanceKm, or vehicleType + distanceKm',
      );
    }

    const data = await this.pricingService.calculateCharge({
      vehicleType: dto.vehicleType,
      distanceKm: dto.distanceKm,
      customerId,
      applyFreeBikeBenefit: applyFree,
    });
    return {
      success: true,
      message: data.available
        ? 'Delivery charge calculated'
        : (data.message ?? 'Delivery pricing unavailable'),
      data,
    };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery pricing rule by id' })
  async getById(@Param('id') id: string) {
    const data = await this.pricingService.getRuleById(id);
    return { success: true, message: 'Delivery pricing rule', data };
  }
}
