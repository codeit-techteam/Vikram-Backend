/**
 * Repair CMS hero video + testimonial media URLs so Admin and Customer App
 * share the same playable Cloudflare R2 objects.
 *
 * - Points published HOME_HERO_VIDEO rows at an existing R2 delivery-hero object
 *   (fixes DB keys like cd4c8a66… that 404 while 044182e7… exists in the bucket)
 * - Rebuilds videoUrl/publicUrl from storageKey for all Video rows
 * - Clears broken Google sample testimonial video URLs
 *
 *   npm run media:repair-cms
 */
import 'dotenv/config';
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
  S3Client,
} from '@aws-sdk/client-s3';
import {
  createR2Client,
  getPublicUrl,
  type R2Config,
} from '../../src/storage/r2';
import { MEDIA_FOLDERS } from '../../src/storage/media-folders';

function isGoogleSample(url?: string | null): boolean {
  if (!url) return false;
  return (
    url.includes('commondatastorage.googleapis.com') ||
    url.includes('gtv-videos-bucket')
  );
}

async function objectExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function findDeliveryHeroKey(
  client: S3Client,
  bucket: string,
): Promise<string | null> {
  const preferred = 'videos/home/20260804-044182e7-delivery-hero.mp4';
  if (await objectExists(client, bucket, preferred)) {
    return preferred;
  }

  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${MEDIA_FOLDERS.VIDEOS_HOME}/`,
    }),
  );

  const matches = (listed.Contents || [])
    .map((obj) => obj.Key)
    .filter((key): key is string => Boolean(key?.includes('delivery-hero')))
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
  if (!config.publicUrl) {
    throw new Error('R2_PUBLIC_URL is required for permanent public media URLs');
  }

  const client = createR2Client(config);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const heroKey = await findDeliveryHeroKey(client, config.bucketName);
    if (!heroKey) {
      console.warn(
        'No delivery-hero object found under videos/home/. Upload via Admin Video Management first.',
      );
    } else {
      const publicUrl = getPublicUrl(config, heroKey);
      console.log(`Using R2 hero object: ${heroKey}`);
      console.log(`Public URL: ${publicUrl}`);

      // Demote other heroes, keep/create a single published HOME_HERO_VIDEO row.
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
        storageKey: heroKey,
        videoUrl: publicUrl,
        publicUrl,
        mimeType: 'video/mp4',
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
            data: { slug, ...videoData },
          });

      console.log(
        `Hero video id=${video.id} published=true storageKey=${video.storageKey}`,
      );

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
      console.log('Synced home-hero-video-banner');
    }

    // Rebuild absolute URLs from storageKey for every video row.
    const allVideos = await prisma.video.findMany({
      where: { deletedAt: null, storageKey: { not: null } },
    });
    for (const row of allVideos) {
      if (!row.storageKey) continue;
      const exists = await objectExists(
        client,
        config.bucketName,
        row.storageKey,
      );
      if (!exists) {
        console.warn(
          `MISSING R2 object for video ${row.id} key=${row.storageKey}`,
        );
        continue;
      }
      const url = getPublicUrl(config, row.storageKey);
      if (row.videoUrl === url && row.publicUrl === url) continue;
      await prisma.video.update({
        where: { id: row.id },
        data: { videoUrl: url, publicUrl: url },
      });
      console.log(`Rebuilt URL for video ${row.id} → ${url}`);
    }

    // Clear AccessDenied Google sample testimonial videos.
    const broken = await prisma.testimonial.findMany({
      where: { type: 'VIDEO' },
    });
    let cleared = 0;
    for (const row of broken) {
      if (!isGoogleSample(row.videoUrl)) continue;
      await prisma.testimonial.update({
        where: { id: row.id },
        data: { videoUrl: null },
      });
      cleared += 1;
      console.log(
        `Cleared Google sample videoUrl for ${row.customerName} (${row.id})`,
      );
    }
    if (cleared > 0) {
      console.log(
        `Cleared ${cleared} broken sample URL(s). Run: npm run media:migrate-testimonials`,
      );
    }

    console.log('\nDone. Restart backend (or wait for CMS cache TTL) and refresh Admin + App.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
