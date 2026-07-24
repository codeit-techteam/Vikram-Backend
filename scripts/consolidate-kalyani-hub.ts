/**
 * Consolidate duplicate Kalyani hubs into a single operational hub.
 * Prefer the Admin-provisioned hub (HUB-KAL-001) if present; otherwise HUB-KAL-01.
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const kalyaniHubs = await prisma.hub.findMany({
    where: {
      deletedAt: null,
      OR: [
        { code: { startsWith: 'HUB-KAL' } },
        { city: { equals: 'Kalyani', mode: 'insensitive' } },
        { pincode: '741235' },
      ],
    },
    include: {
      users: { where: { deletedAt: null } },
      _count: { select: { orders: true, inventory: true, drivers: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (kalyaniHubs.length === 0) {
    console.log('No Kalyani hubs found.');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Prefer admin-provisioned code, else the one with a manager named from admin wizard, else most inventory
  const primary =
    kalyaniHubs.find((h) => h.code === 'HUB-KAL-001') ||
    kalyaniHubs.find((h) => h.users.some((u) => u.employeeId === 'rahul.sharma')) ||
    kalyaniHubs.find((h) => h.code === 'HUB-KAL-01') ||
    kalyaniHubs.sort((a, b) => b._count.inventory - a._count.inventory)[0];

  console.log(
    `Primary hub: ${primary.code} (${primary.id}) inventory=${primary._count.inventory} orders=${primary._count.orders}`,
  );

  for (const hub of kalyaniHubs) {
    if (hub.id === primary.id) continue;
    console.log(`Merging ${hub.code} (${hub.id}) → ${primary.code}`);

    // Move orders
    const movedOrders = await prisma.order.updateMany({
      where: { hubId: hub.id },
      data: { hubId: primary.id },
    });
    console.log(`  moved orders: ${movedOrders.count}`);

    // Move users (skip employeeId conflicts by updating hubId)
    for (const user of hub.users) {
      const conflict = await prisma.hubUser.findFirst({
        where: {
          hubId: primary.id,
          employeeId: user.employeeId,
          deletedAt: null,
        },
      });
      if (conflict) {
        await prisma.hubUser.update({
          where: { id: user.id },
          data: { isActive: false, deletedAt: new Date() },
        });
        console.log(`  deactivated duplicate user ${user.employeeId}`);
      } else {
        await prisma.hubUser.update({
          where: { id: user.id },
          data: { hubId: primary.id },
        });
        console.log(`  moved user ${user.employeeId}`);
      }
    }

    // Move drivers (clear vehicle links first if needed)
    const drivers = await prisma.driver.findMany({ where: { hubId: hub.id } });
    for (const driver of drivers) {
      await prisma.driver.update({
        where: { id: driver.id },
        data: { hubId: primary.id, vehicleId: null },
      });
    }
    console.log(`  moved drivers: ${drivers.length}`);

    // Move vehicles
    const vehicles = await prisma.vehicle.updateMany({
      where: { hubId: hub.id },
      data: { hubId: primary.id },
    });
    console.log(`  moved vehicles: ${vehicles.count}`);

    // Merge inventory: add available/reserved into primary, then remove source rows
    const sourceInv = await prisma.hubInventory.findMany({ where: { hubId: hub.id } });
    for (const row of sourceInv) {
      const existing = await prisma.hubInventory.findUnique({
        where: {
          hubId_productId: { hubId: primary.id, productId: row.productId },
        },
      });
      if (existing) {
        await prisma.hubInventory.update({
          where: { id: existing.id },
          data: {
            availableQty: existing.availableQty + row.availableQty,
            reservedQty: existing.reservedQty + row.reservedQty,
          },
        });
        await prisma.hubInventory.delete({ where: { id: row.id } });
      } else {
        await prisma.hubInventory.update({
          where: { id: row.id },
          data: { hubId: primary.id },
        });
      }
    }
    console.log(`  merged inventory rows: ${sourceInv.length}`);

    // Move notifications
    await prisma.hubNotification.updateMany({
      where: { hubId: hub.id },
      data: { hubId: primary.id },
    });

    // Deactivate + soft-delete duplicate hub
    await prisma.hub.update({
      where: { id: hub.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        name: `${hub.name} (merged)`,
      },
    });
    console.log(`  soft-deleted ${hub.code}`);
  }

  // Ensure primary is active with correct coverage
  await prisma.hub.update({
    where: { id: primary.id },
    data: {
      isActive: true,
      name: 'Kalyani Hub',
      city: 'Kalyani',
      state: 'West Bengal',
      pincode: '741235',
      serviceRadiusKm: 15,
      coveragePincodes: ['741235', '741245', '741246', '741247', '741248'],
      latitude: 22.9751,
      longitude: 88.4345,
    },
  });

  // Ensure seed manager credentials work on primary hub
  const hubPasswordHash = (
    await import('bcrypt')
  ).hashSync('123456', 10);

  await prisma.hubUser.upsert({
    where: { employeeId: 'hubmanager01' },
    update: {
      hubId: primary.id,
      fullName: 'Rahul Sharma',
      passwordHash: hubPasswordHash,
      role: 'HUB_MANAGER',
      isActive: true,
      deletedAt: null,
    },
    create: {
      employeeId: 'hubmanager01',
      email: 'rahul.sharma@hubops.com',
      passwordHash: hubPasswordHash,
      fullName: 'Rahul Sharma',
      phone: '9876500001',
      role: 'HUB_MANAGER',
      hubId: primary.id,
    },
  });

  // Ensure products have inventory on primary
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  for (const product of products) {
    await prisma.hubInventory.upsert({
      where: {
        hubId_productId: { hubId: primary.id, productId: product.id },
      },
      update: {},
      create: {
        hubId: primary.id,
        productId: product.id,
        availableQty: 500,
        reservedQty: 0,
        lowStockThreshold: 20,
      },
    });
  }

  const pending = await prisma.order.count({
    where: {
      hubId: primary.id,
      deletedAt: null,
      orderStatus: {
        in: ['PENDING', 'CONFIRMED', 'HUB_ASSIGNED', 'AWAITING_HUB_ALLOCATION'],
      },
    },
  });
  const todays = await prisma.order.count({
    where: {
      hubId: primary.id,
      deletedAt: null,
      createdAt: {
        gte: (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        })(),
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        primaryHubId: primary.id,
        primaryCode: primary.code,
        pendingOrders: pending,
        todaysOrders: todays,
        inventory: await prisma.hubInventory.count({ where: { hubId: primary.id } }),
        managers: await prisma.hubUser.findMany({
          where: { hubId: primary.id, role: 'HUB_MANAGER', deletedAt: null },
          select: { employeeId: true, fullName: true },
        }),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
