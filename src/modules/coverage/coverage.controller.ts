import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CoverageService } from './coverage.service';
import { FindHubQueryDto, HubStockQueryDto } from './dto/coverage.dto';

@ApiTags('Coverage')
@Controller({ version: '1', path: 'coverage' })
export class CoverageController {
  constructor(private readonly coverageService: CoverageService) {}

  @Public()
  @Get('find-hub')
  @ApiOperation({
    summary: 'Find nearest active hub for a delivery location',
    description:
      'Matches active hubs by haversine distance against each hub service radius. A hub is eligible only when the destination is inside that hub radius.',
  })
  @ApiResponse({ status: 200, description: 'Nearest hub match (or null)' })
  async findHub(@Query() query: FindHubQueryDto) {
    const productIds = query.productIds
      ? query.productIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const quantities = query.quantities
      ? query.quantities.split(',').map((s) => Number(s.trim()) || 1)
      : [];

    const items = productIds.map((productId, index) => ({
      productId,
      quantity: quantities[index] ?? 1,
    }));

    const hub = await this.coverageService.findNearestHub(
      {
        latitude: query.lat,
        longitude: query.lng,
        pincode: query.pincode,
      },
      items,
    );

    return {
      success: true,
      message: hub ? 'Hub found' : 'No hub in coverage',
      data: hub,
    };
  }

  @Public()
  @Get('hub-stock')
  @ApiOperation({
    summary: 'Get hub inventory for products at a location or hubId',
  })
  async hubStock(@Query() query: HubStockQueryDto) {
    let hubId = query.hubId;

    if (!hubId) {
      const match = await this.coverageService.findNearestHub({
        latitude: query.lat,
        longitude: query.lng,
        pincode: query.pincode,
      });
      hubId = match?.id;
    }

    if (!hubId) {
      return {
        success: true,
        message: 'No hub in coverage',
        data: { hubId: null, items: [] },
      };
    }

    const items = await this.coverageService.getHubInventoryForProducts(hubId);

    return {
      success: true,
      message: 'Hub stock fetched',
      data: { hubId, items },
    };
  }
}
