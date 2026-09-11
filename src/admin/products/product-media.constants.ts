/** Production limits for product gallery media. */
export const PRODUCT_MEDIA_LIMITS = {
  MAX_IMAGES: 6,
  MAX_VIDEOS: 1,
  /** Max image upload size enforced on attach (R2 upload may allow more). */
  MAX_IMAGE_BYTES: 15 * 1024 * 1024,
  /** Max product video size. */
  MAX_VIDEO_BYTES: 200 * 1024 * 1024,
} as const;

export const PRODUCT_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const PRODUCT_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
