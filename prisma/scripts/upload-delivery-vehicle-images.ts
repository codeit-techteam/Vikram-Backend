/**
 * Upload delivery vehicle photos to Cloudflare R2 and attach them to
 * DeliveryVehicleConfig so Admin + Customer App show the same images.
 *
 *   npm run media:upload-delivery-vehicles
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
import {
  DELIVERY_VEHICLE_DISPLAY_NAMES,
  DeliveryVehicleType,
  type DeliveryVehicleType as VehicleType,
} from '../../src/modules/delivery/delivery-pricing.constants';

const ASSET_DIR = resolve(__dirname, '../assets/delivery-vehicles');

const VEHICLE_ASSETS: Array<{
  vehicleType: VehicleType;
  file: string;
  displayName: string;
  priority: number;
}> = [
  {
    vehicleType: DeliveryVehicleType.BIKE,
    file: 'bike.png',
    displayName: DELIVERY_VEHICLE_DISPLAY_NAMES.BIKE,
    priority: 1,
  },
  {
    vehicleType: DeliveryVehicleType.E_LOADER,
    file: 'e-loader.png',
    displayName: DELIVERY_VEHICLE_DISPLAY_NAMES.E_LOADER,
    priority: 2,
  },
  {
    vehicleType: DeliveryVehicleType.THREE_WHEELER_LOADER,
    file: '3-wheeler-loader.png',
    displayName: DELIVERY_VEHICLE_DISPLAY_NAMES.THREE_WHEELER_LOADER,
    priority: 3,
  },
  {
    vehicleType: DeliveryVehicleType.PICK_UP_VAN,
    file: 'pick-up-van.png',
    displayName: DELIVERY_VEHICLE_DISPLAY_NAMES.PICK_UP_VAN,
    priority: 4,
  },
  {
    vehicleType: DeliveryVehicleType.FULL_TRUCK,
    file: 'full-truck-400.png',
    displayName: DELIVERY_VEHICLE_DISPLAY_NAMES.FULL_TRUCK,
    priority: 5,
  },
  {
    vehicleType: DeliveryVehicleType.HEAVY_LOADER,
    file: 'heavy-loader-600.png',
    displayName: DELIVERY_VEHICLE_DISPLAY_NAMES.HEAVY_LOADER,
    priority: 6,
  },
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
  const config = loadR2Config();
  const client = createR2Client(config);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log('--- Uploading delivery vehicle photos to R2 ---');
  for (const asset of VEHICLE_ASSETS) {
    const localPath = resolve(ASSET_DIR, asset.file);
    if (!existsSync(localPath)) {
      throw new Error(`Missing vehicle asset: ${localPath}`);
    }
    const uploaded = await uploadFile(client, config, localPath, {
      folder: MEDIA_FOLDERS.DELIVERY_VEHICLES,
      filename: asset.file.replace(/\.png$/i, '.jpg'),
      contentType: 'image/jpeg',
    });
    const existing = await prisma.deliveryVehicleConfig.findUnique({
      where: { vehicleType: asset.vehicleType },
    });
    if (existing) {
      await prisma.deliveryVehicleConfig.update({
        where: { vehicleType: asset.vehicleType },
        data: { imageUrl: uploaded.publicUrl },
      });
    } else {
      await prisma.deliveryVehicleConfig.create({
        data: {
          vehicleType: asset.vehicleType,
          displayName: asset.displayName,
          imageUrl: uploaded.publicUrl,
          priority: asset.priority,
          active: true,
          capacityUtilizationLimit: 100,
        },
      });
    }
    console.log(`  ${asset.vehicleType}: ${uploaded.publicUrl}`);
  }

  const rmc = await prisma.deliveryVehicleConfig.findUnique({
    where: { vehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER },
  });
  if (rmc && rmc.priority <= 6) {
    await prisma.deliveryVehicleConfig.update({
      where: { vehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER },
      data: { priority: 7 },
    });
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('\nDelivery vehicle photos attached.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
