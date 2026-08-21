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

    this.pool.on('error', (error: Error) => {
      this.logConnectionFailure(error);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.logger.log(
        `PostgreSQL connection established host=${this.urlMeta.host} port=${this.urlMeta.port} sslmode=${this.urlMeta.sslmode ?? 'default'}`,
      );
    } catch (error) {
      this.logConnectionFailure(error);
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
