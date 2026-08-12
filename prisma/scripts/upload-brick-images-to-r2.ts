/**
 * Upload brick grade images (A+ / B+ / Fly Ash) to Cloudflare R2 and point
 * ProductImage + bricks category at the public CDN URLs so Customer App,
 * Admin Catalog, and Hub inventory all stay in sync.
 *
 *   npm run media:upload-brick-images
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  createR2Client,
  uploadFile,
  type R2Config,
} from '../../src/storage/r2';
import { MEDIA_FOLDERS } from '../../src/storage/media-folders';

const FRONTEND_ASSETS = resolve(__dirname, '../../../Vikram-frontend/assets');

type BrickAssetKey =
  | 'red-a-plus'
  | 'red-b-plus'
  | 'grey-a-plus'
  | 'grey-b-plus'
  | 'category';

const ASSET_FILES: Record<BrickAssetKey, string> = {
  'red-a-plus': 'product-red-bricks-a-plus.png',
  'red-b-plus': 'product-red-bricks-b-plus.png',
  'grey-a-plus': 'product-grey-ash-bricks-a-plus.png',
  'grey-b-plus': 'product-grey-ash-bricks-b-plus.png',
  category: 'category-bricks.png',
};

/** productSlug → which uploaded asset to use */
const PRODUCT_ASSET_MAP: Record<string, BrickAssetKey> = {
  'red-bricks-a-plus': 'red-a-plus',
  'red-bricks': 'red-a-plus',
  'red-bricks-b-plus': 'red-b-plus',
  'grey-ash-bricks-a-plus': 'grey-a-plus',
  'grey-ash-bricks-a': 'grey-a-plus',
  'grey-ash-bricks-b-plus': 'grey-b-plus',
  'grey-flash-cement-bricks': 'grey-a-plus',
};

const ALT_BY_ASSET: Record<BrickAssetKey, string> = {
  'red-a-plus': 'Red Bricks Grade A+',
  'red-b-plus': 'Red Bricks Grade B+',
  'grey-a-plus': 'Fly Ash Bricks Grade A+',
  'grey-b-plus': 'Fly Ash Bricks Grade B+',
  category: 'Bricks',
};

function loadR2Config(): R2Config {
  const config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? 'bajriwala',
    publicUrl: process.env.R2_PUBLIC_URL || undefined,
    endpoint: process.env.R2_ENDPOINT || undefined,
  };
  if (!config.accessKeyId || !config.secretAccessKey || !config.publicUrl) {
    throw new Error('R2 credentials / R2_PUBLIC_URL missing in .env');
  }
  return config;
}

function resolveAsset(filename: string): string {
  const candidates = [
    resolve(FRONTEND_ASSETS, filename),
    resolve(FRONTEND_ASSETS, 'products', filename.replace(/^product-/, '')),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`Missing brick asset: ${filename}\nTried:\n${candidates.join('\n')}`);
  }
  return found;
}

async function main() {
  const config = loadR2Config();
  const client = createR2Client(config);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const uploadedUrls: Partial<Record<BrickAssetKey, string>> = {};

  console.log('--- Uploading brick images to R2 ---');
  for (const [key, filename] of Object.entries(ASSET_FILES) as [
    BrickAssetKey,
    string,
  ][]) {
    const localPath = resolveAsset(filename);
    const folder =
      key === 'category' ? MEDIA_FOLDERS.CATEGORIES : MEDIA_FOLDERS.PRODUCTS;
    const uploaded = await uploadFile(client, config, localPath, {
      folder,
      filename,
      contentType: 'image/png',
    });
    uploadedUrls[key] = uploaded.publicUrl;
    console.log(`  ${key}: ${uploaded.publicUrl}`);
  }

  console.log('\n--- Updating bricks category ---');
  const categoryUrl = uploadedUrls.category!;
  const categories = await prisma.category.findMany({
    where: { deletedAt: null, OR: [{ slug: 'bricks' }, { labelKey: 'bricks' }] },
    select: { id: true, slug: true, imageUrl: true, iconUrl: true },
  });
  for (const cat of categories) {
    await prisma.category.update({
      where: { id: cat.id },
      data: { imageUrl: categoryUrl, iconUrl: categoryUrl },
    });
    console.log(`  category ${cat.slug}: ${categoryUrl}`);
  }

  console.log('\n--- Updating brick product images ---');
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { slug: { in: Object.keys(PRODUCT_ASSET_MAP) } },
        { sku: { startsWith: 'BRK-' } },
        { productType: { in: ['RED_BRICKS', 'GREY_ASH_BRICKS', 'FLY_ASH_BRICKS'] } },
      ],
    },
    select: {
      id: true,
      slug: true,
      sku: true,
      name: true,
      grade: true,
      productType: true,
      images: {
        where: { deletedAt: null },
        select: { id: true, url: true, isPrimary: true },
        orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
      },
    },
  });

  for (const product of products) {
    let assetKey = PRODUCT_ASSET_MAP[product.slug];

    if (!assetKey) {
      const type = (product.productType ?? '').toUpperCase();
      const grade = (product.grade ?? '').toUpperCase();
      const isGrey =
        type.includes('GREY') || type.includes('FLY') || type.includes('ASH');
      const isBPlus = grade.includes('B');
      if (isGrey) {
        assetKey = isBPlus ? 'grey-b-plus' : 'grey-a-plus';
      } else {
        assetKey = isBPlus ? 'red-b-plus' : 'red-a-plus';
      }
    }

    const publicUrl = uploadedUrls[assetKey];
    if (!publicUrl) {
      console.warn(`  skip ${product.slug}: no URL for ${assetKey}`);
      continue;
    }

    const alt = ALT_BY_ASSET[assetKey];
    const primary = product.images.find((i) => i.isPrimary) ?? product.images[0];

    if (!primary) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: publicUrl,
          altText: alt,
          isPrimary: true,
          displayOrder: 0,
        },
      });
      console.log(`  + ${product.slug} → ${assetKey}`);
    } else {
      await prisma.productImage.update({
        where: { id: primary.id },
        data: { url: publicUrl, altText: alt, isPrimary: true },
      });
      // Soft-delete extras so galleries don't show stale placeholders
      const extras = product.images.filter((i) => i.id !== primary.id);
      if (extras.length) {
        await prisma.productImage.updateMany({
          where: { id: { in: extras.map((i) => i.id) } },
          data: { deletedAt: new Date() },
        });
      }
      console.log(`  ✓ ${product.slug} → ${assetKey}`);
    }
  }

  console.log('\nDone. Brick images are on R2 and synced in DB.');
  console.log('App / Admin / Hub all read ProductImage.url — restart API if Redis cache is stale.');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
