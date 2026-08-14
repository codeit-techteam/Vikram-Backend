import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { OfferResponseDto } from './dto/offer-response.dto';
import { OfferService } from './offer.service';

class OfferQueryDto {
  @ApiPropertyOptional({ description: 'Return only featured offers' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Max offers to return. Home carousel uses 5.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@Public()
@ApiTags(SWAGGER_TAGS.OFFERS)
@Controller({ version: '1', path: 'offers' })
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Get()
  @ApiOperation({
    summary: 'List eligible published offers',
    description:
      'Returns only ACTIVE visible offers within their Asia/Kolkata schedule, sorted by priority.',
  })
  @ApiResponse({ status: 200, description: 'Offers fetched successfully' })
  async findAll(
    @Query() query: OfferQueryDto,
  ): Promise<{ success: boolean; message: string; data: OfferResponseDto[] }> {
    const data = await this.offerService.findAll({
      featured: query.featured,
      limit: query.limit,
    });
    return {
      success: true,
      message: 'Offers fetched successfully',
      data,
    };
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get offer by slug',
    description:
      'Returns offer details including currently available mapped products. Unavailable products are omitted.',
  })
  @ApiParam({ name: 'slug', example: 'construction-starter-bundle' })
  @ApiResponse({ status: 200, description: 'Offer fetched successfully' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<{ success: boolean; message: string; data: OfferResponseDto }> {
    const data = await this.offerService.findBySlug(slug);
    return {
      success: true,
      message: 'Offer fetched successfully',
      data,
    };
  }
}
