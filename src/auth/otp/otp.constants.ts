export const OTP_REDIS_PREFIX = 'otp:';
export const OTP_RATE_PREFIX = 'otp:rate:';
export const OTP_ATTEMPTS_PREFIX = 'otp:attempts:';
export const LOGIN_ATTEMPTS_PREFIX = 'auth:login_attempts:';

export const OTP_TTL_SECONDS = 300;
export const OTP_RATE_LIMIT_WINDOW_SECONDS = 900;
export const OTP_MAX_SENDS_PER_WINDOW = 3;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const OTP_LENGTH = 6;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_ATTEMPTS_TTL_SECONDS = 900;
