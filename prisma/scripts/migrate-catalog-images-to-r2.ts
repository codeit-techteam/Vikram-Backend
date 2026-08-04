/**
 * Migrate legacy /assets/* image paths on Category + ProductImage to Cloudflare R2.
 *
 *   npm run media:migrate-catalog-images
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  createR2Client,
  uploadFile,
  type R2Config,
} from '../../src/storage/r2';
import { MEDIA_FOLDERS } from '../../src/storage/media-folders';

const FRONTEND_ASSETS = resolve(
  __dirname,
  '../../../Vikram-frontend/assets',
);

const cache = new Map<string, string>();

function isRemote(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function isLegacyAsset(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('assets/') ||
    trimmed.includes('/assets/')
  );
}

function resolveLocalFile(url: string): string | null {
  const cleaned = url.trim().replace(/^\/+/, '');
  // assets/category-cement.png or /assets/product-ultratech.png
  const relative = cleaned.startsWith('assets/')
    ? cleaned.slice('assets/'.length)
    : cleaned;
  const candidates = [
    resolve(FRONTEND_ASSETS, relative),
    resolve(FRONTEND_ASSETS, basename(relative)),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

async function migrateUrl(
  url: string,
  folder: string,
  config: R2Config,
  client: ReturnType<typeof createR2Client>,
): Promise<string | null> {
  if (isRemote(url)) return url;
  if (!isLegacyAsset(url)) return null;

  const cached = cache.get(url);
  if (cached) return cached;

  const localPath = resolveLocalFile(url);
  if (!localPath) {
    console.warn(`  missing local file for ${url}`);
    return null;
  }

  const uploaded = await uploadFile(client, config, localPath, {
    folder,
    filename: basename(localPath),
    contentType: 'image/png',
  });
  cache.set(url, uploaded.publicUrl);
  console.log(`  ${url} → ${uploaded.publicUrl}`);
  return uploaded.publicUrl;
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

  if (!config.accessKeyId || !config.secretAccessKey || !config.publicUrl) {
    throw new Error('R2 credentials / R2_PUBLIC_URL missing');
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const client = createR2Client(config);

  let categoriesUpdated = 0;
  let imagesUpdated = 0;
  let offersUpdated = 0;
  let adsUpdated = 0;
  let bannersUpdated = 0;

  console.log('--- Categories ---');
  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    select: { id: true, imageUrl: true, iconUrl: true },
  });
  for (const cat of categories) {
    const nextImage = isLegacyAsset(cat.imageUrl)
      ? await migrateUrl(
          cat.imageUrl!,
          MEDIA_FOLDERS.CATEGORIES,
          config,
          client,
        )
      : null;
    const nextIcon = isLegacyAsset(cat.iconUrl)
      ? await migrateUrl(cat.iconUrl!, MEDIA_FOLDERS.CATEGORIES, config, client)
      : null;
    if (nextImage || nextIcon) {
      await prisma.category.update({
        where: { id: cat.id },
        data: {
          ...(nextImage ? { imageUrl: nextImage } : {}),
          ...(nextIcon ? { iconUrl: nextIcon } : {}),
        },
      });
      categoriesUpdated += 1;
    }
  }

  console.log('--- Product Images ---');
  const images = await prisma.productImage.findMany({
    where: { deletedAt: null },
    select: { id: true, url: true },
  });
  for (const img of images) {
    if (!isLegacyAsset(img.url)) continue;
    const next = await migrateUrl(
      img.url,
      MEDIA_FOLDERS.PRODUCTS,
      config,
      client,
    );
    if (!next) continue;
    await prisma.productImage.update({
      where: { id: img.id },
      data: { url: next },
    });
    imagesUpdated += 1;
  }

  console.log('--- Offers ---');
  const offers = await prisma.offer.findMany({
    where: { deletedAt: null },
    select: { id: true, imageUrl: true },
  });
  for (const offer of offers) {
    if (!isLegacyAsset(offer.imageUrl)) continue;
    const next = await migrateUrl(
      offer.imageUrl!,
      MEDIA_FOLDERS.OFFERS,
      config,
      client,
    );
    if (!next) continue;
    await prisma.offer.update({
      where: { id: offer.id },
      data: { imageUrl: next },
    });
    offersUpdated += 1;
  }

  console.log('--- Brand Ads ---');
  const ads = await prisma.advertisement.findMany({
    where: { deletedAt: null },
    select: { id: true, imageUrl: true, logoUrl: true },
  });
  for (const ad of ads) {
    const nextImage = isLegacyAsset(ad.imageUrl)
      ? await migrateUrl(ad.imageUrl!, MEDIA_FOLDERS.BRANDS, config, client)
      : null;
    const nextLogo = isLegacyAsset(ad.logoUrl)
      ? await migrateUrl(ad.logoUrl!, MEDIA_FOLDERS.BRANDS, config, client)
      : null;
    if (nextImage || nextLogo) {
      await prisma.advertisement.update({
        where: { id: ad.id },
        data: {
          ...(nextImage ? { imageUrl: nextImage } : {}),
          ...(nextLogo ? { logoUrl: nextLogo } : {}),
        },
      });
      adsUpdated += 1;
    }
  }

  console.log('--- Banners ---');
  const banners = await prisma.banner.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      imageUrl: true,
      mobileUrl: true,
      tabletUrl: true,
      desktopUrl: true,
      thumbnailUrl: true,
    },
  });
  for (const banner of banners) {
    const patch: Record<string, string> = {};
    for (const [field, value] of Object.entries({
      imageUrl: banner.imageUrl,
      mobileUrl: banner.mobileUrl,
      tabletUrl: banner.tabletUrl,
      desktopUrl: banner.desktopUrl,
      thumbnailUrl: banner.thumbnailUrl,
    })) {
      if (!isLegacyAsset(value)) continue;
      const next = await migrateUrl(
        value!,
        MEDIA_FOLDERS.BANNERS,
        config,
        client,
      );
      if (next) patch[field] = next;
    }
    if (Object.keys(patch).length > 0) {
      await prisma.banner.update({ where: { id: banner.id }, data: patch });
      bannersUpdated += 1;
    }
  }

  console.log('\nDone.', {
    categoriesUpdated,
    imagesUpdated,
    offersUpdated,
    adsUpdated,
    bannersUpdated,
    uniqueUploads: cache.size,
  });

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
