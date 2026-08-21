import { classifyRedisError } from './redis-errors';

describe('redis-errors', () => {
  it('classifies DigitalOcean max requests limit', () => {
    expect(
      classifyRedisError(
        new Error(
          'ReplyError: ERR max requests limit exceeded. Limit: 500000, Usage: 500004',
        ),
      ).category,
    ).toBe('REDIS_RATE_LIMITED');
  });

  it('classifies auth failures', () => {
    expect(
      classifyRedisError(new Error('NOAUTH Authentication required')).category,
    ).toBe('REDIS_AUTH_FAILED');
  });

  it('classifies timeouts', () => {
    expect(
      classifyRedisError(new Error('Connection timeout ETIMEDOUT')).category,
    ).toBe('REDIS_TIMEOUT');
  });
});
