import { resolveRedisFromEnv } from './redis.config';

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
  redis: (() => {
    const redis = resolveRedisFromEnv();
    return {
      host: redis.host,
      port: redis.port,
      username: redis.username,
      password: redis.password,
      db: redis.db,
      tls: redis.tls,
    };
  })(),
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
    /** Fixed OTP in non-production for `devPhone` only (SMS bypass). */
    devBypassCode: process.env.OTP_DEV_BYPASS_CODE ?? '123456',
    /** Demo login phone that receives the fixed bypass OTP in development. */
    devPhone: process.env.OTP_DEV_PHONE ?? '8240890242',
  },
  shopping: {
    deliveryCharge: parseInt(process.env.DELIVERY_CHARGE ?? '150', 10),
    freeDeliveryThreshold: parseInt(
      process.env.FREE_DELIVERY_THRESHOLD ?? '5000',
      10,
    ),
    hubSearchRadiusKm: parseInt(process.env.HUB_SEARCH_RADIUS_KM ?? '50', 10),
  },
  loyalty: {
    minRedeemOrderValue: parseInt(
      process.env.LOYALTY_MIN_REDEEM_ORDER_VALUE ?? '500',
      10,
    ),
    /** @deprecated use minRedeemOrderValue */
    minRedeemPoints: parseInt(
      process.env.LOYALTY_MIN_REDEEM_ORDER_VALUE ??
        process.env.LOYALTY_MIN_REDEEM_POINTS ??
        '500',
      10,
    ),
    pointValueInr: parseFloat(process.env.LOYALTY_POINT_VALUE_INR ?? '0.01'),
    maxOrderRedeemPercent: parseFloat(
      process.env.LOYALTY_MAX_ORDER_REDEEM_PERCENT ?? '0.3',
    ),
    earnCashbackPercent: parseFloat(
      process.env.LOYALTY_EARN_CASHBACK_PERCENT ?? '1',
    ),
    earnPointsPer100Inr: parseInt(
      process.env.LOYALTY_EARN_POINTS_PER_100_INR ?? '100',
      10,
    ),
    pointsExpiryMonths: parseInt(
      process.env.LOYALTY_POINTS_EXPIRY_MONTHS ?? '12',
      10,
    ),
    welcomeBonus: parseInt(process.env.LOYALTY_WELCOME_BONUS ?? '50', 10),
    firstOrderBonus: parseInt(process.env.LOYALTY_FIRST_ORDER_BONUS ?? '50', 10),
  },
  deliveryBenefit: {
    freeBikeDeliveries: parseInt(
      process.env.FREE_BIKE_DELIVERIES ?? '3',
      10,
    ),
    companyAbsorbedCost: parseFloat(
      process.env.BIKE_DELIVERY_COMPANY_COST ?? '99',
    ),
  },
  scheduler: {
    membershipCron: process.env.MEMBERSHIP_CRON ?? '0 30 0 * * *',
    loyaltyCron: process.env.LOYALTY_CRON ?? '0 0 1 * * *',
    reportCron: process.env.REPORT_CRON ?? '0 50 23 * * *',
    notificationCron: process.env.NOTIFICATION_CRON ?? '*/10 * * * *',
    jobAttempts: parseInt(process.env.SCHEDULER_JOB_ATTEMPTS ?? '3', 10),
    jobBackoffMs: parseInt(process.env.SCHEDULER_JOB_BACKOFF_MS ?? '5000', 10),
    processorConcurrency: parseInt(
      process.env.SCHEDULER_PROCESSOR_CONCURRENCY ?? '2',
      10,
    ),
  },
  internal: {
    apiKey: process.env.INTERNAL_API_KEY,
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER ?? '',
    secret: process.env.PAYMENT_SECRET ?? '',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
    linkBaseUrl:
      process.env.PAYMENT_LINK_BASE_URL ??
      process.env.FRONTEND_URL ??
      'https://pay.bajriwala.com',
  },
  company: {
    name: process.env.COMPANY_NAME ?? 'Bajriwala',
    gstin: process.env.COMPANY_GSTIN ?? '',
    addressLine1: process.env.COMPANY_ADDRESS_LINE1 ?? '',
    addressLine2: process.env.COMPANY_ADDRESS_LINE2 ?? '',
    city: process.env.COMPANY_CITY ?? '',
    state: process.env.COMPANY_STATE ?? 'Maharashtra',
    pincode: process.env.COMPANY_PINCODE ?? '',
    phone: process.env.COMPANY_PHONE ?? '',
    email: process.env.COMPANY_EMAIL ?? '',
    website: process.env.COMPANY_WEBSITE ?? '',
  },
  invoice: {
    uploadsDir: process.env.INVOICE_UPLOADS_DIR ?? 'uploads/invoices',
    loyaltyPointValue: parseFloat(
      process.env.LOYALTY_POINT_VALUE ??
        process.env.LOYALTY_POINT_VALUE_INR ??
        '0.01',
    ),
    termsAndConditions:
      process.env.INVOICE_TERMS ??
      '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.\n3. E.& O.E.',
    emailEnabled: process.env.INVOICE_EMAIL_ENABLED === 'true',
  },
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    from: process.env.EMAIL_FROM ?? 'noreply@bajriwala.com',
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    smtpSecure: process.env.SMTP_SECURE === 'true',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY ?? '',
  },
  r2: {
    provider: process.env.MEDIA_PROVIDER ?? 'r2',
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? 'bajriwala',
    publicUrl: process.env.R2_PUBLIC_URL ?? '',
    endpoint:
      process.env.R2_ENDPOINT ||
      (process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : ''),
  },
});
