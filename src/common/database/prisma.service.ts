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

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('database.url');
    const nodeEnv = configService.get<string>('app.env', 'development');
    const poolConfig = buildPgPoolConfig({
      databaseUrl,
      max: configService.get<number>('database.poolMax', 10),
      idleTimeoutMillis: configService.get<number>(
        'database.poolIdleTimeoutMs',
        30000,
      ),
      connectionTimeoutMillis: configService.get<number>(
        'database.connectionTimeoutMs',
        5000,
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

    this.logger.log(
      `PostgreSQL pool configured host=${this.urlMeta.host} port=${this.urlMeta.port} ` +
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

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.logger.log(
        `PostgreSQL connection established host=${this.urlMeta.host} port=${this.urlMeta.port} sslmode=${this.urlMeta.sslmode ?? 'default'}`,
      );
    } catch (error) {
      // Do not crash the process (platform health probes need the HTTP server),
      // but never treat this as a successful connection.
      this.logConnectionFailure(error);
      this.logger.error(
        'DATABASE_CONNECTION_FAILED at startup — login and DB-backed routes will return 503 until connectivity is restored. ' +
          'Check Trusted Sources, DATABASE_URL/DATABASE_PRIVATE_URL bind, and DATABASE_CA_CERT.',
      );
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
