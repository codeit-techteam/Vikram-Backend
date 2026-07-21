const INDIAN_MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/;

export function normalizePhone(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (digits.length === 13 && digits.startsWith('091')) {
    return `+91${digits.slice(3)}`;
  }

  return mobile.startsWith('+') ? mobile : `+${digits}`;
}

export function isValidIndianMobile(mobile: string): boolean {
  return INDIAN_MOBILE_REGEX.test(mobile.replace(/\s/g, ''));
}
