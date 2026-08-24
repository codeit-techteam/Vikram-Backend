import { parseCorsOrigins, isOriginAllowed } from './cors.util';

describe('cors.util', () => {
  it('splits, trims, and drops empty CORS origins', () => {
    expect(
      parseCorsOrigins(' http://localhost:3000 , ,https://hub.example.com '),
    ).toEqual([
      'http://localhost:3000',
      'https://hub.example.com',
      'https://vikram-admin.vercel.app',
      'https://vikram-hub-panel-frontend.vercel.app',
    ]);
  });

  it('never allows wildcard origin *', () => {
    expect(parseCorsOrigins('*,http://localhost:3000')).toEqual([
      'http://localhost:3000',
      'https://vikram-admin.vercel.app',
      'https://vikram-hub-panel-frontend.vercel.app',
    ]);
  });

  it('falls back to localhost defaults when unset', () => {
    expect(parseCorsOrigins(undefined)).toContain('http://localhost:3000');
  });

  it('allows configured origins in production mode checks', () => {
    expect(
      isOriginAllowed('http://localhost:3000', ['http://localhost:3000'], {
        isProduction: true,
      }),
    ).toBe(true);
    expect(
      isOriginAllowed('https://evil.example', ['http://localhost:3000'], {
        isProduction: true,
      }),
    ).toBe(false);
  });

  it('allows localhost in non-production even if not listed', () => {
    expect(
      isOriginAllowed('http://localhost:5173', [], {
        isProduction: false,
        allowLocalhostInDev: true,
      }),
    ).toBe(true);
  });

  it('allows deployed Vercel admin and hub panel origins', () => {
    expect(
      isOriginAllowed('https://vikram-admin.vercel.app', [], {
        isProduction: true,
      }),
    ).toBe(true);
    expect(
      isOriginAllowed('https://vikram-admin-git-main.vercel.app', [], {
        isProduction: true,
      }),
    ).toBe(true);
    expect(
      isOriginAllowed('https://evil.vercel.app', [], { isProduction: true }),
    ).toBe(false);
  });
});
