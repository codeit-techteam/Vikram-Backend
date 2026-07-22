import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerResponseDto } from '../../banner/dto/banner-response.dto';
import { CategoryResponseDto } from '../../category/dto/category-response.dto';
import { OfferResponseDto } from '../../offer/dto/offer-response.dto';
import { ProductResponseDto } from '../../product/dto/product-response.dto';
import { VideoResponseDto } from '../../video/dto/video-response.dto';
import { MembershipSummaryDto } from '../../membership/dto/membership.dto';
import { LoyaltySummaryDto } from '../../loyalty/dto/loyalty.dto';
import { TestimonialResponseDto } from '../../testimonials/dto/testimonials.dto';
import { OrderListItemDto } from '../../orders/dto/order-response.dto';

export class AnnouncementResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  body?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiPropertyOptional()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  linkTarget?: string | null;
}

export class HomeQuickStatsDto {
  @ApiProperty({ example: 5, description: 'Count of currently active offers' })
  activeOffers!: number;

  @ApiProperty({
    example: 20,
    description: 'Count of featured products',
  })
  featuredProducts!: number;
}

export class HomeResponseDto {
  @ApiProperty({ type: [BannerResponseDto], description: 'Hero banner carousel' })
  banners!: BannerResponseDto[];

  @ApiProperty({ type: [OfferResponseDto], description: 'Featured offers strip' })
  featuredOffers!: OfferResponseDto[];

  @ApiProperty({
    type: [CategoryResponseDto],
    description: 'Featured material categories',
  })
  featuredCategories!: CategoryResponseDto[];

  @ApiProperty({
    type: [CategoryResponseDto],
    description: 'Top categories by display order',
  })
  topCategories!: CategoryResponseDto[];

  @ApiProperty({ type: [ProductResponseDto] })
  featuredProducts!: ProductResponseDto[];

  @ApiProperty({ type: [ProductResponseDto] })
  bestSellingProducts!: ProductResponseDto[];

  @ApiProperty({ type: [ProductResponseDto] })
  recommendedProducts!: ProductResponseDto[];

  @ApiProperty({ type: [VideoResponseDto], description: 'Construction videos' })
  videos!: VideoResponseDto[];

  @ApiProperty({
    type: [AnnouncementResponseDto],
    description: 'Announcement strip',
  })
  announcements!: AnnouncementResponseDto[];

  @ApiProperty({ type: HomeQuickStatsDto })
  quickStats!: HomeQuickStatsDto;

  @ApiProperty({ type: [TestimonialResponseDto], description: 'Published customer testimonials' })
  testimonials!: TestimonialResponseDto[];

  @ApiPropertyOptional({ type: [BannerResponseDto], description: 'Bulk procurement promo banner' })
  bulkBanner?: BannerResponseDto[];

  @ApiPropertyOptional({ type: [BannerResponseDto], description: 'Emergency delivery promo banner' })
  emergencyBanner?: BannerResponseDto[];

  @ApiPropertyOptional({
    type: MembershipSummaryDto,
    nullable: true,
    description: 'Present when authenticated',
  })
  membership?: MembershipSummaryDto | null;

  @ApiPropertyOptional({
    type: LoyaltySummaryDto,
    nullable: true,
    description: 'Present when authenticated',
  })
  loyalty?: LoyaltySummaryDto | null;

  @ApiPropertyOptional({
    type: [OrderListItemDto],
    description: 'Recent orders — present when authenticated',
  })
  lastOrders?: OrderListItemDto[];
}
