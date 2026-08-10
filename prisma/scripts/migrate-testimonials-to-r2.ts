/**
 * Migrate Customer Testimonial videos + thumbnails into Cloudflare R2,
 * then update Testimonial rows to use permanent public CDN URLs.
 *
 *   npx tsx --env-file=.env prisma/scripts/migrate-testimonials-to-r2.ts
 */
import 'dotenv/config';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  createR2Client,
  getSignedObjectUrl,
  uploadFile,
  type R2Config,
} from '../../src/storage/r2';
import { MEDIA_FOLDERS } from '../../src/storage/media-folders';

const FRONTEND_VIDEOS = resolve(
  __dirname,
  '../../../Vikram-frontend/assets/videos',
);

const PUBLIC =
  (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '') ||
  'https://pub-27d923fc51bd45e38b833c532297d281.r2.dev';

/** Existing category images already in R2 — reuse as thumbnails (no duplicate upload). */
const R2_THUMBS = {
  cement: `${PUBLIC}/categories/20260804-63e4d6ac-category-cement.png`,
  bricks: `${PUBLIC}/categories/20260804-fbef8b9c-category-bricks.png`,
  steel: `${PUBLIC}/categories/20260804-a6faf494-category-steel.png`,
  sand: `${PUBLIC}/categories/20260804-c73acd89-category-sand.png`,
  aggregates: `${PUBLIC}/categories/20260804-963ac3d4-category-aggregates.png`,
  construction: `${PUBLIC}/categories/20260804-9bff8f92-category-grey-fill-sand.png`,
} as const;

type MigrateSpec = {
  customerName: string;
  localVideo: string;
  thumbnailUrl: string;
  city?: string;
};

const SPECS: MigrateSpec[] = [
  {
    customerName: 'Amit Sharma',
    localVideo: 'cement.mp4',
    thumbnailUrl: R2_THUMBS.cement,
    city: 'Mumbai',
  },
  {
    customerName: 'Rajesh Mehta',
    localVideo: 'cement2.mp4',
    thumbnailUrl: R2_THUMBS.cement,
    city: 'Mumbai',
  },
  {
    customerName: 'Suresh Patil',
    localVideo: 'bricks.mp4',
    thumbnailUrl: R2_THUMBS.bricks,
    city: 'Pune',
  },
  {
    customerName: 'Anil Sharma',
    localVideo: 'bricks2.mp4',
    thumbnailUrl: R2_THUMBS.steel,
    city: 'Delhi',
  },
  {
    customerName: 'Arjun Rathore',
    localVideo: 'landscape.mp4',
    thumbnailUrl: R2_THUMBS.sand,
    city: 'Jodhpur',
  },
  {
    customerName: 'Deepak Reddy',
    localVideo: 'unbeatable.mp4',
    thumbnailUrl: R2_THUMBS.aggregates,
    city: 'Hyderabad',
  },
];

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
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    for (const spec of SPECS) {
      const localPath = resolve(FRONTEND_VIDEOS, spec.localVideo);
      if (!existsSync(localPath)) {
        console.warn(`SKIP ${spec.customerName}: missing ${localPath}`);
        continue;
      }

      const row = await prisma.testimonial.findFirst({
        where: { customerName: spec.customerName, type: 'VIDEO' },
      });
      if (!row) {
        console.warn(`SKIP ${spec.customerName}: no VIDEO row in DB`);
        continue;
      }

      // Already on our R2 public host — keep unless forced
      if (
        row.videoUrl?.includes('r2.dev') ||
        row.videoUrl?.includes(config.bucketName)
      ) {
        console.log(
          `KEEP ${spec.customerName}: already on R2 (${row.videoUrl?.slice(0, 70)}...)`,
        );
        // Still refresh thumbnail to R2 category asset if needed
        if (!row.thumbnail?.includes('r2.dev')) {
          await prisma.testimonial.update({
            where: { id: row.id },
            data: { thumbnail: spec.thumbnailUrl, city: spec.city ?? row.city },
          });
          console.log(`  updated thumbnail → R2`);
        }
        continue;
      }

      const size = statSync(localPath).size;
      console.log(
        `UPLOAD ${spec.customerName}: ${spec.localVideo} (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );

      const uploaded = await uploadFile(client, config, localPath, {
        folder: MEDIA_FOLDERS.TESTIMONIALS,
        filename: `${spec.customerName.toLowerCase().replace(/\s+/g, '-')}-${spec.localVideo}`,
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
        console.warn('  R2_PUBLIC_URL empty — using signed URL');
      }

      await prisma.testimonial.update({
        where: { id: row.id },
        data: {
          videoUrl: publicUrl,
          thumbnail: spec.thumbnailUrl,
          city: spec.city ?? row.city,
          isPublished: true,
        },
      });

      console.log(`  key=${uploaded.key}`);
      console.log(`  videoUrl=${publicUrl}`);
      console.log(`  thumbnail=${spec.thumbnailUrl}`);
    }

    // IMAGE testimonials — point imageUrl at existing R2 category art when remote third-party
    const imageFixes = [
      {
        name: 'Priya Desai',
        imageUrl: R2_THUMBS.construction,
        city: 'Pune',
      },
      {
        name: 'Vikram Patel',
        imageUrl: R2_THUMBS.bricks,
        city: 'Ahmedabad',
      },
    ];
    for (const fix of imageFixes) {
      const row = await prisma.testimonial.findFirst({
        where: { customerName: fix.name, type: 'IMAGE' },
      });
      if (!row) continue;
      if (row.imageUrl?.includes('r2.dev')) {
        console.log(`KEEP image ${fix.name}`);
        continue;
      }
      await prisma.testimonial.update({
        where: { id: row.id },
        data: {
          imageUrl: fix.imageUrl,
          city: fix.city,
          isPublished: true,
        },
      });
      console.log(`UPDATED image ${fix.name} → ${fix.imageUrl}`);
    }

    console.log('\nDone. Admin + Customer App will read the same R2 URLs from DB.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
