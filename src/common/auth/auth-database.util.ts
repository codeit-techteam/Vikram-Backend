import {
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  classifyDatabaseError,
  formatDatabaseDiagnostic,
  type DatabaseUrlMeta,
} from '../database/postgres-url';

const AUTH_LOGGER = new Logger('AuthFlow');

/**
 * Maps infrastructure failures (DB down) to HTTP 503 without converting
 * intentional auth errors (401/403) into something else.
 */
export async function runAuthDatabaseOperation<T>(
  eventPrefix: string,
  meta: Partial<DatabaseUrlMeta> | undefined,
  nodeEnv: string,
  operation: () => Promise<T>,
): Promise<T> {
  AUTH_LOGGER.log(`${eventPrefix}_STARTED`);
  try {
    const result = await operation();
    AUTH_LOGGER.log(`${eventPrefix}_SUCCESS`);
    return result;
  } catch (error) {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === 401) {
        AUTH_LOGGER.warn(`${eventPrefix}_INVALID_CREDENTIALS`);
      } else if (status === 403) {
        AUTH_LOGGER.warn(`${eventPrefix}_FORBIDDEN`);
      }
      throw error;
    }

    const diagnostic = classifyDatabaseError(error);
    AUTH_LOGGER.error(
      `${eventPrefix}_DATABASE_FAILED ${formatDatabaseDiagnostic(
        diagnostic,
        meta ?? {},
        nodeEnv,
      )}`,
    );

    throw new ServiceUnavailableException(
      'Authentication service temporarily unavailable. Please try again shortly.',
    );
  }
}
