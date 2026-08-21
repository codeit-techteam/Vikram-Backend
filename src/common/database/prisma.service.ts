import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../../generated/prisma/client';
import {
  buildPgPoolConfig,
  classifyDatabaseError,
  formatDatabaseDiagnostic,
  parseDatabaseUrlMeta,
  resolveDatabaseUrlSourceFromEnv,
  type DatabaseUrlMeta,
} from './postgres-url';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private readonly nodeEnv: string;
  private readonly urlMeta: DatabaseUrlMeta;
  private readonly urlSource: string;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('database.url');
    const nodeEnv = configService.get<string>('app.env', 'development');
    const urlSource =
      resolveDatabaseUrlSourceFromEnv(process.env) ?? 'DATABASE_URL';
    const poolConfig = buildPgPoolConfig({
      databaseUrl,
      max: configService.get<number>('database.poolMax', 10),
      idleTimeoutMillis: configService.get<number>(
        'database.poolIdleTimeoutMs',
        30000,
      ),
      connectionTimeoutMillis: configService.get<number>(
        'database.connectionTimeoutMs',
        nodeEnv === 'production' ? 15000 : 5000,
      ),
      nodeEnv,
      caCert: configService.get<string>('database.caCert'),
    });
    const { schema, ...pgConfig } = poolConfig;
    const pool = new Pool(pgConfig);

    super({ adapter: new PrismaPg(pool, { schema }) });
    this.pool = pool;
    this.nodeEnv = nodeEnv;
    this.urlMeta = parseDatabaseUrlMeta(databaseUrl);
    this.urlSource = urlSource;

    this.logger.log(
      `PostgreSQL pool configured source=${urlSource} host=${this.urlMeta.host} port=${this.urlMeta.port} ` +
        `db=${this.urlMeta.database} sslmode=${this.urlMeta.sslmode ?? 'default'} ` +
        `ssl=${Boolean(pgConfig.ssl)} env=${this.nodeEnv}`,
    );

    this.pool.on('error', (error: Error) => {
      this.logConnectionFailure(error);
    });
  }

  getConnectionMeta(): DatabaseUrlMeta {
    return this.urlMeta;
  }

  getConnectionSource(): string {
    return this.urlSource;
  }

  async onModuleInit(): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        await this.$queryRaw`SELECT 1`;
        this.logger.log(
          `PostgreSQL connection established source=${this.urlSource} host=${this.urlMeta.host} port=${this.urlMeta.port} sslmode=${this.urlMeta.sslmode ?? 'default'}`,
        );
        return;
      } catch (error) {
        if (attempt < maxAttempts) {
          this.logger.warn(
            `PostgreSQL connect attempt ${attempt}/${maxAttempts} failed source=${this.urlSource} host=${this.urlMeta.host} — retrying`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        // Do not crash the process (platform health probes need the HTTP server),
        // but never treat this as a successful connection.
        this.logConnectionFailure(error);
        this.logger.error(
          'DATABASE_CONNECTION_FAILED at startup — login and DB-backed routes will return 503 until connectivity is restored. ' +
            'Check Trusted Sources, bind DATABASE_PRIVATE_URL (VPC) or DATABASE_URL, and DATABASE_CA_CERT.',
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('PostgreSQL connection closed');
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logConnectionFailure(error);
      return false;
    }
  }

  private logConnectionFailure(error: unknown): void {
    const diagnostic = classifyDatabaseError(error);
    this.logger.error(
      formatDatabaseDiagnostic(diagnostic, this.urlMeta, this.nodeEnv),
    );
  }
}
