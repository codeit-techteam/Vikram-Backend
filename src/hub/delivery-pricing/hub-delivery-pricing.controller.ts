import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { DeliveryPricingService } from '../../modules/delivery/delivery-pricing.service';
import { DeliveryPricingListQueryDto } from '../../modules/delivery/dto/delivery-pricing.dto';

/**
 * Hub reads central delivery pricing — no separate Hub price table.
 * Order snapshots remain the source for historical order charges.
 */
@ApiTags('Hub Delivery Pricing')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@UseGuards(HubJwtAuthGuard)
@Controller({ path: 'hub/delivery-pricing', version: '1' })
export class HubDeliveryPricingController {
  constructor(private readonly pricingService: DeliveryPricingService) {}

  @Get()
  @ApiOperation({
    summary: 'List delivery pricing rules (central config, read-only for Hub)',
  })
  async list(@Query() query: DeliveryPricingListQueryDto) {
    const data = await this.pricingService.listRules(query);
    return {
      success: true,
      message: 'Delivery pricing rules',
      data,
    };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Delivery pricing summary for Hub logistics' })
  async summary() {
    const data = await this.pricingService.getSummary();
    return { success: true, message: 'Delivery pricing summary', data };
  }
}
