# Razorpay Test Mode — Developer Setup

This document covers the **Customer App → Vikram-Backend → Razorpay Test Mode** integration. It does **not** contain real API secrets.

## Flow

1. Customer selects UPI or Cards on Checkout.
2. Backend creates an internal order (`PENDING` / `paymentStatus=PENDING`) and a Razorpay Order. Amount is calculated from cart/order data (not from the app).
3. The app opens Razorpay Checkout with `order_id` + public **Key ID** only.
4. After payment, the app sends `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature` to the backend.
5. Backend verifies the HMAC signature using **Key Secret**, then verifies amount/currency/ownership.
6. Order is marked paid only after server-side verification.
7. The Razorpay webhook independently confirms `payment.captured` / `order.paid` (idempotent).

Never treat the Razorpay Checkout success callback as proof of payment by itself.

## Environment variables (Vikram-Backend)

Set these in `.env` / `.env.development` and in DigitalOcean App Platform secrets. **Do not commit values.**

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_MODE=test
```

| Variable | Where it is used | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | Backend + returned to the Customer App at checkout | Public. Prefix `rzp_test_` in Test Mode. |
| `RAZORPAY_KEY_SECRET` | Backend only | Never send to the app, logs, or Git. |
| `RAZORPAY_WEBHOOK_SECRET` | Backend webhook verification | Different from Key Secret. Generate in the Razorpay Dashboard webhook settings. |
| `RAZORPAY_MODE` | Backend | `test` or `live`. Mixing a live Key ID with `test` (or vice versa) is rejected. |

The Customer App must **not** bundle `RAZORPAY_KEY_SECRET`. Key ID is returned by `POST /api/v1/payments/razorpay/create-order`.

## APIs

Base: `/api/v1` (authenticated customer JWT unless noted).

| Method | Path | Purpose |
|---|---|---|
| GET | `/payments/razorpay/config` | `{ enabled, mode, provider }` |
| POST | `/payments/razorpay/create-order` | Create/reuse pending order + Razorpay order |
| POST | `/payments/razorpay/verify` | Signature + amount verification |
| POST | `/payments/razorpay/cancel` | Customer closed Checkout |
| GET | `/payments/razorpay/status/:orderId` | Authoritative status (+ light reconcile) |
| GET | `/payments/razorpay/pending` | Latest unpaid online order (app restart recovery) |
| POST | `/payments/razorpay/webhook` | **Public.** Razorpay → backend. HMAC with `RAZORPAY_WEBHOOK_SECRET`. |

COD is unchanged: `POST /api/v1/orders` with `paymentMethod: CASH`.

## Razorpay Dashboard webhook

1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/) → **Test Mode**.
2. **Account & Settings** → **Webhooks** → **Add New Webhook**.
3. URL:

   `https://<your-backend-host>/api/v1/payments/razorpay/webhook`

   Local development: use a public HTTPS tunnel (ngrok, Cloudflare Tunnel, etc.) pointing at the Nest server.
4. Secret: generate in the Dashboard and store as `RAZORPAY_WEBHOOK_SECRET`. Do not reuse `RAZORPAY_KEY_SECRET`.
5. Enable at least:

   - `payment.authorized`
   - `payment.captured`
   - `payment.failed`
   - `order.paid`

Active webhooks require HTTPS.

## Switching Test → Live later

1. Generate **Live** Key ID + Key Secret (separate from Test keys).
2. Replace env values.
3. Set `RAZORPAY_MODE=live`.
4. Create a **Live** webhook with a Live webhook secret.
5. Rebuild/restart the backend. No payment architecture rewrite is required.

## Customer App (Expo)

- Official SDK: `react-native-razorpay` (native checkout). Requires a **development build** / EAS build — not Expo Go.
- The app also has a Checkout.js WebView fallback for environments where the native module is unavailable.
- After changing native modules, run a new `eas build` / `npx expo run:android|ios`.

## Test Mode cards / UPI

Use only Razorpay’s official Test Mode instruments (they do not move real money):

- Docs: [Razorpay Test Cards](https://razorpay.com/docs/payments/payments/test-card-details/)
- Common success card: `4111 1111 1111 1111`, any future expiry, any CVV, any name.
- UPI Test IDs are listed in the same Razorpay Test Mode documentation (for example `success@razorpay`).

Do not use live cards against Test Mode keys.

## Manual verification checklist

1. COD checkout still places an order with `paymentMethod=CASH`.
2. UPI/Cards create a Razorpay Test order; amount in paise matches backend grand total.
3. Successful test payment → order `PAID` / hub assigned.
4. Closing Checkout → cancelled, not failed; retry reuses the internal order.
5. Killing the app after payment → reopening recovers via `/pending` + `/status`.
6. Duplicate verify + duplicate webhook do not double-charge stock or create a second order.
