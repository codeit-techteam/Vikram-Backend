import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { runAuthDatabaseOperation } from './auth-database.util';

describe('runAuthDatabaseOperation', () => {
  it('maps database infrastructure failures to 503', async () => {
    await expect(
      runAuthDatabaseOperation(
        'AUTH_LOGIN',
        { host: 'db.example' },
        'test',
        async () => {
          throw Object.assign(
            new Error("Can't reach database server at `db.example:25060`"),
            {
              code: 'P1001',
            },
          );
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('preserves 401 invalid credentials', async () => {
    await expect(
      runAuthDatabaseOperation('AUTH_LOGIN', undefined, 'test', async () => {
        throw new UnauthorizedException('Invalid employee ID or password');
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the operation result on success', async () => {
    await expect(
      runAuthDatabaseOperation('AUTH_LOGIN', undefined, 'test', async () => ({
        ok: true,
      })),
    ).resolves.toEqual({ ok: true });
  });
});
