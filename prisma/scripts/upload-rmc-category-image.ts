/**
 * Upload Bajriwala RMC mixer image to Cloudflare R2 and point the RMC category
 * (and RMC product images) at the public CDN URL so Customer App / Admin / Hub stay in sync.
 *
 *   npx tsx --env-file=.env prisma/scripts/upload-rmc-category-image.ts
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

const LOCAL_CANDIDATES = [
  resolve(__dirname, '../../../Vikram-frontend/assets/category-rmc.png'),
  resolve(__dirname, '../assets/category-rmc.png'),
];

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

async function main() {
  const localPath = LOCAL_CANDIDATES.find((p) => existsSync(p));
  if (!localPath) {
    throw new Error(
      `RMC image not found. Expected one of:\n${LOCAL_CANDIDATES.join('\n')}`,
    );
  }

  const config = loadR2Config();
  const client = createR2Client(config);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log(`Uploading ${localPath} → R2 folder "${MEDIA_FOLDERS.CATEGORIES}"…`);
  const uploaded = await uploadFile(client, config, localPath, {
    folder: MEDIA_FOLDERS.CATEGORIES,
    filename: 'category-rmc.png',
    contentType: 'image/png',
  });
  const publicUrl = uploaded.publicUrl;
  console.log(`Uploaded: ${publicUrl}`);

  const categories = await prisma.category.findMany({
    where: {
      deletedAt: null,
      OR: [{ slug: 'rmc' }, { slug: 'steel' }, { labelKey: 'rmc' }],
    },
    select: { id: true, slug: true, name: true, imageUrl: true, iconUrl: true },
  });

  if (categories.length === 0) {
    console.warn('No RMC/steel category row found — creating rmc category.');
    const created = await prisma.category.create({
      data: {
        slug: 'rmc',
        name: 'RMC',
        nameHi: 'आरएमसी',
        labelKey: 'rmc',
        description: 'Ready Mix Concrete',
        imageUrl: publicUrl,
        iconUrl: publicUrl,
        displayOrder: 2,
        priority: 94,
        isFeatured: true,
        isVisible: true,
      },
    });
    console.log(`Created category ${created.id}`);
  } else {
    for (const cat of categories) {
      await prisma.category.update({
        where: { id: cat.id },
        data: {
          slug: 'rmc',
          name: 'RMC',
          nameHi: 'आरएमसी',
          labelKey: 'rmc',
          description: 'Ready Mix Concrete',
          imageUrl: publicUrl,
          iconUrl: publicUrl,
          isVisible: true,
        },
      });
      console.log(
        `Updated category ${cat.slug} (${cat.id}): ${cat.imageUrl ?? '(empty)'} → ${publicUrl}`,
      );
    }
  }

  const rmcCategory = await prisma.category.findFirst({
    where: { slug: 'rmc', deletedAt: null },
    select: { id: true },
  });

  if (rmcCategory) {
    const products = await prisma.product.findMany({
      where: {
        categoryId: rmcCategory.id,
        deletedAt: null,
        entityStatus: 'ACTIVE',
      },
      select: {
        id: true,
        slug: true,
        sku: true,
        images: {
          where: { deletedAt: null },
          select: { id: true, url: true, isPrimary: true },
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
        },
      },
    });

    for (const product of products) {
      const primary = product.images[0];
      const needsImage =
        !primary ||
        !primary.url.startsWith('http') ||
        primary.url.includes('steel') ||
        primary.url.includes('/assets/');

      if (!primary) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: publicUrl,
            altText: 'RMC',
            isPrimary: true,
            displayOrder: 0,
          },
        });
        console.log(`Added primary image for product ${product.slug}`);
      } else if (needsImage) {
        await prisma.productImage.update({
          where: { id: primary.id },
          data: { url: publicUrl, altText: 'RMC' },
        });
        console.log(
          `Updated product image ${product.slug}: ${primary.url} → ${publicUrl}`,
        );
      }
    }
  }

  console.log('\nDone. RMC category image is on R2 and synced in DB.');
  console.log('Restart API or invalidate category cache if Redis is enabled.');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
