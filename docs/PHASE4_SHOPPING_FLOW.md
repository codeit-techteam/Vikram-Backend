# Phase 4 — Shopping Flow (Wishlist · Cart · Checkout · Orders)

Base URL: `http://localhost:3000/api/v1`  
Swagger: `http://localhost:3000/api/docs`  
Auth: **Customer JWT** on all endpoints below.

---

## 1. APIs Created

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wishlist` | List wishlist + count |
| POST | `/wishlist` | Add product (`{ productId }`) |
| DELETE | `/wishlist/:productId` | Remove product |
| GET | `/cart` | Cart + totals |
| POST | `/cart` | Add / increment item (`{ productId, quantity? }`) |
| PATCH | `/cart/item/:itemId` | Set quantity (`{ quantity }`) |
| DELETE | `/cart/item/:itemId` | Remove line |
| DELETE | `/cart` | Clear cart |
| GET | `/checkout` | Checkout summary (no order) |
| POST | `/checkout` | Same as GET with body (`addressId?`, `notes?`) |
| POST | `/orders` | Place order from cart |

---

## 2. Prisma Models

| Model | Notes |
|-------|-------|
| `Wishlist` / `WishlistItem` | One wishlist per customer; unique product |
| `Cart` / `CartItem` | One cart per customer; price/gst/subtotal snapshots |
| `Hub` | Active hubs with lat/lng/pincode |
| `HubInventory` | `availableQty` + `reservedQty` per hub×product |
| `Order` | `orderNumber`, `addressId`, `hubId?`, `orderStatus`, `paymentMethod`, totals |
| `OrderItem` | `unitPrice`, `gst`, `subtotal` |
| `OrderTimeline` | Status history entries |
| `OrderNumberSequence` | Per-year atomic counter |

**OrderStatus:** `PENDING` → `CONFIRMED` → `HUB_ASSIGNED` / `AWAITING_HUB_ALLOCATION` → `PROCESSING` → `PACKED` → `READY_FOR_DISPATCH` → `DISPATCHED` → `DELIVERED` / `CANCELLED`

**PaymentMethod (MVP):** `CASH` | `MANUAL` only.

---

## 3. Redis Keys

| Key | TTL | Invalidated on |
|-----|-----|----------------|
| `cart:{customerId}` | 300s | Cart change, order placed |
| `wishlist:{customerId}` | 600s | Wishlist change |

---

## 4. Order Flow

```
POST /orders
  → validate cart (non-empty, stock, active products)
  → resolve address (default or addressId)
  → find nearest hub with full stock (haversine / pincode)
  → TRANSACTION:
       generate BJW-YYYY-NNNNNN
       reserve inventory (available−, reserved+) if hub fulfills
       create Order + OrderItems
       timeline: Order Placed → Confirmed → Hub Assigned | Awaiting Hub Allocation
       clear cart items
  → create ORDER notification
  → invalidate cart + notifications + orders cache
  → return order details
```

If no hub can fulfill → `orderStatus = AWAITING_HUB_ALLOCATION`, `hubId = null` (no transfer logic).

---

## 5. Cart Calculation Logic

Per line (ex-GST):
- `price` = product `retailPrice` snapshot
- `subtotal` = `price × quantity`
- `gstAmount` = `subtotal × gst% / 100`
- `lineTotal` = `subtotal + gstAmount`

Cart totals:
- `subtotal` = Σ line subtotals
- `gstAmount` = Σ line GST
- `deliveryCharge` = `0` if subtotal ≥ ₹5000, else ₹150 (if cart non-empty)
- `grandTotal` = `subtotal + gstAmount + deliveryCharge`

Rules: one cart/customer; same product increments qty; reject hidden/inactive; qty ≤ aggregate hub `availableQty`.

---

## 6. Checkout Calculation Logic

Same totals as cart (fresh DB read, no cache). Additionally validates:
- Address exists (default if omitted)
- Stock still available per line
- Nearest active hub + `canFulfill` flag

**Does not place an order.**

---

## 7. Order Number Logic

Table `order_number_sequences` keyed by year.

```
UPSERT year → lastValue += 1
Format: BJW-{YYYY}-{NNNNNN}
Example: BJW-2026-000001
```

---

## 8. Swagger Endpoints

Documented under tags **Wishlist**, **Cart**, **Checkout**, **Orders** with summaries, descriptions, request/response examples, and validation error responses. Authorize with Bearer access token.

---

## 9. Remaining Backend Modules (next phases)

| Area | Not in Phase 4 |
|------|----------------|
| Hub Panel | Order accept, packing, dispatch UI APIs |
| Admin Order Management | Force status, reassign hub |
| Inventory Transfer | Cross-hub stock move |
| Dispatch Assignment | Driver / vehicle assignment |
| Finance | Settlements, credit, online payment gateway |
| Coupons / Loyalty / EMI / Wallet | Explicitly out of MVP |

---

## Setup

```bash
docker compose up -d
npm run prisma:migrate:deploy
npm run prisma:seed          # seeds hubs + hub_inventory (500 qty/product)
npm run start:dev
```

Test in Swagger with a customer JWT (OTP login) after adding an address with lat/lng near Mumbai (`19.07`, `72.87`) for nearest-hub matching.
