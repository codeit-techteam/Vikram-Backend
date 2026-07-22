import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { CacheService } from '../../common/cache/cache.service';

const execFileAsync = promisify(execFile);

/**
 * Runs the static-catalog → PostgreSQL sync and clears Redis catalog caches.
 */
@Injectable()
export class CatalogSeederService {
  private readonly logger = new Logger(CatalogSeederService.name);

  constructor(private readonly cache: CacheService) {}

  async syncFromStaticCatalog(): Promise<{ stdout: string; stderr: string }> {
    const script = join(process.cwd(), 'prisma', 'seedCatalog.ts');
    this.logger.log(`Running catalog sync: ${script}`);

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', script],
      {
        cwd: process.cwd(),
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    await this.cache.invalidateCategories();
    await this.cache.invalidateProducts();

    if (stdout) this.logger.log(stdout);
    if (stderr) this.logger.warn(stderr);

    return { stdout, stderr };
  }
}
