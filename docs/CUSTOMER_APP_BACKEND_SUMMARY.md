# Customer APP Backend — Phase 3 Summary

## 1. APIs Created

Base URL: `http://localhost:3000/api/v1`  
Swagger: `http://localhost:3000/api/docs`

### Home

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/home` | Public | Aggregated home screen (cached `home:default`, TTL 300s) |

### Search

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/search` | Public | Products + Categories + Offers (`keyword`, `page`, `limit`, `category`, `sort`) |
| GET | `/search/suggestions` | Public | Popular + Recent + Matching products/categories/offers |
| GET | `/search/trending` | Public | Popular / trending search terms |

### Notifications (Customer JWT required)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications` | JWT | Paginated list (customer + global) |
| GET | `/notifications/unread-count` | JWT | Unread count (Redis cached) |
| PATCH | `/notifications/read/:id` | JWT | Mark one as read |
| PATCH | `/notifications/read-all` | JWT | Mark all as read |
| DELETE | `/notifications/:id` | JWT | Soft-delete personal notification |

### CMS (Phase 1–2, reused by Home)

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/categories` | Public |
| GET | `/categories/:slug` | Public |
| GET | `/products` | Public |
| GET | `/products/:slug` | Public |
| GET | `/banners` | Public |
| GET | `/offers` | Public |
| GET | `/offers/:slug` | Public |
| GET | `/videos` | Public |

---

## 2. Redis Keys Used

| Key | TTL | Purpose |
|-----|-----|---------|
| `home:default` | 300s | Full home payload |
| `search:popular` | 600s | Popular search terms |
| `search:suggestions:{q}` | 300s | Autocomplete suggestions |
| `search:{hash}` | 180s | Full search results |
| `search:trending` | 600s | Trending fallback |
| `notification:customer:{customerId}:count` | 300s | Unread count |
| `notifications:{customerId}:{hash}` | 120s | Notification list pages |
| `categories` / `categories:featured` / `categories:top` | 600s | Category lists |
| `banners*` / `offers*` / `products*` / `videos*` | 300–600s | CMS caches |

---

## 3. Cache Strategy

**Read path:** Redis GET → hit return → miss PostgreSQL (via domain services) → SET with TTL → return.

**Home invalidation** — call `CacheService` after Admin CMS writes:

| Admin action | Method | Clears |
|--------------|--------|--------|
| Category CRUD | `invalidateCategories()` | categories* + home |
| Product CRUD | `invalidateProducts()` | products* + home + search |
| Offer CRUD | `invalidateOffers()` | offers* + home + search |
| Banner CRUD | `invalidateBanners()` | banners* + home |
| Video CRUD | `invalidateVideos()` | videos* + home |

**Notification writes** invalidate `notification:customer:{id}:count` + notification list keys.

---

## 4. Prisma Models (Phase 3)

| Model | Table | Notes |
|-------|-------|-------|
| `Announcement` | `announcements` | Home announcement strip |
| `Notification` | `notifications` | Types: ORDER, OFFER, BANNER, ADMIN_ANNOUNCEMENT, PAYMENT, DELIVERY |
| `SearchHistory` | `search_history` | Recent / analytics |
| `PopularSearch` | `popular_searches` | Curated + auto-bumped popular terms |

Migration: `prisma/migrations/20260717180000_phase3_home_search_notifications/`

---

## 5. Home API Response Structure

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

| Home UI section | Field | Source service |
|-----------------|-------|----------------|
| Hero carousel | `banners` | BannerService |
| Featured offers | `featuredOffers` | OfferService |
| Featured categories | `featuredCategories` | CategoryService |
| Material categories | `topCategories` | CategoryService.findTop |
| Featured products | `featuredProducts` | ProductService |
| Best sellers | `bestSellingProducts` | ProductService |
| Recommended | `recommendedProducts` | ProductService |
| Construction videos | `videos` | VideoService |
| Announcement strip | `announcements` | Prisma Announcement |
| Quick stats | `quickStats` | OfferService + ProductService counts |

`HomeService` composes via `Promise.all` — **no duplicated business queries**.

---

## 6. Search Flow

```
Client → GET /search?keyword=&page=&limit=&category=&sort=
       → Redis search:{hash}?
           YES → return
           NO  → Prisma (products + categories + offers)
               → record SearchHistory + bump PopularSearch
               → cache → return

Client → GET /search/suggestions?keyword=
       → Redis search:suggestions:{q}?
           YES → return
           NO  → popular (search:popular / PopularSearch)
               + recent (SearchHistory)
               + matching products / categories / offers
               → cache → return
```

---

## 7. Notification Flow

```
Client (JWT) → GET /notifications
             → PostgreSQL (customer + global), paginated

Client (JWT) → GET /notifications/unread-count
             → Redis notification:customer:{id}:count?
                 YES → return
                 NO  → COUNT unread → cache 300s → return

Client (JWT) → PATCH /notifications/read/:id
             → UPDATE isRead=true → invalidate Redis count/list

Client (JWT) → PATCH /notifications/read-all
             → UPDATE MANY → invalidate Redis

Client (JWT) → DELETE /notifications/:id
             → soft-delete personal only (403 for global)
```

---

## 8. Remaining Customer APP Backend Modules

**Not in Phase 3 (do not implement yet / later phases):**

| Module | Status |
|--------|--------|
| Cart | ❌ Deferred |
| Wishlist | ❌ Deferred |
| Checkout | ❌ Deferred |
| Orders / Tracking | ❌ Deferred |
| Payments | ❌ Deferred |
| Invoices | ❌ Deferred |
| Loyalty | ❌ Deferred |
| Bulk procurement | ❌ Deferred |
| Support / Chat | ❌ Deferred |
| Admin CMS write APIs (hook into CacheService invalidation) | Pending Admin integration |

**Already done:** Auth (OTP/JWT), CMS read APIs, Home, Search, Notifications.

---

## Setup

```bash
docker compose up -d
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev
```

Verify in Swagger (`/api/docs`):

- GET `/home`
- GET `/search`
- GET `/search/suggestions`
- GET `/notifications` (Authorize with JWT)
- PATCH `/notifications/read/:id`
- PATCH `/notifications/read-all`
- GET `/notifications/unread-count`
