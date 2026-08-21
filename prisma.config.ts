import 'dotenv/config';
import dns from 'node:dns';
import { defineConfig } from 'prisma/config';
import {
  applyPrismaEngineSsl,
  resolveCaCertificate,
  resolveDatabaseUrlFromEnv,
} from './src/common/database/postgres-url';

dns.setDefaultResultOrder('ipv4first');

function resolveDatabaseUrl(): string | undefined {
  // prisma generate runs at build time; DO bindables may be unset or literal ${...}.
  const databaseUrl = resolveDatabaseUrlFromEnv(process.env, {
    skipUnresolvedBindables: true,
  });

  if (!databaseUrl) {
    return undefined;
  }

  return applyPrismaEngineSsl(databaseUrl, resolveCaCertificate());
}

const databaseUrl = resolveDatabaseUrl();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Prisma 7 requires datasource.url for migrate, but prisma generate
  // must still work during DigitalOcean's build (no DATABASE_URL yet).
  ...(databaseUrl
    ? {
        datasource: {
          url: databaseUrl,
        },
      }
    : {}),
});
