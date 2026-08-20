import 'dotenv/config';
import { defineConfig } from 'prisma/config';

function resolveDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return undefined;
  }

  if (databaseUrl.includes('${') || !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(databaseUrl)) {
    throw new Error(
      'DATABASE_URL is not a valid PostgreSQL connection string. ' +
        'It must start with postgresql:// (or postgres://). ' +
        'On DigitalOcean App Platform, either paste the managed database Connection string, ' +
        'or attach the database to this app and set DATABASE_URL to ${<db-component-name>.DATABASE_URL} with both braces. ' +
        'Unresolved ${...} values are passed through literally and Prisma rejects them (P1013).',
    );
  }

  return databaseUrl;
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
