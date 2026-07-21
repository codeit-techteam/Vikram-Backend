export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'Bajriwala ERP API',
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8081',
    ],
  },
  database: {
    url: process.env.DATABASE_URL,
    poolMax: parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
    poolIdleTimeoutMs: parseInt(
      process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? '30000',
      10,
    ),
    connectionTimeoutMs: parseInt(
      process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '5000',
      10,
    ),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-before-production',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ??
      'dev-jwt-refresh-secret-change-before-production',
    accessExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  otp: {
    devBypassCode: process.env.OTP_DEV_BYPASS_CODE ?? '123456',
  },
  shopping: {
    deliveryCharge: parseInt(process.env.DELIVERY_CHARGE ?? '150', 10),
    freeDeliveryThreshold: parseInt(
      process.env.FREE_DELIVERY_THRESHOLD ?? '5000',
      10,
    ),
    hubSearchRadiusKm: parseInt(process.env.HUB_SEARCH_RADIUS_KM ?? '50', 10),
  },
});
