export class DeliveryPromotionCtaDto {
  enabled!: boolean;
  label!: string | null;
  type!: string | null;
  value!: string | null;
}

export class DeliveryPromotionDto {
  id!: string;
  title!: string;
  subtitle!: string | null;
  badge!: string | null;
  bannerImage!: string;
  mobileBannerImage!: string | null;
  desktopBannerImage!: string | null;
  placement!: string;
  cta!: DeliveryPromotionCtaDto;
  priority!: number;
  startAt!: Date | null;
  endAt!: Date | null;
  targetAudience!: string;
}

export class CmsDeliveryPromotionDto extends DeliveryPromotionDto {}
