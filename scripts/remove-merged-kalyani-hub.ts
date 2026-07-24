/**
 * Soft-delete the merged duplicate Kalyani hub so Admin only shows the live hub.
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const merged = await prisma.hub.findFirst({
    where: {
      OR: [
        { code: 'HUB-KAL-01' },
        { name: { contains: '(merged)', mode: 'insensitive' } },
      ],
      deletedAt: null,
    },
  });

  if (!merged) {
    console.log('No merged hub to remove.');
  } else {
    // Ensure no managers/orders left on merged hub
    const primary = await prisma.hub.findFirst({
      where: { code: 'HUB-KAL-001', deletedAt: null },
    });

    if (primary) {
      await prisma.order.updateMany({
        where: { hubId: merged.id },
        data: { hubId: primary.id },
      });
      await prisma.hubUser.updateMany({
        where: { hubId: merged.id, deletedAt: null },
        data: { hubId: primary.id },
      });
    }

    await prisma.hub.update({
      where: { id: merged.id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        name: merged.name.includes('(merged)')
          ? merged.name
          : `${merged.name} (merged)`,
      },
    });
    console.log(`Soft-deleted merged hub ${merged.code} (${merged.id})`);
  }

  const primary = await prisma.hub.findFirst({
    where: { code: 'HUB-KAL-001', deletedAt: null },
    include: {
      users: {
        where: { role: 'HUB_MANAGER', deletedAt: null, isActive: true },
        select: { employeeId: true, fullName: true },
      },
      _count: { select: { orders: true } },
    },
  });

  console.log(
    JSON.stringify(
      {
        primary: primary
          ? {
              id: primary.id,
              code: primary.code,
              name: primary.name,
              isActive: primary.isActive,
              managers: primary.users,
              orders: primary._count.orders,
            }
          : null,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
