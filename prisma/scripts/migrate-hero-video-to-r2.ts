/**
 * One-time migration: ensure delivery-hero.mp4 is on Cloudflare R2 and
 * CMS Video + Banner point at a real object (reuse existing R2 key when present).
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
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {
  createR2Client,
  getPublicUrl,
  getSignedObjectUrl,
  uploadFile,
  type R2Config,
} from '../../src/storage/r2';
import { MEDIA_FOLDERS } from '../../src/storage/media-folders';

const LOCAL_VIDEO = resolve(
  __dirname,
  '../../../Vikram-frontend/assets/videos/delivery-hero.mp4',
);

async function findExistingHeroKey(
  client: ReturnType<typeof createR2Client>,
  bucket: string,
): Promise<string | null> {
  const preferred = 'videos/home/20260804-044182e7-delivery-hero.mp4';
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: preferred }),
    );
    return preferred;
  } catch {
    // fall through to list
  }

  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${MEDIA_FOLDERS.VIDEOS_HOME}/`,
    }),
  );
  const matches = (listed.Contents || [])
    .map((o) => o.Key)
    .filter((k): k is string => Boolean(k?.includes('delivery-hero')))
    .sort();
  return matches.at(-1) ?? null;
}

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

  const client = createR2Client(config);

  let storageKey = await findExistingHeroKey(client, config.bucketName);
  let publicUrl: string;
  let size = 0;
  let mimeType = 'video/mp4';

  if (storageKey) {
    console.log(`Reusing existing R2 object: ${storageKey}`);
    publicUrl = config.publicUrl
      ? getPublicUrl(config, storageKey)
      : await getSignedObjectUrl(client, config.bucketName, storageKey);
  } else {
    if (!existsSync(LOCAL_VIDEO)) {
      throw new Error(`Local video not found: ${LOCAL_VIDEO}`);
    }
    size = statSync(LOCAL_VIDEO).size;
    console.log(
      `Uploading ${LOCAL_VIDEO} (${(size / 1024 / 1024).toFixed(2)} MB)...`,
    );
    const uploaded = await uploadFile(client, config, LOCAL_VIDEO, {
      folder: MEDIA_FOLDERS.VIDEOS_HOME,
      filename: 'delivery-hero.mp4',
      contentType: 'video/mp4',
      size,
    });
    storageKey = uploaded.key;
    size = uploaded.size;
    mimeType = uploaded.mimeType;
    publicUrl = uploaded.publicUrl;
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
  }

  if (config.publicUrl) {
    publicUrl = getPublicUrl(config, storageKey);
  }

  console.log(`key=${storageKey}`);
  console.log(`URL=${publicUrl.slice(0, 100)}...`);

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
      storageKey,
      videoUrl: publicUrl,
      publicUrl,
      mimeType,
      ...(size > 0 ? { sizeBytes: BigInt(size) } : {}),
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
      where: { slug: bannerSlug },
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
      deletedAt: null,
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
