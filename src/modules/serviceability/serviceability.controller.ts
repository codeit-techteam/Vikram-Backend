import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  ServiceabilityCheckQueryDto,
  ServiceabilityCheckResponseDto,
} from './dto/serviceability-check.dto';
import { ServiceabilityService } from './serviceability.service';

@ApiTags('Serviceability')
@Controller({ version: '1', path: 'serviceability' })
export class ServiceabilityController {
  constructor(private readonly serviceabilityService: ServiceabilityService) {}

  @Public()
  @Get('check')
  @ApiOperation({
    summary: 'Check if a location is covered by an active hub',
    description:
      'Uses haversine distance against hub coordinates and coverage radius. Never uses address or city name matching.',
  })
  @ApiResponse({ status: 200, type: ServiceabilityCheckResponseDto })
  async check(@Query() query: ServiceabilityCheckQueryDto) {
    const latitude = query.latitude ?? query.lat!;
    const longitude = query.longitude ?? query.lng!;

    const data = await this.serviceabilityService.check(latitude, longitude);

    return {
      success: true,
      message: data.serviceable
        ? 'Location is serviceable'
        : 'Location is not serviceable',
      data,
    };
  }
}
