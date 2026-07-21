# Phase 5 — Customer Post-Order Experience

## 1. Modules Created

| Module | Path | Responsibility |
|--------|------|----------------|
| `orders` | `src/modules/orders` | List / detail / cancel (+ Phase 4 place order) |
| `order-tracking` | `src/modules/order-tracking` | Timeline + current status |
| `invoice` | `src/modules/invoice` | JSON invoice for an order |
| `reviews` | `src/modules/reviews` | Create / list / update / delete reviews |
| `customer-profile` | `src/modules/customer-profile` | Image, change mobile/email, activity |
| `support` | `src/modules/support` | Raise & list support tickets |

## 2. Prisma Models (added / extended)

**Enums:** `PACKED` on `OrderStatus`, `InvoiceStatus`, `SupportTicketReason`, `SupportTicketStatus`

**Extended**
- `Order` — `cancelReason`, `cancelledAt`, `deliveredAt`
- `OrderTimeline` — `updatedAt`, non-null `updatedBy`
- `Product` — `averageRating`, `reviewCount`
- `Review` — `orderId`, `images`, unique `(orderId, productId, customerId)`

**New**
- `Invoice`
- `SupportTicket`

Migration: `prisma/migrations/20260717200000_phase5_post_order/`

## 3. Redis Keys

| Key | TTL | Notes |
|-----|-----|-------|
| `orders:{customerId}` (+ query hash) | 300s | Order list |
| `orders:{customerId}:{orderId}` | 300s | Order detail |
| `profile:{customerId}` | 600s | Profile |
| `reviews:product:{productId}` | 300s | Product reviews |
| `support:{customerId}*` | 180s | Support list |

**Invalidate on:** order status change / cancel, profile update, review create/update/delete

## 4. Swagger URLs

Base: `http://localhost:3000/api/docs`

| Method | Path |
|--------|------|
| GET | `/api/v1/orders` |
| GET | `/api/v1/orders/:orderId` |
| GET | `/api/v1/orders/:orderId/status` |
| GET | `/api/v1/orders/:orderId/timeline` |
| PATCH | `/api/v1/orders/:orderId/cancel` |
| GET | `/api/v1/orders/:orderId/invoice` |
| POST | `/api/v1/reviews` |
| GET | `/api/v1/reviews/product/:productId` |
| PATCH | `/api/v1/reviews/:reviewId` |
| DELETE | `/api/v1/reviews/:reviewId` |
| GET | `/api/v1/customer/profile` |
| PATCH | `/api/v1/customer/profile` |
| PATCH | `/api/v1/customer/profile/image` |
| POST | `/api/v1/customer/change-mobile/request-otp` |
| PATCH | `/api/v1/customer/change-mobile` |
| PATCH | `/api/v1/customer/change-email` |
| GET | `/api/v1/customer/activity` |
| POST | `/api/v1/support` |
| GET | `/api/v1/support` |
| GET | `/api/v1/support/:ticketId` |
| GET | `/api/v1/notifications` |

## 5. Order Tracking Flow

```
PENDING (Order Placed)
  → CONFIRMED
  → HUB_ASSIGNED | AWAITING_HUB_ALLOCATION
  → PROCESSING
  → PACKED
  → READY_FOR_DISPATCH
  → DISPATCHED
  → DELIVERED
  ✕ CANCELLED (only from PENDING / CONFIRMED / HUB_ASSIGNED / AWAITING_HUB_ALLOCATION)
```

Each transition is stored in `OrderTimeline` (`status`, `remarks`, `updatedBy`, `createdAt`, `updatedAt`).

## 6. Review Flow

1. Order must be `DELIVERED` and owned by customer  
2. Product must be on that order  
3. One review per `(orderId, productId, customerId)`  
4. Rating 1–5 + optional title/comment/images  
5. Product `averageRating` + `reviewCount` recalculated in transaction  

## 7. Support Flow

1. `POST /support` with reason (`LATE_DELIVERY` | `WRONG_PRODUCT` | `DAMAGED_MATERIAL` | `OTHER`)  
2. Optional `orderId` (validated ownership)  
3. Ticket number `TKT-YYYY-NNNNNN`, status starts `OPEN`  
4. Customer notification created  
5. List / detail via `GET /support` and `GET /support/:ticketId`  

## 8. Invoice Flow

1. `GET /orders/:orderId/invoice`  
2. If missing → generate JSON invoice (`INV-YYYY-NNNNNN`) with customer/items/address snapshots  
3. MVP returns JSON only (PDF later)  
4. Cancelled orders mark invoice `CANCELLED`  

## 9. Remaining Backend Phases

- Hub Panel (accept / pack / dispatch assignment)  
- Warehouse & transfers  
- Driver / vehicle / live tracking  
- Online payments (Razorpay etc.)  
- Invoice PDF generation  
- Admin dashboard & finance  
- Bulk procurement / loyalty  
