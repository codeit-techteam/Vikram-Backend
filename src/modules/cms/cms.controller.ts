import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { CmsService } from './cms.service';
import {
  CmsAdvertisementDto,
  CmsBannerDto,
  CmsEmergencyBannerDto,
  CmsHomeResponseDto,
  CmsHomeSectionDto,
  CmsOfferDto,
  CmsPromotionDto,
  CmsQuickActionDto,
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
        'Returns active home sections and all CMS content (banners, ads, testimonials, promotions). Cached briefly so Super Admin publishes appear on the next Home load.',
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

  @Get('brand-ads')
  @ApiOperation({ summary: 'Alias for brand advertisements' })
  async getBrandAds(): Promise<{
    success: boolean;
    message: string;
    data: CmsAdvertisementDto[];
  }> {
    const data = await this.cmsService.getAds();
    return { success: true, message: 'Brand ads fetched successfully', data };
  }

  @Get('videos')
  @ApiOperation({ summary: 'List active CMS video banners / hero videos' })
  async getVideos(): Promise<{
    success: boolean;
    message: string;
    data: CmsBannerDto[];
  }> {
    const data = await this.cmsService.getPublicVideos();
    return { success: true, message: 'Videos fetched successfully', data };
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

  @Get('offers')
  @ApiOperation({ summary: 'List featured Offer For You items' })
  async getOffers(): Promise<{
    success: boolean;
    message: string;
    data: CmsOfferDto[];
  }> {
    const data = await this.cmsService.getOffersForYou();
    return { success: true, message: 'Offers fetched successfully', data };
  }

  @Get('quick-actions')
  @ApiOperation({ summary: 'List homepage quick action buttons' })
  async getQuickActions(): Promise<{
    success: boolean;
    message: string;
    data: CmsQuickActionDto[];
  }> {
    const data = await this.cmsService.getQuickActions();
    return {
      success: true,
      message: 'Quick actions fetched successfully',
      data,
    };
  }

  @Get('emergency-banner')
  @ApiOperation({ summary: 'Get active dismissible emergency banner' })
  async getEmergencyBanner(): Promise<{
    success: boolean;
    message: string;
    data: CmsEmergencyBannerDto | null;
  }> {
    const data = await this.cmsService.getEmergencyBanner();
    return {
      success: true,
      message: 'Emergency banner fetched successfully',
      data,
    };
  }

  @Get('layout')
  @ApiOperation({ summary: 'Alias for homepage section layout' })
  async getLayout(): Promise<{
    success: boolean;
    message: string;
    data: CmsHomeSectionDto[];
  }> {
    const data = await this.cmsService.getHomeSections();
    return { success: true, message: 'Layout fetched successfully', data };
  }

  @Get('home-layout')
  @ApiOperation({ summary: 'Alias for homepage section layout' })
  async getHomeLayout(): Promise<{
    success: boolean;
    message: string;
    data: CmsHomeSectionDto[];
  }> {
    const data = await this.cmsService.getHomeSections();
    return { success: true, message: 'Home layout fetched successfully', data };
  }
}
