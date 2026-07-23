import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { CmsService } from './cms.service';
import {
  CmsAdvertisementDto,
  CmsBannerDto,
  CmsHomeResponseDto,
  CmsHomeSectionDto,
  CmsPromotionDto,
  CmsTestimonialDto,
} from './dto/cms-response.dto';

@Public()
@ApiTags(SWAGGER_TAGS.CMS)
@Controller({ version: '1', path: 'cms' })
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get('home')
  @ApiOperation({
    summary: 'Get full Home Screen CMS payload',
    description:
      'Returns active home sections and all CMS content (banners, ads, testimonials, promotions). Cached in Redis for 10 minutes.',
  })
  @ApiResponse({ status: 200, description: 'CMS home payload fetched' })
  async getHome(): Promise<{
    success: boolean;
    message: string;
    data: CmsHomeResponseDto;
  }> {
    const data = await this.cmsService.getHome();
    return {
      success: true,
      message: 'CMS home fetched successfully',
      data,
    };
  }

  @Get('banners')
  @ApiOperation({ summary: 'List active CMS banners' })
  async getBanners(): Promise<{
    success: boolean;
    message: string;
    data: CmsBannerDto[];
  }> {
    const data = await this.cmsService.getBanners();
    return { success: true, message: 'Banners fetched successfully', data };
  }

  @Get('ads')
  @ApiOperation({ summary: 'List active brand advertisements' })
  async getAds(): Promise<{
    success: boolean;
    message: string;
    data: CmsAdvertisementDto[];
  }> {
    const data = await this.cmsService.getAds();
    return { success: true, message: 'Ads fetched successfully', data };
  }

  @Get('testimonials')
  @ApiOperation({ summary: 'List published testimonials' })
  async getTestimonials(): Promise<{
    success: boolean;
    message: string;
    data: CmsTestimonialDto[];
  }> {
    const data = await this.cmsService.getTestimonials();
    return {
      success: true,
      message: 'Testimonials fetched successfully',
      data,
    };
  }

  @Get('promotions')
  @ApiOperation({ summary: 'List active promotional cards' })
  async getPromotions(): Promise<{
    success: boolean;
    message: string;
    data: CmsPromotionDto[];
  }> {
    const data = await this.cmsService.getPromotions();
    return {
      success: true,
      message: 'Promotions fetched successfully',
      data,
    };
  }

  @Get('home-sections')
  @ApiOperation({ summary: 'List enabled home section layout' })
  async getHomeSections(): Promise<{
    success: boolean;
    message: string;
    data: CmsHomeSectionDto[];
  }> {
    const data = await this.cmsService.getHomeSections();
    return {
      success: true,
      message: 'Home sections fetched successfully',
      data,
    };
  }
}
