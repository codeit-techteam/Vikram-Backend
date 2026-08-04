/** Canonical R2 folder prefixes for CMS / catalog media. */
export const MEDIA_FOLDERS = {
  VIDEOS: 'videos',
  VIDEOS_HOME: 'videos/home',
  VIDEOS_TUTORIAL: 'videos/tutorial',
  VIDEOS_TUTORIALS: 'videos/tutorials',
  VIDEOS_PROMOTIONS: 'videos/promotions',
  BANNERS: 'banners',
  OFFERS: 'offers',
  PRODUCTS: 'products',
  PRODUCTS_GALLERY: 'products/gallery',
  CATEGORIES: 'categories',
  BRANDS: 'brands',
  TESTIMONIALS: 'testimonials',
  ICONS: 'icons',
  THUMBNAILS: 'thumbnails',
  DOCUMENTS: 'documents',
} as const;

export type MediaFolder = (typeof MEDIA_FOLDERS)[keyof typeof MEDIA_FOLDERS];

export const MEDIA_FOLDER_ALIASES: Record<string, MediaFolder> = {
  videos: MEDIA_FOLDERS.VIDEOS,
  'videos/home': MEDIA_FOLDERS.VIDEOS_HOME,
  'videos/tutorial': MEDIA_FOLDERS.VIDEOS_TUTORIAL,
  'videos/tutorials': MEDIA_FOLDERS.VIDEOS_TUTORIALS,
  'videos/promotions': MEDIA_FOLDERS.VIDEOS_PROMOTIONS,
  home: MEDIA_FOLDERS.VIDEOS_HOME,
  tutorial: MEDIA_FOLDERS.VIDEOS_TUTORIAL,
  tutorials: MEDIA_FOLDERS.VIDEOS_TUTORIALS,
  promotions: MEDIA_FOLDERS.VIDEOS_PROMOTIONS,
  banners: MEDIA_FOLDERS.BANNERS,
  offers: MEDIA_FOLDERS.OFFERS,
  products: MEDIA_FOLDERS.PRODUCTS,
  'products/gallery': MEDIA_FOLDERS.PRODUCTS_GALLERY,
  gallery: MEDIA_FOLDERS.PRODUCTS_GALLERY,
  categories: MEDIA_FOLDERS.CATEGORIES,
  brands: MEDIA_FOLDERS.BRANDS,
  testimonials: MEDIA_FOLDERS.TESTIMONIALS,
  icons: MEDIA_FOLDERS.ICONS,
  thumbnails: MEDIA_FOLDERS.THUMBNAILS,
  documents: MEDIA_FOLDERS.DOCUMENTS,
  pdf: MEDIA_FOLDERS.DOCUMENTS,
};

export function resolveMediaFolder(folder?: string | null): MediaFolder {
  if (!folder) return MEDIA_FOLDERS.VIDEOS;
  const key = folder.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  return MEDIA_FOLDER_ALIASES[key] ?? MEDIA_FOLDERS.VIDEOS;
}

/** Infer destination folder from MIME when client omits `folder`. */
export function inferMediaFolder(mimeType: string): MediaFolder {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('video/')) return MEDIA_FOLDERS.VIDEOS_HOME;
  if (mime === 'application/pdf') return MEDIA_FOLDERS.DOCUMENTS;
  if (mime.startsWith('image/')) return MEDIA_FOLDERS.BANNERS;
  return MEDIA_FOLDERS.DOCUMENTS;
}
