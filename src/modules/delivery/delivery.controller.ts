import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DeliveryService } from './delivery.service';
import {
  DeliveryEtaBodyDto,
  DeliveryEtaQueryDto,
  DeliveryEtaResponseDto,
} from './dto/delivery-eta.dto';

@ApiTags('Delivery')
@Controller({ version: '1', path: 'delivery' })
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

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
}
