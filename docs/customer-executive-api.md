# Customer Executive API

Base path: `/api/v1/admin/customer-executive`  
Auth: Admin JWT Bearer token  
Roles: `CUSTOMER_EXECUTIVE`, `SUPER_ADMIN` (and other roles in `ROLE_GROUPS.CUSTOMER_EXECUTIVE`)

All responses use:

```json
{ "success": true, "message": "...", "data": {} }
```

Customer Executives are scoped to customers where `assignedExecutiveId = currentAdmin.id`. Super Admin has full access.

## Dashboard & activity

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Assigned customers, open complaints, pending payments, avg resolution hours, recent activity |
| GET | `/activity?limit=20` | Live activity feed |

## Customers

| Method | Path | Auth notes |
|--------|------|------------|
| POST | `/customers/lookup` | Body `{ phone }` → `{ exists, customer? }` |
| POST | `/customers/send-otp` | Body `{ phone }` — rate limited; hashed OTP stored |
| POST | `/customers/verify-otp` | Body `{ phone, otp }` → `{ verificationToken }` |
| POST | `/customers` | Register after OTP; body includes `verificationToken`, profile + address fields |
| GET | `/customers` | Query: `page`, `limit`, `q`/`search`, `status`, `city`, `customerType`, `sortBy`, `sortDir` |
| GET | `/customers/search` | Same as list with search focus |
| GET | `/customers/:id` | Full profile (membership, loyalty, orders via admin mapper) |
| PATCH | `/customers/:id` | Update allowed fields; audited |
| PATCH | `/customers/:id/note` | Internal note |
| GET | `/customers/:id/membership` | Active membership |
| PATCH | `/customers/:id/membership/renew` | Renew |
| GET | `/customers/:id/loyalty` | Loyalty account |
| GET | `/customers/:id/loyalty/history` | Loyalty transactions |

### Registration errors

| Code / message | When |
|----------------|------|
| Invalid Indian mobile number | Bad phone format |
| Customer already registered… | Duplicate phone on send-otp / register |
| Invalid or expired verification token | Missing/expired Redis OTP session |
| Email already in use | Duplicate email |

## Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | Scoped list; filters: `customerId`, `q`, `status`, `orderSource` |
| GET | `/orders/:id` | Detail |
| POST | `/orders` | Create on behalf of customer. Body: `customerId`, `addressId?`, `items[]?`, `paymentMethod` (`CASH`\|`MANUAL`), delivery fields, notes. Uses cart + server-side pricing. Sets `orderSource=CUSTOMER_EXECUTIVE` |
| PATCH | `/orders/:id/cancel` | Cancel pending/confirmed |
| PATCH | `/orders/:id/address` | Change delivery address |
| PATCH | `/orders/:id/payment` | Change payment method |
| GET | `/orders/:id/tracking` | Order + timeline |

## Tracking

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tracking/search?q=` | Search by order number/id, customer phone/name. Returns timeline; `liveLocationAvailable: false` when GPS unavailable |

## Payments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payments` | Pending payment queue + latest `PaymentLink` metadata |
| POST | `/payment/send-link` | Body `{ orderId, message? }` — creates `PaymentLink`, notifies customer |
| POST | `/payment/reminder` | Body `{ orderId }` — increments reminder count + notification |

Payment link statuses: `CREATED`, `SENT`, `OPENED`, `PARTIALLY_PAID`, `PAID`, `EXPIRED`, `CANCELLED`.

### Payment webhook (provider → backend)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/payments/webhook` | Header `x-payment-webhook-secret: $PAYMENT_WEBHOOK_SECRET` |

Body:

```json
{ "publicToken": "...", "providerRef": "optional", "amount": 1000 }
```

Idempotent: repeating a successful webhook returns `{ idempotent: true }` without double-applying.

## Complaints (support tickets)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | Scoped list; filters: `q`, `status`, `priority` |
| GET | `/tickets/:id` | Detail |
| POST | `/tickets` | Raise complaint for assigned customer |
| PATCH | `/tickets/:id` | Update status/priority; `resolution` required for `RESOLVED`; optional `note` |

Statuses: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `ESCALATED` (as supported by Prisma enum).

## Bulk procurement

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bulk` | Scoped list; filters: `search`/`q`, `status`, `materialCategorySlug`, `deliveryRequirement`, `assignedExecutiveId`, `city`, `dateFrom`, `dateTo`, `page`, `limit` |
| GET | `/bulk/stats` | Pipeline stats (open/assigned/inProgress/completed/cancelled + value sums) |
| GET | `/bulk/:id` | Detail with activities, follow-ups, notes, quotations |
| PATCH | `/bulk/:id/status` | Update status + remarks |
| PATCH | `/bulk/:id/assign` | Assign executive (`executiveId` or legacy `assignedExecutive` name) |
| POST | `/bulk/:id/follow-ups` | Schedule follow-up |
| PATCH | `/bulk/:id/follow-ups/:followUpId` | Update follow-up status |
| POST | `/bulk/:id/notes` | Add internal note |
| POST | `/bulk/:id/quotations` | Create quotation (computes GST/totals) |
| PATCH | `/bulk/:id/quotations/:quotationId/status` | DRAFT/SENT/ACCEPTED/… (`SENT` → enquiry `QUOTE_SENT`) |
| POST | `/bulk/:id/convert` | Convert to order (`bulkOrder=true`, `AWAITING_HUB_ALLOCATION`, no inventory deduction) |
| PATCH | `/bulk/:id/reject` | Reject |
| PATCH | `/bulk/:id/cancel` | Cancel |

CE scope: customers assigned to the executive **or** enquiries with `assignedExecutiveId = currentAdmin.id`. Super Admin sees all.

Customer App: `GET /api/v1/bulk/form-config`, `POST /api/v1/bulk`, `GET /api/v1/bulk`, `GET /api/v1/bulk/:id`, `PATCH /api/v1/bulk/:id/cancel`. Admin mirror under `/api/v1/admin/bulk`.

## Emergency

| Method | Path |
|--------|------|
| GET | `/emergency` |
| GET | `/emergency/:id` |
| PATCH | `/emergency/:id/status` |

## Cross-app sync

- Same `Customer`, `Order`, `SupportTicket`, `BulkEnquiry`, `LoyaltyAccount`, `CustomerMembership` tables as Customer App / Admin / Hub.
- Order status updates flow through existing Socket.IO `/realtime` + Hub APIs; CE portal polls/refetches operational screens.
- CE-created orders set `orderSource=CUSTOMER_EXECUTIVE` and appear in Customer App order lists.
