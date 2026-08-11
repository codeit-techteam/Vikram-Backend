import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { DeliveryVehicleType } from '../../../generated/prisma/client';
import { DeliveryPricingService } from './delivery-pricing.service';
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
  constructor(private readonly pricingService: DeliveryPricingService) {}

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
  @ApiOperation({ summary: 'List delivery vehicle types with display names' })
  vehicles() {
    return {
      success: true,
      message: 'Delivery vehicle types',
      data: DELIVERY_VEHICLE_TYPES.map((type) => ({
        vehicleType: type,
        displayName: DELIVERY_VEHICLE_DISPLAY_NAMES[type as DeliveryVehicleType],
      })),
    };
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @Post('calculate')
  @ApiOperation({
    summary:
      'Calculate delivery charge server-side from vehicleType + distanceKm',
  })
  async calculate(
    @Body() dto: CalculateDeliveryPricingDto,
    @CurrentUser() user?: AuthenticatedCustomer | null,
  ) {
    const customerId = user?.id;
    const data = await this.pricingService.calculateCharge({
      vehicleType: dto.vehicleType,
      distanceKm: dto.distanceKm,
      customerId,
      applyFreeBikeBenefit: dto.applyFreeBikeBenefit !== false && !!customerId,
    });
    return {
      success: true,
      message: data.available
        ? 'Delivery charge calculated'
        : data.message ?? 'Delivery pricing unavailable',
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
