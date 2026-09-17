import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  AutocompleteQueryDto,
  ForwardGeocodeQueryDto,
  PlaceDetailsQueryDto,
  PlaceSuggestionDto,
  ResolvedAddressDto,
  ReverseGeocodeQueryDto,
} from './dto/geocoding.dto';
import { GeocodingRateLimitGuard } from './geocoding-rate-limit.guard';
import { GeocodingService } from './geocoding.service';

/**
 * Proxies Google Geocoding and Places so the billable key stays on the server.
 * Public because customers pick a delivery location before signing in.
 */
@ApiTags('Geocoding')
@Controller({ version: '1', path: 'geocoding' })
@UseGuards(GeocodingRateLimitGuard)
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Public()
  @Get('reverse')
  @ApiOperation({
    summary: 'Resolve coordinates to a postal address',
    description:
      'Coordinates are rounded to ~11m and cached for 24h, so dragging a map pin costs at most one Google request per 11m cell.',
  })
  @ApiResponse({ status: 200, type: ResolvedAddressDto })
  async reverse(@Query() query: ReverseGeocodeQueryDto) {
    return this.geocodingService.reverseGeocode(query.lat, query.lng);
  }

  @Public()
  @Get('forward')
  @ApiOperation({ summary: 'Resolve free-text address to coordinates' })
  @ApiResponse({ status: 200, type: ResolvedAddressDto })
  async forward(@Query() query: ForwardGeocodeQueryDto) {
    return this.geocodingService.forwardGeocode(query.address);
  }

  @Public()
  @Get('autocomplete')
  @ApiOperation({
    summary: 'Address suggestions for partial input',
    description:
      'Pass the same sessionToken for every keystroke and the follow-up place lookup so Google bills one session instead of one request per character.',
  })
  @ApiResponse({ status: 200, type: [PlaceSuggestionDto] })
  async autocomplete(@Query() query: AutocompleteQueryDto) {
    return this.geocodingService.autocomplete(query.input, query.sessionToken);
  }

  @Public()
  @Get('place')
  @ApiOperation({ summary: 'Full address for an autocomplete suggestion' })
  @ApiResponse({ status: 200, type: ResolvedAddressDto })
  async place(@Query() query: PlaceDetailsQueryDto) {
    return this.geocodingService.placeDetails(
      query.placeId,
      query.sessionToken,
    );
  }
}
