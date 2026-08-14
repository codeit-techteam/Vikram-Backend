import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  BannerTargetAudience,
  DeliveryPromotionExhaustedBehavior,
  DeliveryPromotionPlacement,
  EntityStatus,
  PrismaClient,
  Visibility,
} from '../generated/prisma/client';
import {
  createR2Client,
  getPublicUrl,
  type R2Config,
} from '../src/storage/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const SEED_SLUG = 'home-top-3-free-bike-deliveries';
const SEED_ASSET = join(__dirname, 'seed-assets', 'free-bike-deliveries.jpg');
const SEED_OBJECT_KEY = 'delivery-promotions/free-bike-deliveries.jpg';

function r2ConfigFromEnv(): R2Config | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const bucketName = process.env.R2_BUCKET_NAME ?? 'bajriwala';
  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: process.env.R2_PUBLIC_URL || undefined,
    endpoint,
  };
}

async function uploadSeedBanner(): Promise<string> {
  if (!existsSync(SEED_ASSET)) {
    console.warn(`Delivery promotion seed asset missing: ${SEED_ASSET}`);
    return '';
  }

  const config = r2ConfigFromEnv();
  if (!config) {
    console.warn(
      'R2 is not configured — delivery promotion will be seeded without a banner URL. Upload the yellow banner from Admin CMS.',
    );
    return '';
  }

  const body = readFileSync(SEED_ASSET);
  const client = createR2Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: SEED_OBJECT_KEY,
      Body: body,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return getPublicUrl(config, SEED_OBJECT_KEY);
}

export async function seedDeliveryPromotion(prisma: PrismaClient): Promise<void> {
  const bannerImage = await uploadSeedBanner().catch((error) => {
    console.warn(
      `Could not upload delivery promotion banner to R2: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return '';
  });

  const existing = await prisma.deliveryPromotion.findUnique({
    where: { slug: SEED_SLUG },
  });

  const data = {
    name: '3 Free Bike Deliveries',
    description:
      'Home-top delivery promotion. Does not grant the benefit — delivery engine remains source of truth.',
    headline: 'Get 3 FREE Bike deliveries',
    subtitle: 'on your first three orders',
    badge: 'FREE DELIVERY',
    remainingHeadline: '{count} FREE Bike {delivery} remaining',
    exhaustedHeadline: null,
    exhaustedBehavior: DeliveryPromotionExhaustedBehavior.HIDE,
    bannerImage: bannerImage || existing?.bannerImage || '',
    mobileBannerImage: bannerImage || existing?.mobileBannerImage || '',
    desktopBannerImage: bannerImage || existing?.desktopBannerImage || null,
    placement: DeliveryPromotionPlacement.HOME_TOP_DELIVERY_PROMOTION,
    targetAudience: BannerTargetAudience.FREE_BIKE_REMAINING,
    status: EntityStatus.ACTIVE,
    visibility: Visibility.PUBLIC,
    isVisible: true,
    priority: 10,
    ctaEnabled: false,
    ctaLabel: null,
    ctaType: 'NONE',
    ctaValue: null,
    startsAt: new Date('2026-08-13T00:00:00+05:30'),
    endsAt: null,
  };

  if (existing) {
    await prisma.deliveryPromotion.update({
      where: { id: existing.id },
      data: {
        ...data,
        bannerImage: bannerImage || existing.bannerImage,
        mobileBannerImage: bannerImage || existing.mobileBannerImage,
        desktopBannerImage: bannerImage || existing.desktopBannerImage,
      },
    });
  } else {
    await prisma.deliveryPromotion.create({
      data: {
        slug: SEED_SLUG,
        ...data,
      },
    });
  }

  await prisma.banner.updateMany({
    where: {
      slug: 'home-promo-3-free-bike-deliveries',
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      isVisible: false,
      status: EntityStatus.INACTIVE,
    },
  });
}
