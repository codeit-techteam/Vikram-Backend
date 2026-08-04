/**
 * One-time migration: upload local delivery-hero.mp4 to Cloudflare R2,
 * persist CMS Video + Banner metadata.
 *
 *   npm run media:migrate-hero-video
 */
import 'dotenv/config';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import {
  EntityStatus,
  PrismaClient,
  Visibility,
} from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  createR2Client,
  getSignedObjectUrl,
  uploadFile,
  type R2Config,
} from '../../src/storage/r2';
import { MEDIA_FOLDERS } from '../../src/storage/media-folders';

const LOCAL_VIDEO = resolve(
  __dirname,
  '../../../Vikram-frontend/assets/videos/delivery-hero.mp4',
);

async function main() {
  const config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? 'bajriwala',
    publicUrl: process.env.R2_PUBLIC_URL || undefined,
    endpoint: process.env.R2_ENDPOINT || undefined,
  };

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('Missing R2 credentials in env');
  }
  if (!existsSync(LOCAL_VIDEO)) {
    throw new Error(`Local video not found: ${LOCAL_VIDEO}`);
  }

  const size = statSync(LOCAL_VIDEO).size;
  console.log(
    `Uploading ${LOCAL_VIDEO} (${(size / 1024 / 1024).toFixed(2)} MB)...`,
  );

  const client = createR2Client(config);
  const uploaded = await uploadFile(client, config, LOCAL_VIDEO, {
    folder: MEDIA_FOLDERS.VIDEOS_HOME,
    filename: 'delivery-hero.mp4',
    contentType: 'video/mp4',
    size,
  });

  let publicUrl = uploaded.publicUrl;
  if (!config.publicUrl) {
    publicUrl = await getSignedObjectUrl(
      client,
      config.bucketName,
      uploaded.key,
    );
    console.warn(
      'R2_PUBLIC_URL is empty — stored a signed URL (expires ~7 days). Enable public R2.dev / custom domain ASAP.',
    );
  }

  console.log(`Uploaded key=${uploaded.key}`);
  console.log(`URL=${publicUrl.slice(0, 80)}...`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.video.updateMany({
      where: {
        deletedAt: null,
        placement: { in: ['HOME', 'HOME_HERO_VIDEO'] },
      },
      data: {
        published: false,
        isVisible: false,
        status: EntityStatus.INACTIVE,
      },
    });

    const slug = 'home-hero-delivery-r2';
    const existing = await prisma.video.findFirst({
      where: { slug, deletedAt: null },
    });

    const videoData = {
      title: 'Materials Delivered Right to Your Site',
      description: 'Real-time tracking, verified drivers, zero delays.',
      storageKey: uploaded.key,
      videoUrl: publicUrl,
      publicUrl,
      mimeType: 'video/mp4',
      sizeBytes: BigInt(uploaded.size),
      placement: 'HOME_HERO_VIDEO' as const,
      ctaLabel: 'Shop Now',
      linkUrl: '/(tabs)/catalog',
      priority: 100,
      displayOrder: 0,
      published: true,
      isVisible: true,
      status: EntityStatus.ACTIVE,
      visibility: Visibility.PUBLIC,
    };

    const video = existing
      ? await prisma.video.update({
          where: { id: existing.id },
          data: videoData,
        })
      : await prisma.video.create({
          data: {
            slug,
            ...videoData,
          },
        });

    const bannerSlug = 'home-hero-video-banner';
    const banner = await prisma.banner.findFirst({
      where: { slug: bannerSlug, deletedAt: null },
    });
    const bannerData = {
      title: video.title,
      subtitle: video.description,
      imageUrl:
        'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80',
      videoUrl: publicUrl,
      thumbnailUrl: null as string | null,
      bannerType: 'VIDEO' as const,
      placement: 'HOME_PROMO' as const,
      ctaLabel: 'Shop Now',
      linkUrl: '/(tabs)/catalog',
      linkType: 'ROUTE',
      linkTarget: '/(tabs)/catalog',
      isVisible: true,
      status: EntityStatus.ACTIVE,
      priority: 100,
      displayOrder: 0,
    };

    if (banner) {
      await prisma.banner.update({
        where: { id: banner.id },
        data: bannerData,
      });
    } else {
      await prisma.banner.create({
        data: { slug: bannerSlug, ...bannerData },
      });
    }

    console.log(
      `DB video id=${video.id} published=true placement=HOME_HERO_VIDEO`,
    );
    console.log('Done.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
