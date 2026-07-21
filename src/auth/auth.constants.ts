/**
 * Redis keys used by Customer Auth module.
 *
 * OTP
 * - otp:{phone}              — bcrypt hash of active OTP (TTL: 300s)
 * - otp:rate:{phone}         — send-OTP counter (TTL: 900s, max 3)
 * - otp:attempts:{phone}       — verify-OTP failed attempts (TTL: 300s, max 5)
 *
 * Login
 * - auth:login_attempts:{phone} — failed login counter (TTL: 900s, max 5)
 */
export {
  OTP_REDIS_PREFIX,
  OTP_RATE_PREFIX,
  OTP_ATTEMPTS_PREFIX,
  LOGIN_ATTEMPTS_PREFIX,
  OTP_TTL_SECONDS,
  OTP_RATE_LIMIT_WINDOW_SECONDS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_ATTEMPTS_TTL_SECONDS,
} from './otp/otp.constants';
