export const FCM_MULTICAST_LIMIT = 500;
export const INBOX_INSERT_BATCH = 500;
export const TOKEN_QUERY_PAGE = 1000;
export const CUSTOMER_QUERY_PAGE = 1000;
export const FCM_MAX_ATTEMPTS = 3;
export const FCM_RETRY_BACKOFF_MS = [400, 1200, 3000] as const;
export const ANDROID_NOTIFICATION_CHANNEL = 'bajriwala-default';
export const SCHEDULER_POLL_MS = 15_000;
export const DORMANT_AFTER_DAYS = 90;
export const ACTIVE_WITHIN_DAYS = 30;
export const NEW_CUSTOMER_DAYS = 30;

export const INVALID_FCM_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-recipient',
  'messaging/mismatched-credential',
]);

export const TRANSIENT_FCM_ERROR_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unavailable',
  'messaging/timeout',
  'messaging/unknown-error',
  'messaging/quota-exceeded',
]);

export const ROLE_SEGMENT_SLUGS: Record<string, string> = {
  INDIVIDUALS: 'individual',
  CONTRACTORS: 'contractor',
  MASONS: 'mason',
  INTERIOR_DESIGNERS: 'interior-designer',
  ARCHITECTS: 'architect',
  BUILDERS: 'builder',
  DEVELOPERS: 'developer',
};
