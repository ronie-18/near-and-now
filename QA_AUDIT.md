# Near & Now — QA Audit (Re-Verified)

**Original audit date:** 2026-05-26 (137 tickets recorded in `qa_audit_old.md`)
**Re-audit date:** 2026-06-16 — Round 1: 4 parallel deep-dive agents covering `admin/`, `api/`, `backend/`, `frontend/`, `supabase/` (the web monorepo). Round 2: 3 more agents covering the three sibling mobile repos (`nearandnowcustomerapp`, `near-now-store_owner`, `NAT_Near-Now_Rider-`) once they were pulled locally, cross-checked against this repo's `backend/src/routes/*.ts` as ground truth.
**Method:** Static code analysis only. No live Supabase DB/Storage connection and no live device/build was used — claims that depend on live row counts, live bucket contents, or runtime device behavior are marked ⚠️ and are *plausible but unconfirmed*; everything else was confirmed directly against current source.
**Scope:** `admin/`, `api/`, `backend/`, `frontend/`, `supabase/` (in this repo) plus `nearandnowcustomerapp/`, `near-now-store_owner/`, `NAT_Near-Now_Rider-/` (sibling repos under `F:\Coding\Near-Now\`, all included in this round).

## Legend
✅ FIXED · ❌ STILL BROKEN · 🟡 PARTIALLY FIXED · ⚠️ COULD NOT VERIFY (needs live DB/Storage/device)

---

## 🔥 Priority Punch List — fix in this order

**Tier 1 — Auth & money, fix first:**
1. ✅ **DONE (2026-06-16):** Customer OTP token is now persisted (`auth.controller.ts:320-336`) **and** actually enforced — a new `requireCustomer` middleware (`backend/src/middleware/customerAuth.middleware.ts`) validates the real `session_token` and is wired into `customers.routes.ts` (all address routes) and the three customer-scoped routes in `orders.routes.ts` (`GET /customer/:customerId`, `GET /:orderId`, `POST /:orderId/cancel`), each now with an ownership check (403 if the token's customer doesn't own the resource). The old `invoice.controller.ts:requireCustomer`/`requireShopkeeper` (which accepted a bare UUID, and looked up shopkeepers by `id` instead of `session_token`) were deleted and `invoice.routes.ts` now imports the correct, shared implementations — this also fixes SECURITY-008 and SECURITY-009. **Bonus fix found+closed in the same pass:** `customers.controller.ts:getResolvedAddresses` used to accept client-supplied `phone`/`customerPhone` query params and merge in *any* matching account's saved addresses — a cross-account address-disclosure oracle keyed by phone number, independent of the missing auth. It now derives everything from the authenticated `req.customerId` only. Frontend (`orderService.ts`, `supabase.ts`, `OrderTrackingPage.tsx`, `ThankYouPage.tsx`) updated to send `Authorization: Bearer <token>` via a new `utils/authHeader.ts` helper. Both type-checks pass; the customer mobile app already sent the real token (no change needed there). **Still open:** `tracking.routes.ts`, `notifications.routes.ts`, `coupons.routes.ts`, `delivery.routes.ts`, and the checkout endpoints (`/place`, `/create`) remain unauthenticated — see #2 below.
2. ✅ **DONE (2026-06-21):** Unauthenticated routers locked down. `tracking.routes.ts` now gates all read endpoints on `requireCustomer` and write endpoints (`POST /updates`, `PUT /agents/:agentId/location`) on `requireRider`. `notifications.routes.ts` gates user-scoped endpoints on `requireCustomer` and `POST /send` on `requireAdmin`. `coupons.routes.ts` gates all CRUD on `requireAdmin`; `/active` remains public and `/validate` requires `requireCustomer`. `delivery.routes.ts` gates all routes on `requireAdmin`. A new `backend/src/middleware/adminAuth.middleware.ts` validates tokens against `admin_sessions` (same table login writes to). Invoice admin/generate routes and checkout endpoints (`/place`, `/create`) remain unauthenticated — see #2 follow-up below.
   - **Still open (Tier 1 follow-up):** `orders.routes.ts:/place` and `/create` trust `user_id`/`customer_id` from the request body; closing requires the checkout flow to send the session token.
3. ✅ **DONE (2026-06-21):** Razorpay webhook HMAC verification fixed. `server.ts` now registers `express.raw({ type: 'application/json' })` for `/api/payment/webhook` before `express.json()`, so `req.body` arrives as a raw `Buffer`. `payment.controller.ts:handleWebhook` passes that buffer directly to `verifyWebhook` and then parses it with `JSON.parse` after the signature check. `payment.service.ts:verifyWebhook` accepts `Buffer | string` and no longer calls `JSON.stringify` on a parsed object. The `RAZORPAY_KEY_SECRET` fallback is removed — if `RAZORPAY_WEBHOOK_SECRET` is absent, all webhooks are rejected with a logged error. `RAZORPAY_WEBHOOK_SECRET` is now documented in `backend/.env.example`.
4. ✅ **DONE (2026-06-21):** `order_store_allocations` insert failures now throw instead of being silently swallowed (`orders.controller.ts`) — a failed allocation surfaces as a 500 so the caller knows the order is incomplete rather than silently losing shopkeeper visibility.
5. ✅ **DONE (2026-06-21):** `customer_orders` totals no longer hardcoded to 0 in the legacy `createOrder` path. After building all store orders, `orders.controller.ts` computes `subtotal_amount`, `delivery_fee`, and `total_amount` and back-fills them on the `customer_orders` row via a separate UPDATE.
6. ✅ **DONE (2026-06-21):** `storeOwner.controller.ts` now has real authorization. A shared `resolveShopkeeperFromToken` helper validates the Bearer token against `app_users.session_token` with `role = 'shopkeeper'`. `getStores` uses the resolved `userId` instead of a query param. `updateStoreStatus` and `updateStore` add an ownership check (403 if the store doesn't belong to the caller). `updateProductQuantity` adds an ownership check via store lookup (403 if the product isn't in one of the caller's stores).

**Tier 2 — Admin panel integrity:**
7. **Two parallel, inconsistently-wired admin auth systems** (`adminAuthService.ts` direct-DB login vs `secureAdminAuth.ts`/edge-function logout) — logout never deletes the real `admin_sessions` row server-side, so a stolen/leaked `x-admin-token` stays valid up to 12h after "logout".
8. **No server-side or RLS role enforcement** — `hasPermission()` is UI-only; the `admins` table has no tracked RLS policy in any migration; any admin (even `viewer`) can create/edit/delete other admins via direct Supabase calls.
9. **`CustomerDetailPage.tsx` order-history filter compares `customer_id` against a field that's actually mapped as `user_id`** — every customer's order history table is permanently empty.
10. **`getAdminInvoice` backend route has zero auth**, and the admin UI's own Bearer token for it is always empty (`localStorage['admin_id']` is never written anywhere — admin identity lives in `sessionStorage['adminData']`).

**Tier 3 — Customer-web money/UX correctness:**
11. **Hardcoded ₹30 delivery fee** (`frontend/src/context/CartContext.tsx:32`) bypasses the working distance-tier calculator in `utils/deliveryFees.ts` — direct pricing-fairness/revenue bug.
12. **Split payment UPI portion is never charged through Razorpay** (`CheckoutPage.tsx:478`) — silently dropped.
13. **GSTIN/business name captured but discarded** from the order payload, plus misleading "claim GST credit" UI copy promising a feature that doesn't exist end-to-end.
14. **Address update/delete/set-default bypass the backend entirely**, hitting Supabase directly with the anon key (`frontend/src/services/supabase.ts:1188,1246,1269`) — a second, RLS-dependent failure path on top of the backend's own 501 stubs.

**Tier 4 — Structural gaps (large, multi-step):**
15. The entire order-lifecycle **notification system is 100% stubbed** — no email/SMS/push/in-app notifications anywhere (`notification.service.ts`, plus 6 stub functions in `database.service.ts`).
16. **No payout/earnings system exists anywhere** on the platform — admin has nothing to show, and the rider app's `earnings.tsx`/`profile.tsx` fabricate a flat-15%-of-order-total estimate client-side with zero backend behind it.

**Tier 5 — Mobile apps (now in scope, Round 2):**
17. **Customer app's core purchase flow requires the service-role key to function at all** — `nearandnowcustomerapp/lib/supabase.ts:62-69` (`assertSupabaseAdminConfigured`) *throws* if the service-role key is absent, and it gates `createOrder`, all address CRUD, and `getCurrentUserFromSession`. The key can't be safely removed from the bundle (closing the APK-decompile vulnerability) without first moving these flows to real backend endpoints — this is the actual blocker behind the already-known "service-role key bundled in APK" finding, not just an oversight.
18. ✅ **DONE (2026-06-16):** `invoice.controller.ts`'s `requireCustomer` no longer accepts a bare UUID — see Tier 1 #1. The customer mobile app's `lib/apiClient.ts` already sent the real session token, so this fix makes that token actually meaningful on the invoice routes (and on `orders`/`customers` routes) without any mobile-app change required.
19. **Shopkeeper app: multi-store hardcoding (`stores[0]`) has spread to 6 files** (`home.tsx`, `payments.tsx`, `previous-orders.tsx`, `stock.tsx`, `inventory.tsx`, `profile.tsx`) while a correct, ready-to-wire `hooks/useStore.ts` sits completely unused (zero importers).
20. **Shopkeeper push notifications are structurally impossible** — `lib/notifications.ts` calls `/store-owner/notifications/register` and `/store-owner/notifications/preferences`, neither of which exist on the backend; 404s are silently swallowed so shopkeepers believe push is configured when it cannot work at all.
21. **No admin-approval gate before a store/rider can go online** — for the shopkeeper app this is completely unimplemented (zero matches for `approval_status`/`is_approved` anywhere in the repo); the rider app does this correctly and can be used as the reference pattern.
22. **Document upload/number fields bypass edit-mode** in the shopkeeper profile (`app/profile.tsx:394,403,415` — `editing` hardcoded `true` or the gate omitted entirely) — verification documents can be changed at any time with no Edit click required.

---

## Part 1 — Backend (`backend/src/**`, `api/index.ts`)

### Status of original findings
- ✅ FIXED (2026-06-16) — Customer OTP token generated but never persisted. `auth.controller.ts:320-336` now writes `session_token` to `app_users` on both login and signup, and a new `requireCustomer` middleware (`middleware/customerAuth.middleware.ts`) actually validates it — wired into `customers.routes.ts`, the customer-scoped routes in `orders.routes.ts`, and `invoice.routes.ts`. See Tier 1 #1 in the punch list for full detail and the bonus address-disclosure fix found in the same pass.
- ✅ FIXED — No rate limiting on OTP send/verify. `auth.routes.ts:22-42` now registers `express-rate-limit` (`sendOtpLimiter` 5/10min, `verifyOtpLimiter` 10/15min) keyed by phone.
- 🟡 PARTIALLY FIXED — Webhook HMAC verification always fails. Body is now pre-parsed by global `express.json()` and `payment.service.ts:393` still does `JSON.stringify(body)` against it — no raw-body capture exists anywhere (no `express.raw`/`verify:` option). Same root cause, still broken in practice.
- ❌ STILL BROKEN — `updateOrderStatus` returns 501. `orders.controller.ts:144-153` still voids params and returns 501.
- ✅ FIXED (2026-06-23) — Payment order creation has no idempotency key. `payment.service.ts:razorpayRequest` now accepts an optional `idempotencyKey` header. `createPaymentOrder` passes `ord_<orderId>` (or `ord_<orderId>_split` for split payments) as `X-Razorpay-Idempotency-Key`.
- ❌ STILL BROKEN — Webhook verification falls back to the API key. `payment.service.ts:389` unchanged: `RAZORPAY_WEBHOOK_SECRET || RAZORPAY_KEY_SECRET`.
- ✅ FIXED (2026-06-23) — Coupon validation ignores `min_order_value`. `database.service.ts:validateCoupon` now accepts an optional `orderTotal` parameter and throws if `orderTotal < coupon.min_order_value`. `coupons.controller.ts` extracts and passes `orderTotal` from the request body.
- ✅ FIXED (2026-06-23) — Coupon usage-count race condition. New `databaseService.recordCouponUsage(couponId, customerId, orderId)` inserts into `coupon_redemptions` and increments `usage_count`. Called from `orders.controller.ts:createOrder` after successful order creation. `placeCheckoutOrder` path does not yet support coupon_id (omitted from the frontend payload — separate follow-up).
- ❌ STILL BROKEN (backend root cause confirmed) — Expired coupons appear in the list. `GET /api/coupons/` → `getCoupons()` has no active/expiry filter; the filtered version only exists at the separate `/active` endpoint.
- ❌ STILL BROKEN — Legacy `createOrder` hardcodes ₹20 delivery fee, zeroes all totals. `orders.controller.ts:74`, `database.service.ts:303-306`.
- ❌ STILL BROKEN — `cancelOrder` doesn't update `order_store_allocations`. `database.service.ts:393-474` only touches `store_orders`/`customer_orders`.
- ❌ STILL BROKEN — Rider `acceptOrder` jumps straight to `in_transit`. `deliveryPartner.controller.ts:327`.
- ❌ STILL BROKEN — `getDeliveryAgents` ignores `_partnerId`. `database.service.ts:1372-1379`.
- ❌ STILL BROKEN — `acceptOffer` follow-up writes non-atomic. `deliveryPartner.controller.ts:639-678` — RPC then sequential unguarded updates.
- ❌ STILL BROKEN — `customers.controller.ts updateAddress` 501 stub (55-63).
- ❌ STILL BROKEN — `customers.controller.ts deleteAddress` 501 stub (65-73).
- ❌ STILL BROKEN — All order notification methods are empty stubs. `notification.service.ts:77-81` all `{}`; `sendEmail`/`sendSMS` (53-63) still `console.log` + TODO.
- ❌ STILL BROKEN — `sendPushNotification` only queries `delivery_partners` (65-75).
- ❌ STILL BROKEN — `getUserNotifications` ignores params, returns `[]` (1439-1441).
- ❌ STILL BROKEN — `markNotificationAsRead` no DB write (1443-1445).
- ❌ STILL BROKEN — `markAllNotificationsAsRead` no DB write (1447-1449).
- ❌ STILL BROKEN — `getNotificationPreferences` hardcoded values (1451-1453).
- ❌ STILL BROKEN — `updateNotificationPreferences` echoes input, no write (1455-1457).
- ❌ STILL BROKEN — Delivery simulation endpoint has no auth. `delivery.controller.ts:8-22`, `delivery.routes.ts:21`.
- ❌ STILL BROKEN — Driver broadcast uses delivery address not store location. `delivery.controller.ts:187,212`, `shopkeeper.controller.ts:489-502`.
- ❌ STILL BROKEN — Customer not notified on reallocation failure. `shopkeeper.controller.ts:reallocateMissingItems` (348-423), still 4km cap, no notification call.
- ❌ STILL BROKEN — `getOrderTrackingFull` writes to `stores` table on every poll. `database.service.ts:1562-1567`.
- ❌ STILL BROKEN — `broadcastToNearbyDrivers` has no staleness filter. `shopkeeper.controller.ts:488-532` (contrast `delivery.controller.ts:210-212`, which has one).
- ❌ STILL BROKEN — No global Express error handler. `server.ts` (86 lines), no 4-arg error middleware.
- ❌ STILL BROKEN — `express.json()` has no body size limit. `server.ts:56`.
- ❌ STILL BROKEN — Three independent haversine implementations (within backend alone: `database.service.ts:1144`, `delivery.controller.ts:203-207`, `shopkeeper.controller.ts:19`).
- ❌ STILL BROKEN — `getAgentSchedule` ignores params, returns `[]` (1406-1408).
- 🟡 PARTIALLY FIXED — `supabaseAdmin` silent fallback to anon client. `config/database.ts:18-48` now validates the service-role key's JWT `role` claim and logs loud errors — diagnostics improved, but the fallback to the anon client (57-61) still happens and DB ops still get silently RLS-filtered instead of failing closed.
- ❌ STILL BROKEN — `storeOwner.controller.ts getStores` reads `userId` from query param. Comment "TEMPORARY... NOT secure" still at line 27; Bearer token never validated (line 20).
- ❌ STILL BROKEN — `updateStoreStatus`/`updateProductQuantity` no ownership check (72-122, 182-243).
- ❌ STILL BROKEN — Invoice generation endpoint has zero auth. `invoice.routes.ts:44-47`.
- ✅ FIXED (2026-06-16) — `requireCustomer` uses UUID as Bearer token. The broken local copy in `invoice.controller.ts` was deleted; `invoice.routes.ts` now imports the real, session-token-checking `requireCustomer` from `middleware/customerAuth.middleware.ts`.
- ✅ FIXED (2026-06-16) — `requireShopkeeper` looks up by `id` not `session_token`. The broken local copy in `invoice.controller.ts` was deleted; `invoice.routes.ts` now imports the correct `requireShopkeeper` from `shopkeeper.controller.ts` (which already used `session_token`).
- ❌ STILL BROKEN — `getProductById` fetches entire catalog then `.find()`s. `products.controller.ts:51-66`.
- ❌ STILL BROKEN — `getNearbyStores` full-scan + JS distance filter. `database.service.ts:261-279`.
- ❌ STILL BROKEN — `getProductsWithDetails` full-scan + JS radius filter. `database.service.ts:223-259`.
- ❌ STILL BROKEN — CORS allows all origins when `ALLOWED_ORIGINS` unset. `server.ts:42-45`.
- ✅ FIXED (2026-06-23) — `PaymentStatus` type has `'completed'` but not `'paid'`. `database.types.ts:14` now `'pending' | 'authorized' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded'`, matching the real Postgres enum.
- ✅ FIXED (2026-06-23) — `OrderStatus` type missing `'picking_up'`. Added to `database.types.ts:3-12`.
- ✅ FIXED (code-level) — `invoice_documents` duplicate-PDF generation. `invoice.service.ts:1084` now upserts on `(invoice_id, document_type)` and checks-before-generate (1113-1120). Cannot re-verify the historical live row counts, but the bug causing them is closed.
- ❌ STILL BROKEN — `tracking_events` table dead code. Zero inserts anywhere in `backend/src`; only `order_status_history` is written.
- ❌ STILL BROKEN — Resend/email provider never configured. `notification.service.ts:53-57`, no email SDK in `package.json`, no key in `.env.example`.
- ⚠️ COULD NOT VERIFY (live DB) — RPC `alculate_customer_order_total` typo, `products` spurious columns, two cross-wired admin tables, `master_products_old` exposure, `customers`/`app_users` row gap, `customer_payments` row gap, `order_store_allocations` row gap (26/70) (mechanism confirmed plausible: silent swallow at `orders.controller.ts:106`), two product-image buckets.

### New findings
- ✅ FIXED (2026-06-16) — **[Backend][Security] `orders.routes.ts` has no authentication or ownership checks** — `GET /:orderId`, `GET /customer/:customerId`, `POST /:orderId/cancel` (`orders.routes.ts:61-66`) now require `requireCustomer` plus an explicit ownership check in the controller (403 if `order.customer_id !== req.customerId`). `POST /place` and `POST /create` (checkout) remain unauthenticated — not in the original finding's scope, tracked separately.
- ✅ FIXED (2026-06-16) — **[Backend][Security] `customers.routes.ts` has no authentication on any address route** — all 5 routes now require `requireCustomer`, with ownership checks added to `getAddresses`/`createAddress`. `updateAddress`/`deleteAddress` are gated too but remain 501 stubs (separate ticket, ORDER-007/008).
- **[Backend][Security] `tracking.routes.ts` has no authentication** — `POST /orders/:orderId/updates` (`tracking.routes.ts:18`) accepts arbitrary status/location and overwrites `customer_orders`/`store_orders` status with no auth check.
- **[Backend][Security] `storeOwner.controller.ts updateStore` has no ownership verification** — `updateStore` (353-393) lets any non-empty Bearer header PATCH any store's name/address/phone/images/verification document.
- **[Backend][Database] `RAZORPAY_WEBHOOK_SECRET` / `RESEND_API_KEY` referenced in code but absent from `.env.example`** — no template prompts operators to set the webhook secret, making the API-key-fallback bug more likely in real deployments.
- **[Backend][Notification] `notifications.routes.ts` has no authentication on any route** — currently low-impact (backing functions are stubs) but `POST /send` already calls real `notificationService.sendOrderNotification`; becomes a spam/exposure vector once stubs are implemented.
- ✅ FIXED (2026-06-23) — **[Backend][Code Quality] Payment flow throws when hitting a legacy zero-total order** — `payment.service.ts` now attaches `statusCode: 400` to the error when `total_amount` is zero/invalid; `payment.controller.ts:createPaymentOrder` returns HTTP 400 (not 500) with the error message, so the caller knows it's a bad order rather than a server crash.

### Backend — Top priorities
1. Webhook HMAC verification — capture raw body, fix `JSON.stringify` mismatch, remove API-key fallback.
2. Lock down `orders.routes.ts`, `customers.routes.ts`, `tracking.routes.ts`, `storeOwner.controller.ts` with real auth + ownership checks.
3. Persist the customer OTP session token.
4. Fix `order_store_allocations` silent-swallow + zeroed `customer_orders` totals.
5. Implement the notification system (email/SMS/push/in-app) end to end.

---

## Part 2 — Frontend / Customer Web (`frontend/src/**`)

### Status of original findings
- ✅ FIXED — `DriverApp.tsx`/`ShopkeeperApp.tsx` wrong auth paths. Both now call `/api/auth/send-otp` and `/api/auth/verify-otp` correctly (`DriverApp.tsx:105,121`, `ShopkeeperApp.tsx:72,88`), matching `auth.routes.ts:40-41`.
- ❌ STILL BROKEN — Checkout email field has `required`. `CheckoutPage.tsx:803`.
- ❌ STILL BROKEN — GSTIN/business name collected but excluded from order payload. State exists (82-83, UI 1094-1118) but `orderData` (452-475) never includes them.
- ✅ FIXED (2026-06-23) — Hardcoded ₹30 delivery fee. `getDeliveryFeeForSubtotal` import removed from `CheckoutPage.tsx`; all 5 call sites replaced with `getFeeBreakdown().deliveryFee` from `useCart()`, which uses the real distance-tier calculator in `utils/deliveryFees.ts`.
- ✅ FIXED (2026-06-23) — Split payment UPI portion never charged via Razorpay. `CheckoutPage.tsx` now detects `splitEnabled && splitUpiAmount > 0` and opens Razorpay for the UPI portion only. `supabase.ts:createOrder` forwards `split_upi_amount`/`split_cash_amount` to the backend. `database.service.ts:placeCheckoutOrder` stores them in `notes` as JSON. `payment.service.ts:createPaymentOrder` reads `split_upi_amount` from order notes and uses it as the Razorpay charge amount. `payment.controller.ts:verifyPayment` compares against `split_upi_amount` (not `total_amount`) for split orders.
- ❌ STILL BROKEN — No empty-cart redirect at checkout. Only a submit-time guard exists, no mount-time redirect.
- 🟡 PARTIALLY FIXED — `getCurrentUserFromSession` uses anon client, blocked by RLS. Still broken at `authService.ts:179`, but `AuthContext.tsx:44` now restores sessions from `localStorage` directly on mount, so the user-facing "logged out on every refresh" symptom is masked/contained even though the underlying function is still broken.
- ✅ FIXED — Order tracking hook leaking service-role key. `services/supabase.ts:34` now builds `supabaseAdmin` from the anon key — no service-role key anywhere in `frontend/src` (confirmed via grep). Variable name is now misleading but the vulnerability is gone.
- ❌ STILL BROKEN — Realtime + 3s polling interval run simultaneously. `useOrderTrackingRealtime.ts:141` unconditional `setInterval`.
- ❌ STILL BROKEN — No `AbortController` on in-flight tracking fetches. `useOrderTrackingRealtime.ts:69,154-161`.
- 🟡 PARTIALLY FIXED — `CartContext.addToCart` mutates cart item in place. `CartContext.tsx:121-124` replaces the array reference (so top-level re-render still fires) but still mutates the item object at that index in place — latent bug if any child ever uses per-item `React.memo`.
- ❌ STILL BROKEN — Address geocoding and order placement run in parallel; orders can get null coordinates. `CheckoutPage.tsx:366-475`.
- ❌ STILL BROKEN — Driver location polled every 2s unconditionally. `useOrderTrackingRealtime.ts:163`, no realtime-state gating.

### New findings
- **[Customer Web][Bug] OrderTrackingPage "Invoice" link points to a non-existent route** — `OrderTrackingPage.tsx:738` links to `/api/invoices/${orderId}`, which doesn't exist (real routes are `/api/invoices/order/:orderId/{customer,store,delivery}`). Always 404s. Contrast `OrdersPage.tsx:252`, which calls the correct path.
- **[Customer Web][Security] Invoice download sends the customer's raw UUID as Bearer token** — `OrdersPage.tsx:253` sends `Authorization: Bearer ${user.id}`, the live frontend call-site proof of the backend's UUID-as-token flaw.
- **[Customer Web][Bug] `updateAddress`/`deleteAddress`/`setDefaultAddress` bypass the backend API, hit Supabase directly with the anon client** — `services/supabase.ts:1188,1246,1269` — unlike `getUserAddresses`/`createAddress`, these three never route through `/api/customers/...`; depends entirely on RLS permitting anon writes, a separate failure mode from the backend's 501 stubs.
- **[Customer Web][Code Quality] `ProtectedRoute` component defined but never used** — `components/ProtectedRoute.tsx` is dead code; `CheckoutPage`/`ProfilePage`/`OrdersPage`/`AddressesPage` each duplicate their own inline auth-redirect guard instead.
- **[Customer Web][Env] Stale/undocumented Vite env vars** — `.env.example` documents `VITE_SUPABASE_SERVICE_ROLE_KEY` which nothing reads anymore; `VITE_ENCRYPTION_KEY` is read by `utils/encryption.ts:5` (itself dead code, unused elsewhere) but undocumented.
- **[Customer Web][UI] GSTIN "claim GST credit" copy is misleading** — `CheckoutPage.tsx:1090` promises a benefit that can't happen since GSTIN is dropped from the payload.

### Frontend — API call vs backend route audit
All checked call sites in `frontend/src` (auth, delivery-partner test flow, shopkeeper test flow, orders, tracking, payments, places, invoices, delivery simulation) correctly match registered backend routes — **except** the dead invoice link above. The previously-documented `/api/auth/otp` vs `/api/auth/send-otp` mismatch is fixed, and all bare-prefix routes (`/delivery-partner`, `/shopkeeper`, `/store-owner`) match `server.ts` mounts and `vite.config.ts`/`vercel.json` proxy entries.

### Frontend — Top priorities
1. Hardcoded ₹30 delivery fee → wire up `utils/deliveryFees.ts`.
2. Split-payment UPI charge is dropped.
3. GSTIN/business name dropped from order payload.
4. Address mutate operations bypass the backend (anon-key dependent).
5. Dead invoice link on the tracking page.

---

## Part 3 — Admin Web (`admin/src/**`)

### Status of original findings
- ❌ STILL BROKEN — `navigator.userAgent` called unguarded. `adminAuthService.ts:119`, same pattern in `auditLog.ts:37,62,78`.
- 🟡 PARTIALLY FIXED — NotificationsPage no longer calls Expo directly from the browser (`PushNotificationPanel.handleSend`, lines 49-92) — but it now does *nothing* except insert an `admin_notifications` log row while claiming success; the security hole is closed but the feature is a no-op.
- ❌ STILL BROKEN — `StoresPage.tsx` uses the anon client, not `getAdminClient()` (lines 17, 40). Currently works only because `stores` has a public-read RLS policy; inconsistent with every other admin page and would break on any future write.
- ❌ STILL BROKEN — No per-endpoint permission enforcement. `hasPermission()` is only called from React components reading editable `sessionStorage`; no RLS/middleware enforces role.
- ❌ STILL BROKEN — Admin creation has no server-side role check. No RLS policy on `admins` exists in any migration at all.
- ❌ STILL BROKEN — `getCustomers` returns all `app_users` with no role filter (`adminService.ts:703-706`).
- ❌ STILL BROKEN — Status mapping collapses statuses into 5 states (`mapDbStatusToFrontend`, 447-454).
- ❌ STILL BROKEN — `updateOrderStatus` maps `confirmed` → `store_accepted`, skipping `preparing_order` (662-668).
- ❌ STILL BROKEN — `getOrders`/`getOrderById` N+1 fetch pattern (457-565, 612).
- ❌ STILL BROKEN — Admin session in `sessionStorage` only (`AdminLoginPage.tsx:46-48`).
- ❌ STILL BROKEN — Session not deleted on logout. `AdminHeader.tsx:125-135`/`AdminSidebar.tsx:75-85` call `secureAdminLogout()`, which deletes from `admin_refresh_tokens` — a table the actual login flow never wrote to. The real `admin_sessions` row from login is never touched.
- ⚠️ COULD NOT VERIFY / appears not reproducible as described — Failed-login audit logging throwing. `logFailedLogin`/`logSecurityEvent` (`auditLog.ts:25-45,50-67`) each catch and swallow their own errors internally; cannot currently throw and mask the caller as originally described.
- 🟡 PARTIALLY FIXED — SettingsPage not persisted. Notification + Appearance prefs now persist to `localStorage` (lines 217-268, 274-339); Account/password persists via `updateAdmin()` to the DB. A "Payment settings" tab was removed entirely rather than fixed. localStorage-only means prefs don't follow the admin across devices.
- ❌ STILL BROKEN — Admin panel queries non-existent `newsletter_subscriptions` table (`admin/src/services/supabase.ts:889-956`). Currently dead/unused — no admin page calls `subscribeToNewsletter` — so the crash risk is latent rather than live today.

### New findings
- **[Admin Web][Auth] Two parallel, inconsistent admin auth systems** — `adminAuthService.ts` (direct-DB login, `admin_sessions`) vs `secureAdminAuth.ts`/edge function (JWT, `admin_refresh_tokens`). Login uses the former exclusively; route guards (`AdminRoutes.tsx:25,32`) and logout buttons use the latter. Net effect: logout never invalidates the real session server-side.
- **[Admin Web][Bug] `OrderDetailPage` invoice download Bearer token is always empty** — reads `localStorage.getItem('admin_id')` (`OrderDetailPage.tsx:120`), but nothing ever writes that key (admin identity lives in `sessionStorage['adminData']`). Compounded by `getAdminInvoice` (`invoice.controller.ts:255-285`) having zero auth check regardless.
- **[Admin Web][Bug] `CustomerDetailPage` order-history filter always empty** — filters `o.customer_id === id` (`CustomerDetailPage.tsx:27`), but `getOrders()` maps the field as `user_id` (`adminService.ts:529`). Every customer's order history table renders empty.
- **[Admin Web][Security] `coupons.routes.ts`/`delivery.routes.ts` have zero authentication** — full CRUD on coupons and delivery partners is reachable by anyone with the API base URL, bypassing Supabase RLS entirely via the backend's own service-role client. Worse than the already-documented anon-client issues.
- **[Admin Web][Auth] Login rate limiting is in-memory/client-side only** — `utils/rateLimit.ts` is a singleton `Map` that resets on page refresh; the real backstop is the DB `is_account_locked()` RPC (5 attempts/15min), but the advertised client throttle is cosmetic and trivially bypassed by scripting the Supabase REST API directly.
- **[Admin Web][Security] `admins` table has no tracked RLS policy in any migration** — its actual live RLS state (the most sensitive table in the system, password hashes) is outside version control entirely.
- **[Admin Web][Bug] Password-strength schemas defined but never used** — `admin/src/schemas/admin.schema.ts:11-39,41-68` enforce upper/lower/digit/special-char, but are never imported; the actually-used create/edit pages only check `length < 8`, so 8-character weak passwords like `aaaaaaaa` are accepted.
- **[Admin Web][Data] Several pages parse `sessionStorage['adminData']` directly instead of via the shared `getCurrentAdmin()` helper** — duplicated, uncaught `JSON.parse` in 3 separate components.

### Admin — Top priorities
1. Unify the two admin auth systems — make logout actually invalidate the DB session used at login.
2. Add RLS policy + migration for `admins`, and enforce role server-side (not just `hasPermission()` in the UI).
3. Lock down `coupons.routes.ts`/`delivery.routes.ts` with admin auth middleware.
4. Fix `getAdminInvoice` auth and the broken `admin_id` Bearer token.
5. Fix `CustomerDetailPage`'s `customer_id`/`user_id` field mismatch and `StoresPage.tsx`'s anon client usage.

---

## Part 4 — Database / Supabase Schema (`supabase/migrations/**`, `supabase/functions/**`)

### Status of original findings
- ❌ STILL BROKEN — `PaymentStatus` type wrong. `database.types.ts:14` has `'completed'` (not even a real enum value) and is missing `'paid'`, `'authorized'`, `'cancelled'`, `'partially_refunded'` — confirmed against the real Postgres enum in `20260405000000_combined_customer_payments_enums_payouts.sql:15-23`.
- ❌ STILL BROKEN — `OrderStatus` type missing `'picking_up'`, confirmed added to the DB enum in `20260505000000_add_picking_up_order_status.sql:6` but absent from `database.types.ts:3-12`.
- ⚠️ COULD NOT VERIFY (live DB, not in tracked migrations) — RPC `alculate_customer_order_total` typo; no backend code calls either spelling.
- 🟡 PARTIALLY VERIFIED — `products` spurious columns: `product_name` is migration-confirmed real (`20260406131000_add_product_name_to_products.sql`); `name`/`phone`/`deleted_at` appear in no migration and aren't in the hand-maintained type — can't confirm or deny without live DB.
- ⚠️ COULD NOT VERIFY — Two cross-wired admin tables (`admins` vs `admin_users`). All tracked code/migrations reference only `admins` + `admin_sessions`/`admin_refresh_tokens`/`failed_login_attempts` — `admin_users` appears nowhere in this repo. If it exists live, it's entirely untracked.
- ⚠️ COULD NOT VERIFY — `master_products_old` exposure, `customers`/`app_users` row gap, `customer_payments` row gap, two product-image buckets — all live-data claims.
- 🟡 LIKELY STILL TRUE — `order_store_allocations` 26/70 row gap: row count unverifiable, but the silent-swallow mechanism that would cause it is confirmed present (`orders.controller.ts:97-107`).
- 🟡 LIKELY STILL TRUE — `tracking_events` permanently empty: table exists (`20260427000001_tracking_enhancements.sql:20-30`), route registered, but zero insert call-sites found anywhere in `backend/src`.
- ✅ FIXED — DriverApp/ShopkeeperApp wrong auth paths (cross-confirmed independently, see Part 2).

### New findings
- **[Backend][Database] `customer_orders` totals hardcoded to 0 at the legacy `createOrder` path** (cross-confirmed with Part 1) — `database.service.ts:282-314` writes `subtotal_amount/delivery_fee/discount_amount/total_amount: 0` unconditionally; `orders.controller.ts:74` separately hardcodes `delivery_fee: 20` only on the per-store row, never reconciled back up to the parent order.
- **[Cross-App][Auth] Two parallel admin auth systems** (cross-confirmed with Part 3) — login writes to `admin_sessions`, logout reads/deletes from `admin_refresh_tokens` via the edge function, which the login flow never populated.
- **[Admin Web][Security] Push "send" no longer leaks to Expo but is now a no-op** (cross-confirmed with Part 3).
- **[Backend][Security] `supabaseAdmin` fallback hardened but not eliminated** (cross-confirmed with Part 1) — `config/database.ts:18-48` now validates the JWT role claim and logs loudly, but still silently degrades to the anon client rather than refusing to start.

### Cross-cutting route/proxy audit
All checked frontend/admin call sites match real backend route mounts. The `45db3e4` commit's `vite.config.ts` dev-proxy and root `vercel.json` rewrites for `/delivery-partner`, `/shopkeeper`, `/store-owner` are a genuine production fix **for the `frontend` Vercel deployment only**. One latent gap found:

- **`admin/vercel.json` has only an SPA fallback rewrite (`/(.*) → /index.html`) — no backend proxy/rewrite at all.** The admin app relies entirely on `VITE_API_URL` being set correctly in its own Vercel project for every backend call. If that env var is ever unset on the admin deployment, every `fetch()` silently becomes a same-origin request to the admin's own static site and fails. Today no admin page calls the bare-prefix routers (`/store-owner`, `/shopkeeper`, `/delivery-partner`) — only `frontend`'s internal test pages do — so this is a configuration risk, not a live bug, but it's worth hardening `admin/vercel.json` to match `frontend`'s pattern.

### Env var consistency issues
- `RAZORPAY_WEBHOOK_SECRET` — read by `payment.service.ts:7,389`, present in the actual `.env`, but missing from both `.env.example` and `backend/.env.example`.
- `VITE_ENCRYPTION_KEY` — read by `frontend/src/utils/encryption.ts:5` (dead code), undocumented anywhere, silently falls back to a hardcoded string `'default-key-change-in-production'`.
- `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (non-VITE) — documented in `backend/.env.example` but absent from the actual root `.env` (which only has `VITE_`/`EXPO_PUBLIC_`-prefixed vars). Functional today only because `database.ts` falls back across both naming schemes — but it's exactly the kind of drift that has caused service-role-key problems before.
- `GOOGLE_MAPS_SERVER_API_KEY` — referenced in backend code, only present as a commented-out line in `backend/.env.example`.
- `VITE_SUPABASE_SERVICE_ROLE_KEY` — documented in `.env.example` but nothing reads it anymore (see Part 2 fix).

### Database — Top priorities
1. Fix `PaymentStatus`/`OrderStatus` TS types to match the real Postgres enums.
2. Get live Supabase access (dashboard or `psql`) to confirm/deny the row-count and schema-pollution claims (`alculate_customer_order_total` typo, spurious `products` columns, dual admin tables, `master_products_old`, image buckets) — these are the only items this static re-audit categorically could not settle.
3. Document `RAZORPAY_WEBHOOK_SECRET` in `.env.example` files.
4. Harden `admin/vercel.json` with an explicit backend rewrite as a defense-in-depth measure.

---

## Part 5 — Mobile Apps (`nearandnowcustomerapp/`, `near-now-store_owner/`, `NAT_Near-Now_Rider-/`)

Repos live at `F:\Coding\Near-Now\nearandnowcustomerapp`, `F:\Coding\Near-Now\near-now-store_owner`, `F:\Coding\Near-Now\NAT_Near-Now_Rider-` (siblings of this repo). Re-verified against `qa_audit_old.md` and cross-checked against this repo's `backend/src/routes/*.ts`.

### 5.1 Customer Mobile App (`nearandnowcustomerapp/`)

**Status of original findings**
- ❌ STILL BROKEN — Service-role key bundled via `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. `lib/supabase.ts:31-34` reads it; the key is present in the local `.env`. Worse than originally scoped: `lib/supabase.ts:62-69` (`assertSupabaseAdminConfigured`) **throws** if it's absent, and gates `createOrder`, all address CRUD, and `getCurrentUserFromSession` — so a build that correctly omits the key breaks core purchase/account flows outright. This is a structural blocker, not a leftover dev convenience.
- ✅ FIXED (2026-06-16) — Customer app uses UUID as Bearer token. `lib/apiClient.ts` already sent the real persisted `session_token`; the backend's `requireCustomer` (`invoice.controller.ts` → now `middleware/customerAuth.middleware.ts`) was fixed to actually check it, so the mobile app's existing behavior is now meaningfully secure with no app-side change needed.
- 🟡 PARTIALLY FIXED — `getCurrentUserFromSession` uses `supabaseAdmin`. Still true at `lib/authService.ts:135`, but `AuthContext.tsx:72-81` now optimistically hydrates from `AsyncStorage` first, masking the symptom for already-logged-in users even though a fresh lookup still depends on the service-role key.
- ❌ STILL BROKEN — Session tokens in plain AsyncStorage. `AuthContext.tsx:162-168`; no `expo-secure-store` dependency anywhere in `package.json`.
- ❌ STILL BROKEN — Checkout extra fields concatenated into `notes` string. `app/support/checkout.tsx:262-280`, `lib/orderService.ts:272-280,370`.
- ❌ STILL BROKEN — Wallet screen is a non-functional shell. `app/wallet.tsx:37-45,79`.
- 🟡 PARTIALLY FIXED — Saved-payment-methods skeleton. `app/support/payment-options.tsx:131-137` now renders a proper empty state instead of a permanent skeleton; the feature itself is still unimplemented end-to-end.
- ❌ STILL BROKEN — Payment reconcile loop has no circuit breaker. `hooks/usePaymentFlow.ts:72-88` still polls the full 10s window, only short-circuits on `'paid'`, never on cancelled/failed.
- ❌ STILL BROKEN — Realtime + polling run simultaneously. `hooks/useOrderTracking.ts:78-153` — realtime channel, 5s fallback interval, and a separate 2s driver-location poll all run concurrently regardless of connection state.
- ❌ STILL BROKEN — Push token registration calls `/api/push-token`, which doesn't exist anywhere in the backend. `hooks/usePushNotifications.dev.ts:110`, 404 silently swallowed (`.catch(() => {})`).

**New findings**
- **[Customer App][Bug] Coupons screen bypasses the backend, never filters expired coupons** — `app/product/coupons.tsx:38-46` queries `supabaseAdmin.from('coupons')` directly, filters only `is_active`, never checks `expires_at`.
- **[Customer App][Bug] Hardcoded flat ₹25 delivery fee** — `constants/fees.ts:3,7-9`, the customer-app twin of the web's hardcoded-₹30 bug; real distance data is computed (`lib/distanceUtils.ts`) but only used for a UI warning, never for pricing.
- **[Customer App][Security] Google Maps key called directly from the device, bypassing the backend's own proxy** — `app/location/*.tsx`, `app/profile-setup.tsx` call `maps.googleapis.com` directly with `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`; `backend/src/routes/places.routes.ts` already provides this exact proxy and is never called.
- **[Customer App][Bug] Invoice screen is entirely fabricated client-side, never calls the real backend invoice endpoint** — `app/order/invoice/[id].tsx:38-54` builds a fake invoice with a hardcoded placeholder GSTIN (`lib/invoiceService.ts:108`) instead of calling the working `GET /api/invoices/order/:orderId/customer`. "Download PDF" just shows a "coming in next update" alert.
- ✅ FIXED (2026-06-16) — **[Customer App][Auth] `requireCustomer` doesn't validate the session token the app actually sends** — see Tier-5 #18; the client call site (`lib/apiClient.ts:38,52`) needed no change since it already sent the correct token.

**API call vs backend route mismatches:** all checked auth/payment/tracking call sites match real routes correctly. The two real gaps are `/api/push-token` (doesn't exist) and the Maps/coupons/order-CRUD/invoice calls that bypass the backend API entirely via direct Supabase access.

**Top priorities:** (1) migrate `createOrder`/address-CRUD/session-restore off the privileged client before the service-role key can be removed; (2) ~~fix `requireCustomer` to check `session_token`~~ — done 2026-06-16; (3) add the missing `/api/push-token` route; (4) reconcile the ₹25 vs ₹30 flat-fee duplication with the web fix; (5) route Maps calls through the existing backend proxy.

### 5.2 Delivery Partner / Rider App (`NAT_Near-Now_Rider-/`)

**Status of original findings**
- 🟡 PARTIALLY FIXED — `verifyOTP` omits `role` field. Bug is technically unchanged in `lib/authService.ts:74`, but that file is now dead code with **zero importers** — the live flow (`app/otp.tsx:107`) correctly sends `role: "delivery_partner"`. Recommend deleting the dead file rather than leaving an inert landmine.
- ❌ STILL BROKEN — Hardcoded admin phone number. `app/(tabs)/home.tsx:544` — `Linking.openURL("tel:+919062692914")`.
- 🟡 PARTIALLY FIXED — OTP auto-submit race. `app/otp.tsx:54-59` unchanged, same race window.
- ❌ STILL BROKEN — Rider app polls active orders every 6s even while offline. `app/(tabs)/home.tsx:294-317`, gated only on `!token`, not `isOnline` (the *offers* poll correctly gates on `isOnline`; the *active-order* poll deliberately doesn't, per its own code comment).
- ✅ FIXED — No admin-approval gate on the online toggle. `app/(tabs)/home.tsx:365,463` correctly blocks until `driverStatus === "active"`, with 30s approval polling and an in-app banner — this is the reference-correct pattern the other two apps should copy.
- ❌ STILL BROKEN — No admin notification on profile-edit click (24h approval workflow). `app/(tabs)/profile.tsx:212-244` still PATCHes directly with no request/audit trail.
- ❌ STILL BROKEN — Rating hardcoded at 4.8. `app/(tabs)/profile.tsx:353`.
- ❌ STILL BROKEN — No vehicle type/image fields. Backend now returns `vehicle_number` (`deliveryPartner.controller.ts:81`) but the profile UI never displays it.
- ❌ STILL BROKEN — No document image upload. `app/(tabs)/profile.tsx:369-387`, read-only text only.
- ✅ FIXED — Pickup-code verification `storeId`/`allocationId` mismatch. `app/delivery/[orderId].tsx:96` now correctly sends `allocation_id`, matching `deliveryPartner.routes.ts:26`.
- ✅ FIXED — Signup PATCH vs backend PUT mismatch. `app/signup.tsx:58` now uses `PUT`, matching `delivery.routes.ts:11`.
- ❌ STILL BROKEN — No payout/earnings system. `app/(tabs)/earnings.tsx:91,94,97,216`, `profile.tsx:147` — flat `* 0.15` client-side estimate, no backend behind it.
- ❌ STILL BROKEN — Session tokens with no expiry. Confirmed on **both** ends: client `lib/session.ts` stores the token forever in plain AsyncStorage; server `deliveryPartner.controller.ts:requireRider` (24-43) accepts any matching `session_token` row indefinitely, no TTL check.

**New findings**
- **[Delivery Partner App][Code Quality] `lib/authService.ts` is fully dead code containing the original role-omission bug** — zero importers; recommend deleting rather than leaving it as a regression risk.
- **[Delivery Partner App][Bug] Orders screen status badges reference a status value the backend never produces** — `app/(tabs)/orders.tsx:30-34` defines a badge for `en_route_delivery`, which `deliveryPartner.controller.ts:55-65` never emits; live `picking_up`/`picked_up` orders fall through to an unstyled generic badge instead.
- **[Delivery Partner App][Security] Service-role key is still plumbed into the client bundle via `app.config.js`/`constants/config.ts`**, even though no live code path reads it today — a latent risk if the env var is ever set in a real build pipeline (it's even pre-filled as a template in `.env.example:17`).
- **[Delivery Partner App][Code Quality] `components/MapViewWrapper.tsx` is unused dead code** — navigation uses `Linking.openURL` to an external maps app instead.

**API call vs backend route mismatches:** **none found in any live call site** — every previously-documented mismatch for this app (pickup-code param, signup method) is genuinely fixed. This is the cleanest of the three mobile apps against the backend contract.

**Top priorities:** (1) no payout system; (2) session tokens never expire on either end; (3) hardcoded rating + missing vehicle/document upload (KYC gap); (4) unconditional 6s active-order poll while offline; (5) no admin-approval workflow on profile edits.

### 5.3 Shopkeeper / Store Owner App (`near-now-store_owner/`)

**Status of original findings**
- ❌ STILL BROKEN, and worse than originally scoped — `stores[0]` hardcoded for multi-store owners. Now spans **6 files** (`home.tsx`, `payments.tsx`, `previous-orders.tsx`, `stock.tsx`, `inventory.tsx`, `profile.tsx`); a correct `hooks/useStore.ts` (with `selectStore` + persistence) exists but has zero importers.
- ✅ FIXED — 30s stale order cache with no realtime invalidation. `hooks/useOrders.ts` no longer caches at all; `lib/useSmartPoll.ts` is now AppState-aware (pauses in background, refreshes on foreground).
- 🟡 PARTIALLY FIXED — Two unreconciled order-fetching paths. The broken path (`services/orderService.ts`) still targets non-existent endpoints but now has zero importers — dead code, not a live inconsistency.
- ❌ STILL BROKEN (as dead code) — `OrderService` class still references 4 non-existent endpoints, just unreachable now.
- 🟡 PARTIALLY FIXED — `fetchOrderDetails`/`setSelectedOrder`/`verifyQR` stubs. All three confirmed to have zero call sites — `verifyQR` specifically was superseded by a working `pickup_code` text-display flow; the stubs are vestigial, not blocking.
- ❌ STILL BROKEN — Home screen `activeOrderCount` hardcoded to 0. `app/(tabs)/home.tsx:104`.
- ✅ FIXED — Payments screen was a static placeholder. `app/(tabs)/payments.tsx` now computes real Today/Week/All-Time payout totals from delivered orders.
- ❌ STILL BROKEN — Document Number field always editable. `app/profile.tsx:403` passes literal `true` instead of the `editing` state.
- ❌ STILL BROKEN — Document image upload/type picker not edit-gated. `app/profile.tsx:394,415`.
- ❌ STILL BROKEN — No admin-approval gate on the online toggle, and no approval-status polling. Zero matches anywhere in the repo for `approval_status`/`is_approved` — contrast the rider app's correct implementation (5.2 above).
- ❌ STILL BROKEN — Store images support only one image. `app/profile.tsx:53`, `lib/storage.ts:75-78` (fixed single path, no array/carousel).
- ❌ STILL BROKEN — No admin notification on profile-edit click (24h approval workflow). No `profile_change_request` concept anywhere in the repo.
- 🟡 PARTIALLY FIXED — Inventory screen calling a non-existent route. The dead `services/storeService.ts` call still exists but the *live* inventory path (`lib/storeProducts.ts`) bypasses the backend API entirely via direct Supabase queries — different mechanism, same underlying route gap.
- ✅ FIXED — Invoice screen calling a non-existent route. `app/invoice/[orderId].tsx:135` now calls the real `GET /api/orders/:id`.
- ✅ FIXED — `/api/store-owner/*` vs `/store-owner/*` prefix mismatch. Repo-wide, zero remaining `/api/store-owner` or `/api/shopkeeper` references.
- ✅ FIXED — `useOrders.ts` wrong `/api/shopkeeper/*` prefix. All call sites (hook + `previous-orders.tsx`) now use the correct bare `/shopkeeper` prefix.
- ❌ STILL BROKEN — Push token registration hits non-existent endpoints. `lib/notifications.ts:160-168,283-287` — `/store-owner/notifications/register` and `/preferences` were never registered; 404s silently swallowed.

**New findings**
- **[Shopkeeper App][Bug] Multi-store hardcoding spread from 1 file to 6** while the correct fix (`hooks/useStore.ts`) sits completely unused.
- **[Shopkeeper App][Code Quality] Two complete dead duplicate service classes** (`services/orderService.ts`, `services/storeService.ts`) target non-existent endpoints and share near-identical names with the actually-used `lib/order-service.ts`/`lib/store-service.ts` — a real risk of auditing/editing the wrong file (already happened: the "Refactor StoreService" commit correctly targeted `lib/store-service.ts`, not the dead duplicate).
- **[Shopkeeper App][Bug] `toggleStoreStatus` is implemented three separate times** (`lib/store-service.ts`, `hooks/useStore.ts`, and an inline copy in `app/(tabs)/home.tsx`) — only the inline copy in `home.tsx` is actually wired to the UI; a fix applied to either of the other two would silently never take effect.
- **[Shopkeeper App][Bug] `setAllProductsOffline`/`restoreActiveProductsOnline` are silent no-ops** (`lib/storeProducts.ts:436-446`, explicit comment "no-op now") called unconditionally from the online-toggle critical path — toggling offline gives the false impression that product visibility changes when nothing happens.
- **[Shopkeeper App][Data] `lib/orders-db.ts` has a silent 4-strategy fallback chain with no error surfaced to the UI** — RPC → direct table → join fallback → 90-day full-scan fallback, all swallowing failures into an indistinguishable "no orders" empty state; masks potential RLS misconfiguration as normal emptiness.
- **[Shopkeeper App][Database] App's own `supabase/` folder is untracked, manually-run ad-hoc SQL** (`custom-master-products-rls.sql`, `orders-rpc-and-rls.sql`, etc.) — not migrations, no way to verify from static analysis whether they were ever applied to the live DB; several live code paths depend on them having been run.
- **[Shopkeeper App][Bug] `lib/storeProducts.ts:414` fallback path omits `/quantity` from the route** — calls `PATCH /store-owner/products/:id` instead of the registered `PATCH /store-owner/products/:id/quantity`; would 404 if ever reached (low-impact — Supabase succeeds first in the common case).

**API call vs backend route mismatches:** all *live* call sites now match real routes correctly (the prefix-mismatch class of bug from the original audit is genuinely fixed). The only remaining mismatches are in dead code (`services/orderService.ts`, `services/storeService.ts`) or the one fallback path noted above.

**Top priorities:** (1) wire in the existing `hooks/useStore.ts` instead of the 6-file `stores[0]` hardcode; (2) add the missing admin-approval gate (copy the rider app's pattern); (3) fix the structurally-impossible push notification routes; (4) close the document edit-mode gate gap; (5) delete the two dead service classes and the redundant `toggleStoreStatus` implementations before they cause a future regression.

---

## Re-audit changelog vs the 2026-05-26 audit
- Commit `a174547` ("fix: address critical authentication and payment issues") claimed 5 fixes. Verified: **1 fully fixed** (OTP/verify-OTP rate limiting), **1 partially fixed** (webhook HMAC — diagnostics/plumbing changed but the core byte-mismatch bug remains), **3 still fully broken** in the web/backend at the time (customer OTP persistence, `updateOrderStatus` 501) — fixed in-session, see below. The rider-app half of the role-field claim is confirmed genuinely fixed (Part 5.2): the bug is now isolated to a dead, unimported file.
- Commit `45db3e4` (vite proxy + standalone Driver/Shopkeeper test pages) genuinely fixed the `/api/auth/otp` 404 in `DriverApp.tsx`/`ShopkeeperApp.tsx`, and fixed the bare-prefix routing for the `frontend` Vercel deployment — but left `admin/vercel.json` without an equivalent backend rewrite.
- **Round 2 (mobile apps, once pulled locally):** the shopkeeper app had the most genuine fixes of any single area — order-cache staleness, payments-screen placeholder, and all previously-documented route-prefix mismatches (`/api/store-owner`, `/api/shopkeeper`) are fixed. The rider app is the cleanest against the backend contract — zero remaining route mismatches, both previously-documented param/method bugs fixed. The customer app had the fewest fixes and the most severe remaining issue: its purchase/account flows are *architecturally dependent* on the service-role key it isn't supposed to ship.
- Net new issues found across both rounds: **~35** (7 backend, 6 frontend, 8 admin, 3 database/cross-cutting, 5 customer app, 4 rider app, 7 shopkeeper app) — web-side mostly missing-authentication findings on routers the original audit hadn't inspected; mobile-side mostly dead-code landmines (unused-but-buggy duplicate service classes/hooks) and structural dependencies on privileged credentials.
- **In-session fix #1, completed (2026-06-16) — "Track A: finish the auth chain":**
  1. `backend/src/controllers/auth.controller.ts` — customer OTP flow persists `session_token` to `app_users` on both login and signup.
  2. New `backend/src/middleware/customerAuth.middleware.ts` — real `requireCustomer` validating that token.
  3. Wired into `customers.routes.ts` (all 5 address routes) and the 3 customer-scoped `orders.routes.ts` routes, each with an explicit ownership check in the controller.
  4. `invoice.controller.ts`'s broken local `requireCustomer` (UUID-as-token) and `requireShopkeeper` (looked up by `id` not `session_token`) were deleted; `invoice.routes.ts` now imports the correct shared implementations — this closes SECURITY-008 and SECURITY-009 as a side effect.
  5. **Found and fixed in the same pass (not in the original audit):** `customers.controller.ts:getResolvedAddresses` accepted client-supplied `phone`/`customerPhone` query params and merged in *any* account's addresses matching those phones — a cross-account address-disclosure oracle, independent of the missing-auth bug. Now derives everything from the authenticated token only.
  6. Frontend updated to send the bearer token on the now-protected calls (`orderService.ts`, `supabase.ts`, `OrderTrackingPage.tsx`, `ThankYouPage.tsx`, via new `utils/authHeader.ts`). Customer mobile app needed no change — it already sent the real token.
  7. Both `backend`/`frontend` type-checks pass. Backend's existing `vitest` suite: 13/17 pass; the 4 failures are in `payment.service.test.ts` and are pre-existing (unrelated to this change, not touched this session) — they directly evidence the still-open PAY-001 webhook HMAC bug, confirming Tier 1 #3 is real and test-detectable.
  - **Still open from the original Tier 1 #2:** `tracking.routes.ts`, `notifications.routes.ts`, `coupons.routes.ts`, `delivery.routes.ts`, and the checkout endpoints (`/place`, `/create`) remain unauthenticated.
