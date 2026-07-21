# Bajriwala Customer APP — API Mapping Document

> Generated from frontend audit of `/Vikram-frontend` (44 screens, static TypeScript data, zero live API calls).

## Phase 1 — Implemented in this sprint (Browse / Catalog / CMS)

| Screen / Feature | Frontend Route | Data Source Today | API Endpoint | Method | Status |
|------------------|----------------|-------------------|--------------|--------|--------|
| **Home (Aggregated)** | `/(tabs)/index` | Multiple hardcoded arrays | `/api/v1/home` | GET | ✅ Implemented |
| Hero Carousel | Home | `heroSlides` (3 slides) | Included in `/home` → `banners` | GET | ✅ |
| Featured Categories | Home | `CATEGORIES` (5 items) | Included in `/home` → `featuredCategories` | GET | ✅ |
| Featured / Best / New Products | Home | catalog constants | Included in `/home` | GET | ✅ |
| Hero Video | Home | `HeroVideoSection` | Included in `/home` → `videos` | GET | ✅ |
| Announcements | Home | loyalty / pro cards | Included in `/home` → `announcements` | GET | ✅ |
| **Catalog** | `/(tabs)/catalog` | `CATALOG_CATEGORIES` (12) | `/api/v1/categories` | GET | ✅ |
| Category Detail | `/products/[categoryId]` | `PRODUCTS_BY_CATEGORY` | `/api/v1/categories/:slug` | GET | ✅ |
| Category Products | `/products/[categoryId]` | catalog + extensions | `/api/v1/products?categorySlug=` | GET | ✅ |
| **Product Detail** | `/products/detail/[productId]` | `getProductById` | `/api/v1/products/:slug` | GET | ✅ |
| Product Images | Product Detail | carousel arrays | Included in product → `images[]` | GET | ✅ |
| Product Variants | Product Detail | `catalogVariantHelpers` | Included in product → `variants[]` | GET | ✅ |
| Tech Specs | Product Detail | `SPECS_BY_TYPE` | Included in product → `specs` | GET | ✅ |
| **Search** | `/search` | `searchData.ts` | `/api/v1/search?keyword=` | GET | ✅ |
| Search Suggestions | Search overlay | `searchUtils` fuzzy | `/api/v1/search/suggestions?keyword=` | GET | ✅ |
| Trending Searches | Search | `POPULAR_SEARCH_TERMS` | `/api/v1/search/trending` | GET | ✅ |
| **Offers** | Home / Search bundle | `BUNDLE_PRODUCT_IDS` | `/api/v1/offers` | GET | ✅ |
| Offer Detail | — | bundle deal | `/api/v1/offers/:slug` | GET | ✅ |
| **Banners** | Home carousel | hardcoded slides | `/api/v1/banners` | GET | ✅ |
| **Videos** | Home hero video | local asset | `/api/v1/videos` | GET | ✅ |
| **Notifications** | `/notifications` | `NOTIFICATIONS` (4 items) | `/api/v1/notifications` | GET/PATCH/DELETE | ✅ Implemented (Phase 3) |

---

## Phase 2 — Remaining Customer APP APIs (Not in this sprint)

### Auth & Onboarding

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Login | `/login` | `POST /auth/send-otp` |
| OTP Verify | `/otp` | `POST /auth/verify-otp` |
| Role Selection | `/role-selection` | `PATCH /users/profile` (role) |
| Complete Profile | `/complete-profile` | `PATCH /users/profile`, `POST /users/gst/verify` |
| Delivery Location | `/delivery-location` | `GET/POST /users/sites` |

### Cart & Checkout

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Cart | `/(tabs)/cart` | `GET /cart`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id` |
| Saved for Later | Cart | `POST /cart/save-for-later` |
| Cart Summary | Cart | `GET /cart/summary` |
| Checkout | `/checkout` | `GET /cart`, `POST /gst/verify`, `POST /orders`, `POST /payments/*` |
| Order Success | `/order-success` | Response from `POST /orders` |

### Orders & Tracking

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Orders Tab | `/(tabs)/orders` | `GET /orders?status=` |
| Order View | `/orders/view/[orderId]` | `GET /orders/:id`, `GET /orders/:id/invoice` |
| Live Tracking | `/orders/details/[orderId]` | `GET /orders/:id/tracking` (WebSocket/poll) |
| Order History | `/orders/history` | `GET /orders/history` |
| Track Delivery | `/track-delivery` | `GET /deliveries/active` |
| Recent Products | Home last orders | `GET /orders/recent-products` |

### Account & Profile

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Account | `/(tabs)/account` | `GET /users/me` |
| Edit Profile | `/account/edit-profile` | `PATCH /users/me` |
| Payment Methods | `/account/payment-methods` | `GET/POST/DELETE /users/payment-methods` |
| Privacy | `/account/privacy` | `GET/PATCH /users/preferences` |
| GST Compliance | `/account/gst-compliance` | `GET /users/gst/certificate` |
| Add Sites | `/account/add-sites` | `CRUD /users/project-sites` |
| Wishlist | — (implied) | `GET/POST/DELETE /wishlist` |

### Invoices

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Invoices List | `/account/invoices` | `GET /invoices?status=` |
| Invoice Detail | `/invoice/[invoiceId]` | `GET /invoices/:id`, `GET /invoices/:id/pdf` |

### Loyalty

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Loyalty Wallet | `/account/loyalty` | `GET /loyalty/summary`, `GET /loyalty/rewards`, `GET /loyalty/activity` |
| Redeem | Loyalty | `POST /loyalty/redeem`, `POST /loyalty/redeem-preview` |

### Bulk Procurement

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Enquiry Form | `/bulk-procurement/enquiry` | `POST /bulk-enquiries` |
| My Enquiries | `/bulk-procurement/my-enquiries` | `GET /bulk-enquiries` |

### Support

| Screen | Route | Required APIs |
|--------|-------|---------------|
| Support Hub | `/support` | `POST /support/tickets` |
| Chat | `/support/chat` | `GET/POST /support/chat` (WebSocket) |
| Emergency Order | `/emergency-order` | `POST /orders/emergency` |

### Product Recommendations

| Feature | Required APIs |
|---------|---------------|
| Frequently Bought Together | `GET /products/:slug/recommendations` |
| Filter Metadata | `GET /products/filters?categorySlug=` |

---

## Aggregated Home API Contract

```
GET /api/v1/home
```

```json
{
  "success": true,
  "message": "Home loaded successfully",
  "data": {
    "banners": [],
    "featuredOffers": [],
    "featuredCategories": [],
    "topCategories": [],
    "featuredProducts": [],
    "bestSellingProducts": [],
    "recommendedProducts": [],
    "videos": [],
    "announcements": [],
    "quickStats": {
      "activeOffers": 5,
      "featuredProducts": 20
    }
  }
}
```

---

## Static Data → Backend Model Mapping

| Frontend Constant | Backend Model |
|-------------------|---------------|
| `CATALOG_CATEGORIES` | `Category` |
| `PRODUCTS_BY_CATEGORY` + `products.ts` | `Product`, `ProductImage`, `ProductVariant` |
| `heroSlides` | `Banner` |
| `BUNDLE_PRODUCT_IDS` | `Offer`, `OfferProduct` |
| `HeroVideoSection` | `Video` |
| `NOTIFICATIONS` | `Notification` |
| `POPULAR_SEARCH_TERMS` | `SearchHistory` (aggregated trending) |
| `SAMPLE_ORDERS` | `Order`, `OrderItem` (schema only) |
| `DEFAULT_USER` | `Customer` (schema only) |
| `DEFAULT_SITES` | `Address` (schema only) |
