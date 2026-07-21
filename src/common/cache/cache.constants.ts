export const CACHE_TTL = {
  HOME: 300,
  CATEGORIES: 600,
  CATEGORY_DETAIL: 600,
  PRODUCTS: 300,
  PRODUCT_DETAIL: 300,
  OFFERS: 300,
  BANNERS: 600,
  VIDEOS: 600,
  NOTIFICATIONS: 120,
  NOTIFICATION_UNREAD: 300,
  SEARCH: 180,
  SEARCH_POPULAR: 600,
  SEARCH_SUGGESTIONS: 300,
  SEARCH_TRENDING: 600,
  CART: 300,
  WISHLIST: 600,
  ORDERS: 300,
  PROFILE: 600,
  REVIEWS: 300,
  SUPPORT: 180,
  MEMBERSHIP: 300,
  WALLET: 120,
  LOYALTY: 120,
  BULK: 180,
  TESTIMONIALS: 600,
  EMERGENCY: 180,
} as const;

export const CACHE_KEYS = {
  HOME: 'home:default',
  CATEGORIES: 'categories',
  CATEGORIES_FEATURED: 'categories:featured',
  CATEGORIES_TOP: 'categories:top',
  CATEGORY: (slug: string) => `category:${slug}`,
  PRODUCTS_PAGE: (page: number) => `products:page:${page}`,
  PRODUCTS: (hash: string) => `products:${hash}`,
  PRODUCT: (slug: string) => `product:${slug}`,
  OFFERS: 'offers',
  OFFERS_FEATURED: 'offers:featured',
  OFFER: (slug: string) => `offer:${slug}`,
  BANNERS: (placement?: string) =>
    placement ? `banners:${placement}` : 'banners',
  VIDEOS: (placement?: string) =>
    placement ? `videos:${placement}` : 'videos',
  NOTIFICATIONS: (customerId?: string) =>
    customerId ? `notifications:${customerId}` : 'notifications:global',
  NOTIFICATION_UNREAD: (customerId: string) =>
    `notification:customer:${customerId}:count`,
  SEARCH: (hash: string) => `search:${hash}`,
  SEARCH_POPULAR: 'search:popular',
  SEARCH_SUGGESTIONS: (q: string) => `search:suggestions:${q}`,
  SEARCH_TRENDING: 'search:trending',
  CART: (customerId: string) => `cart:${customerId}`,
  WISHLIST: (customerId: string) => `wishlist:${customerId}`,
  ORDERS: (customerId: string) => `orders:${customerId}`,
  ORDER_DETAIL: (customerId: string, orderId: string) =>
    `orders:${customerId}:${orderId}`,
  PROFILE: (customerId: string) => `profile:${customerId}`,
  PRODUCT_REVIEWS: (productId: string) => `reviews:product:${productId}`,
  SUPPORT: (customerId: string) => `support:${customerId}`,
  MEMBERSHIP: (customerId: string) => `membership:${customerId}`,
  MEMBERSHIP_PLANS: 'membership:plans',
  WALLET: (customerId: string) => `wallet:${customerId}`,
  LOYALTY: (customerId: string) => `loyalty:${customerId}`,
  BULK: (customerId: string) => `bulk:${customerId}`,
  BULK_DETAIL: (customerId: string, id: string) => `bulk:${customerId}:${id}`,
  TESTIMONIALS: 'testimonials:published',
} as const;

export const CACHE_PATTERNS = {
  HOME: 'home:*',
  CATEGORIES: 'categor*',
  PRODUCTS: 'product*',
  OFFERS: 'offer*',
  BANNERS: 'banners*',
  VIDEOS: 'videos*',
  NOTIFICATIONS: 'notification*',
  SEARCH: 'search:*',
  CART: 'cart:*',
  WISHLIST: 'wishlist:*',
  ORDERS: (customerId?: string) =>
    customerId ? `orders:${customerId}*` : 'orders:*',
  PROFILE: (customerId?: string) =>
    customerId ? `profile:${customerId}*` : 'profile:*',
  REVIEWS: 'reviews:*',
  SUPPORT: (customerId?: string) =>
    customerId ? `support:${customerId}*` : 'support:*',
  MEMBERSHIP: (customerId?: string) =>
    customerId ? `membership:${customerId}*` : 'membership:*',
  WALLET: (customerId?: string) =>
    customerId ? `wallet:${customerId}*` : 'wallet:*',
  LOYALTY: (customerId?: string) =>
    customerId ? `loyalty:${customerId}*` : 'loyalty:*',
  BULK: (customerId?: string) =>
    customerId ? `bulk:${customerId}*` : 'bulk:*',
  TESTIMONIALS: 'testimonials:*',
} as const;
