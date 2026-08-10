export class CmsBannerDto {
  id!: string;
  title!: string;
  subtitle!: string | null;
  buttonText!: string | null;
  buttonAction!: string | null;
  bannerType!: string;
  imageUrl!: string;
  mobileUrl?: string | null;
  tabletUrl?: string | null;
  desktopUrl?: string | null;
  videoUrl!: string | null;
  thumbnailUrl!: string | null;
  badge!: string | null;
  ctaColor?: string | null;
  backgroundColor?: string | null;
  priority!: number;
  displayOrder!: number;
  isActive!: boolean;
  startDate!: Date | null;
  endDate!: Date | null;
  linkUrl!: string | null;
  linkType!: string | null;
  linkTarget!: string | null;
  secondaryButtonText!: string | null;
  secondaryLinkUrl!: string | null;
  secondaryLinkType!: string | null;
  secondaryLinkTarget!: string | null;
  placement!: string;
}

export class CmsAdvertisementDto {
  id!: string;
  title!: string;
  brandName!: string;
  description!: string | null;
  imageUrl!: string;
  logoUrl?: string | null;
  buttonText!: string | null;
  redirectType!: string;
  redirectId!: string | null;
  displayOrder!: number;
  priority!: number;
  isActive!: boolean;
}

export class CmsTestimonialDto {
  id!: string;
  customerName!: string;
  designation!: string | null;
  city!: string | null;
  location!: string | null;
  rating!: number;
  review!: string | null;
  thumbnailUrl!: string | null;
  videoUrl!: string | null;
  profileImage!: string | null;
  imageUrl!: string | null;
  displayOrder!: number;
  featured!: boolean;
  isActive!: boolean;
  type!: string;
}

export class CmsPromotionDto {
  id!: string;
  title!: string;
  subtitle!: string | null;
  description!: string | null;
  imageUrl!: string | null;
  buttonText!: string | null;
  badge!: string | null;
  benefits!: string[] | null;
  redirectType!: string;
  redirectId!: string | null;
  cardType!: string;
  priority!: number;
  displayOrder!: number;
  isActive!: boolean;
}

export class CmsHomeSectionDto {
  id!: string;
  sectionType!: string;
  title!: string | null;
  subtitle!: string | null;
  displayOrder!: number;
  enabled!: boolean;
  apiSource!: string | null;
  layoutType!: string | null;
}

export class CmsOfferDto {
  id!: string;
  slug!: string;
  title!: string;
  description!: string | null;
  imageUrl!: string | null;
  discountLabel!: string | null;
  badge!: string | null;
  offerType!: string;
  displayOrder!: number;
  priority!: number;
  endsAt!: Date | null;
}

export class CmsQuickActionDto {
  id!: string;
  label!: string;
  iconUrl!: string | null;
  iconKey!: string | null;
  redirectType!: string;
  redirectId!: string | null;
  displayOrder!: number;
}

export class CmsEmergencyBannerDto {
  id!: string;
  title!: string;
  body!: string | null;
  imageUrl!: string | null;
  linkUrl!: string | null;
  linkTarget!: string | null;
  dismissible!: boolean;
}

export class CmsCategoryDto {
  id!: string;
  slug!: string;
  name!: string;
  nameHi!: string | null;
  description!: string | null;
  imageUrl!: string | null;
  iconUrl!: string | null;
  displayOrder!: number;
  isFeatured!: boolean;
}

export class CmsHomeResponseDto {
  sections!: CmsHomeSectionDto[];
  banners!: CmsBannerDto[];
  /** Alias for image hero carousel — same as banners filtered to HOME_HERO */
  heroBanners!: CmsBannerDto[];
  ads!: CmsAdvertisementDto[];
  /** Alias for brand ads / shop-from-catalogs cards */
  brandAdvertisements!: CmsAdvertisementDto[];
  /** Alias used by clients expecting catalogs[] */
  catalogs!: CmsAdvertisementDto[];
  categories!: CmsCategoryDto[];
  testimonials!: CmsTestimonialDto[];
  promotions!: CmsPromotionDto[];
  videoBanners!: CmsBannerDto[];
  /** Primary home hero video (newest published HOME_HERO_VIDEO) */
  heroVideo!: CmsBannerDto | null;
  offers!: CmsOfferDto[];
  quickActions!: CmsQuickActionDto[];
  emergencyBanner!: CmsEmergencyBannerDto | null;
  emergencyDelivery!: CmsPromotionDto | null;
  bulkProcurement!: CmsPromotionDto | null;
  priorityExpress!: CmsPromotionDto | null;
  membership!: CmsPromotionDto | null;
}
