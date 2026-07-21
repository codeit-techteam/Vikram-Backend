import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { BannerQueryDto } from './dto/banner-query.dto';
import { BannerResponseDto } from './dto/banner-response.dto';
import { BannerService } from './banner.service';

@Public()
@ApiTags(SWAGGER_TAGS.BANNER)
@Controller({ version: '1', path: 'banners' })
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  @ApiOperation({
    summary: 'List active banners',
    description:
      'Returns only visible banners where current date is within startDate/endDate (or dates are null). Sorted by displayOrder.',
  })
  @ApiResponse({
    status: 200,
    description: 'Banners fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'Banners fetched successfully',
        data: [
          {
            id: 'uuid',
            title: 'Monsoon Bulk Savings',
            imageDesktop: 'https://cdn.example.com/banner-d.jpg',
            imageMobile: 'https://cdn.example.com/banner-m.jpg',
            ctaLabel: 'Shop Now',
            ctaLink: '/offers/monsoon',
            displayOrder: 1,
            isVisible: true,
          },
        ],
      },
    },
  })
  async findAll(
    @Query() query: BannerQueryDto,
  ): Promise<{ success: boolean; message: string; data: BannerResponseDto[] }> {
    const data = await this.bannerService.findAll(query.placement);
    return {
      success: true,
      message: 'Banners fetched successfully',
      data,
    };
  }
}
