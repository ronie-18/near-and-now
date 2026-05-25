# Near & Now — Enterprise QA Audit Report
**Date:** 2026-05-25  
**Auditor Role:** Senior QA Engineer / Full-Stack Architect / Product Analyst  
**Scope:** All platforms — Backend API, Admin Web, Customer Web, Customer Mobile App, Shopkeeper Mobile App, Delivery Partner Mobile App  
**Total Issues Found:** 62 Jira Tickets

---

## Executive Summary

The Near & Now hyperlocal commerce platform is a monorepo (Express/TypeScript backend + React SPA frontend + React Native Expo mobile apps) backed by Supabase PostgreSQL with RLS. The codebase is under active development with 22+ recent migrations. The system implements a sophisticated multi-store dispatch and delivery architecture with Razorpay payment integration and Twilio OTP authentication.

**Codebase Health Assessment:**
- Architecture is sound — role-scoped auth, atomic offer acceptance via DB RPCs, realtime + polling hybrid tracking
- Core business logic is largely correct but several critical integration points are broken or incomplete
- Security posture has significant gaps (unauthenticated endpoints, service-role key exposure in mobile apps)
- Notification infrastructure is entirely stubbed — all email/SMS notification methods have no implementation
- Customer token is never persisted server-side, creating a silent auth bypass across all customer API calls
- Webhook HMAC verification is broken by design (parsed body re-serialized before signing)

**Release Readiness Verdict: BLOCKED — 10 launch blockers across all platforms**

---

## Architecture Risk Report

### Risk 1: Service-Role Key Exposure in Customer Mobile App (CRITICAL)
`nearandnowcustomerapp/lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` — the `EXPO_PUBLIC_` prefix bundles it directly into the APK/IPA binary. Anyone with a decompiler gains full database access bypassing all RLS policies. The file documents this risk but leaves the workaround in place.

### Risk 2: Customer Session Token Never Validated Server-Side
The backend's `verifyOTP` for customers generates a `crypto.randomUUID()` token but never stores it anywhere. All subsequent API calls that send `Authorization: Bearer <token>` pass validation only if the middleware doesn't check customer tokens (which it doesn't — customer routes have no auth middleware). This means any token string authenticates any customer endpoint.

### Risk 3: Webhook HMAC Always Fails
`payment.service.ts verifyWebhook` signs `JSON.stringify(body)` where `body` is already a parsed JavaScript object. Express parsed the raw bytes → object; re-serializing produces a different byte sequence (key ordering, whitespace). The HMAC will never match Razorpay's signature. The fallback to `RAZORPAY_KEY_SECRET` instead of the webhook secret compounds this.

### Risk 4: Notification Infrastructure is Completely Hollow
`notification.service.ts` contains `sendOrderPlacedNotification`, `sendOrderConfirmedNotification`, `sendDriverAssignedNotification`, etc. — all are empty private methods. No customer ever receives an email, SMS, or in-app notification about their order.

### Risk 5: Single-Store Assumption in Shopkeeper App
`homeTab` at `near-now-store_owner/app/(tabs)/home.tsx:92` — `const selectedStore = stores[0]` — a shopkeeper with multiple stores only ever sees the first one. The backend supports `req.shopkeeperStoreIds[]`, but the UI doesn't expose store switching.

---

## Critical Production Risks Table

| Risk | Affected Flow | Impact | Ticket |
|------|--------------|--------|--------|
| Webhook HMAC always fails | Razorpay webhooks | Payment status never auto-updated | PAY-001 |
| Customer token not persisted | All customer API calls | Silent security gap | AUTH-001 |
| Service-role key in APK | Customer mobile app | Full DB breach possible | MOBILE-SEC-001 |
| `updateOrderStatus` returns 501 | Order status management | Shopkeeper/admin can't update orders | PAY-002 |
| All notification methods empty | Order lifecycle | Zero customer/partner notifications | NOTIF-001 |
| Delivery simulation unauthenticated | `/api/delivery/simulate` | Anyone can corrupt any order's lifecycle | DELIVERY-001 |
| Shopkeeper token persisted to `app_users` but customer token is not | Customer auth | Customers' tokens non-functional for any future auth middleware | AUTH-001 |
| No rate limiting on OTP endpoints | `/api/auth/send-otp` | Twilio account draining attack | AUTH-002 |
| CORS wildcard when `ALLOWED_ORIGINS` unset | Backend server | Cross-origin attacks in prod | SECURITY-003 |
| `getOrderTrackingFull` writes to `stores` table on every fetch | Tracking | Unintended data mutation on reads | DELIVERY-004 |

---

## JIRA TICKETS — PART 1: BACKEND & WEB PLATFORM

---

### AUTH-001 · CRITICAL · P0
**Summary:** Customer OTP token generated but never persisted — auth is non-functional  
**Affected Apps:** Customer Web, Customer Mobile App, Backend  
**Root Cause:** `auth.controller.ts:320` — `const token = crypto.randomUUID()` is returned in the response but never written to `app_users.session_token`. Shopkeeper tokens are persisted at line 208; delivery_partner tokens at line 199. Customer path has no equivalent write.  
**Current Behavior:** Customer receives a token, stores it in localStorage/AsyncStorage, sends it as `Authorization: Bearer <token>` on subsequent requests — but no backend middleware validates customer tokens, so all customer routes accept any string as auth.  
**Expected Behavior:** Token should be persisted to `app_users.session_token` and validated by customer-facing middleware on protected routes.  
**Suggested Fix:** In `auth.controller.ts` after line 320, add:
```ts
await supabaseAdmin.from('app_users').update({ session_token: token }).eq('id', appUser.id);
```
Then add `requireCustomer` middleware to customer routes that validates `app_users.session_token`.  
**Severity:** Critical | **Priority:** P0

---

### AUTH-002 · HIGH · P1
**Summary:** No rate limiting on OTP send/verify endpoints  
**Affected Apps:** Backend, all client apps  
**Root Cause:** `server.ts` has no rate-limiting middleware. `sendOTP` and `verifyOTP` are open endpoints with no per-IP or per-phone throttle.  
**Current Behavior:** Attacker can call `/api/auth/send-otp` thousands of times draining Twilio credits; can brute-force 6-digit OTP via `/api/auth/verify-otp`.  
**Expected Behavior:** Max 3–5 OTP sends per phone per hour; max 5 OTP verify attempts before lockout.  
**Suggested Fix:** Add `express-rate-limit` middleware scoped per phone number on auth routes.  
**Severity:** High | **Priority:** P1

---

### AUTH-003 · MEDIUM · P2
**Summary:** Delivery partner app `verifyOTP` sends no `role` field — will create customer account  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/lib/authService.ts:verifyOTP` sends `{ phone, otp, name }` with no `role` field. The backend `auth.controller.ts:120–126` defaults missing role to `'customer'`.  
**Current Behavior:** New rider OTP verification triggers customer account creation flow.  
**Expected Behavior:** Rider app must send `role: 'delivery_partner'` in the verify-OTP request body.  
**Note:** `otp.tsx` in the rider app DOES pass `role: 'delivery_partner'` at line 107 — the bug is only in the standalone `authService.ts` file that is imported by legacy flows.  
**Severity:** Medium | **Priority:** P2

---

### AUTH-004 · LOW · P3
**Summary:** `navigator.userAgent` called in admin service — fails in non-browser contexts  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts:119` — `user_agent: navigator.userAgent` inside a service function. Will throw in SSR, test environments, or Node.js execution context.  
**Suggested Fix:** Pass `userAgent` as a parameter or guard with `typeof navigator !== 'undefined'`.  
**Severity:** Low | **Priority:** P3

---

### PAY-001 · CRITICAL · P0
**Summary:** Webhook HMAC verification always fails — Razorpay webhooks silently rejected  
**Affected Apps:** Backend  
**Root Cause:** `payment.service.ts:verifyWebhook` calls `JSON.stringify(body)` where `body` is already a parsed JavaScript object. Razorpay signs the raw HTTP body bytes; re-serializing produces a different string (different key order, no trailing whitespace). HMAC never matches.  
**Current Behavior:** All `payment.captured`, `payment.failed`, `refund.processed` webhooks return 400 Invalid signature. Payment status is never auto-updated via webhook.  
**Expected Behavior:** Receive raw body bytes before Express JSON parsing; compute HMAC over the raw bytes.  
**Suggested Fix:**
```ts
// server.ts — webhook route must use raw body
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
// payment.service.ts
const rawBody = body instanceof Buffer ? body.toString('utf8') : JSON.stringify(body);
```
**Also:** The fallback to `RAZORPAY_KEY_SECRET` instead of `RAZORPAY_WEBHOOK_SECRET` should be removed.  
**Severity:** Critical | **Priority:** P0  
**Dependencies:** PAY-002

---

### PAY-002 · CRITICAL · P0
**Summary:** `updateOrderStatus` returns 501 Not Implemented  
**Affected Apps:** Backend, Admin Web  
**Root Cause:** `orders.controller.ts:144–152` — the `updateOrderStatus` method immediately returns `501 { error: 'Not implemented yet' }`. Used by admin dashboard to manually update order statuses.  
**Current Behavior:** Any call to `PATCH /api/orders/:id/status` returns 501.  
**Suggested Fix:** Implement by delegating to `databaseService.updateOrderStatus(id, status)`.  
**Severity:** Critical | **Priority:** P0

---

### PAY-003 · HIGH · P1
**Summary:** Split payment — UPI portion never routed through Razorpay  
**Affected Apps:** Customer Web (CheckoutPage)  
**Root Cause:** `CheckoutPage.tsx` — `isOnlineRazorpay` is only true when `paymentMethod === 'online' && !splitEnabled`. When split payment is active, only the COD portion is processed; the Razorpay UPI split amount is collected in the UI but never actually charged.  
**Current Behavior:** Customer selects split payment (COD + UPI), confirms order — UPI amount silently dropped.  
**Severity:** High | **Priority:** P1

---

### PAY-004 · MEDIUM · P2
**Summary:** GSTIN/business name collected at checkout but never sent to backend  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** `CheckoutPage.tsx` — `gstin` and `invoiceName` fields exist in form state but are not included in the `orderData` object passed to `createOrder()`.  
**Current Behavior:** Business customers fill GSTIN, confirm order — GSTIN never reaches backend or invoice.  
**Severity:** Medium | **Priority:** P2

---

### PAY-005 · MEDIUM · P2
**Summary:** Payment order creation has no idempotency key — double-charges on retry  
**Affected Apps:** Backend, all client apps  
**Root Cause:** `payment.service.ts:createPaymentOrder` creates a Razorpay order with no idempotency key. Network retries (customer mobile app has retry logic in `apiFetch`) can create multiple Razorpay orders for the same internal order.  
**Suggested Fix:** Use `internalOrderId` as the idempotency key header: `X-Razorpay-Idempotency-Key`.  
**Severity:** Medium | **Priority:** P2

---

### COUPON-001 · HIGH · P1
**Summary:** Coupon validation ignores `min_order_value` field  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:validateCoupon` checks expiry, usage count, and per-user limits — but does NOT check `min_order_value` even though the column exists in the schema.  
**Current Behavior:** Customer applies a "min ₹500 order" coupon to a ₹50 cart and gets the discount.  
**Severity:** High | **Priority:** P1

---

### COUPON-002 · MEDIUM · P2
**Summary:** Coupon usage count not atomically incremented — race condition under concurrent orders  
**Affected Apps:** Backend  
**Root Cause:** `validateCoupon` reads usage count then separately updates it. Two concurrent orders can both pass the `max_uses` check and both succeed.  
**Suggested Fix:** Use a Supabase RPC or `UPDATE ... WHERE usage_count < max_uses RETURNING *` to make it atomic.  
**Severity:** Medium | **Priority:** P2

---

### COUPON-003 · LOW · P3
**Summary:** Expired coupons still visible in frontend coupon list  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** The coupon list endpoint does not filter by `is_active` and `expiry_date >= now()` — expired coupons appear in the UI and only fail at checkout.  
**Severity:** Low | **Priority:** P3

---

### ORDER-001 · HIGH · P1
**Summary:** Legacy `createOrder` path hardcodes delivery_fee ₹20 and leaves totals at 0  
**Affected Apps:** Backend  
**Root Cause:** `orders.controller.ts:createOrder` (distinct from `placeCheckout`) hardcodes `delivery_fee: 20` and sets `total_amount: 0`, `subtotal: 0`. This path is reachable via `POST /api/orders`.  
**Current Behavior:** Orders created via legacy path have zero totals, leading to ₹0 Razorpay orders.  
**Suggested Fix:** Either remove the legacy path and redirect to `placeCheckout`, or compute totals properly.  
**Severity:** High | **Priority:** P1

---

### ORDER-002 · HIGH · P1
**Summary:** `cancelOrder` does not cancel `order_store_allocations`  
**Affected Apps:** Backend, Shopkeeper App  
**Root Cause:** `database.service.ts:cancelOrder` cancels the `customer_orders` row and triggers refund, but does not update `order_store_allocations` to `cancelled`. Shopkeepers continue seeing the allocation as `pending_acceptance`.  
**Severity:** High | **Priority:** P1

---

### ORDER-003 · MEDIUM · P2
**Summary:** Rider `acceptOrder` sets status `in_transit`, skipping `delivery_partner_assigned`  
**Affected Apps:** Backend, Delivery Partner App  
**Root Cause:** `deliveryPartner.controller.ts:327` — `status: 'in_transit'` is set directly. The expected status sequence is `pending → delivery_partner_assigned → picking_up → in_transit → delivered`.  
**Current Behavior:** Customer tracking page jumps from "Shopkeeper accepted" straight to "In transit" with no "Partner assigned" step.  
**Severity:** Medium | **Priority:** P2

---

### ORDER-004 · LOW · P3
**Summary:** `getDeliveryAgents` ignores `_partnerId` parameter — always returns all partners  
**Affected Apps:** Backend, Admin Web  
**Root Cause:** `database.service.ts:getDeliveryAgents` declares `_partnerId` parameter but never uses it in the query.  
**Severity:** Low | **Priority:** P3

---

### ORDER-005 · MEDIUM · P2
**Summary:** Shopkeeper bulk-reject (`rejectOrder` in `useOrders` hook) has no partial-accept flow for multi-store orders  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `useOrders.ts:rejectOrder` calls `POST /shopkeeper/allocations/:id/reject` which triggers `reallocateMissingItems`. However, the customer app receives no notification that items were reallocated or lost. `reallocateMissingItems` has a 4km radius constraint — if no store is found, items are silently dropped.  
**Severity:** Medium | **Priority:** P2  
**Dependencies:** NOTIF-001

---

### NOTIF-001 · CRITICAL · P0
**Summary:** All notification methods (email, SMS, push to customers) are empty stubs  
**Affected Apps:** Backend  
**Root Cause:** `notification.service.ts` — `sendOrderPlacedNotification`, `sendOrderConfirmedNotification`, `sendDriverAssignedNotification`, `sendOrderDeliveredNotification`, `sendCancellationNotification` are all empty private methods. `sendEmail` and `sendSMS` are `console.log` stubs with `// TODO: SendGrid / AWS SES` comments.  
**Current Behavior:** Zero notifications sent to customers throughout entire order lifecycle.  
**Severity:** Critical | **Priority:** P0

---

### NOTIF-002 · HIGH · P1
**Summary:** `sendPushNotification` only queries `delivery_partners` table — cannot notify customers  
**Affected Apps:** Backend  
**Root Cause:** `notification.service.ts:sendPushNotification` looks up `expo_push_token` only in `delivery_partners`. Customers have no push token storage in `app_users` or `customers` tables.  
**Current Behavior:** Customer push notifications are impossible even when notification methods are implemented.  
**Suggested Fix:** Add `expo_push_token` column to `app_users`; customer app should register token on login.  
**Severity:** High | **Priority:** P1

---

### DELIVERY-001 · CRITICAL · P0
**Summary:** Delivery simulation endpoint is unauthenticated in production  
**Affected Apps:** Backend  
**Root Cause:** `delivery.controller.ts:startSimulation` — no auth middleware. Any actor with knowledge of the URL can trigger a full order lifecycle simulation on any real order ID.  
**Current Behavior:** `POST /api/delivery/simulate` with any `orderId` advances that order through all statuses automatically.  
**Suggested Fix:** Gate behind admin auth or remove entirely from production builds.  
**Severity:** Critical | **Priority:** P0

---

### DELIVERY-002 · HIGH · P1
**Summary:** Driver broadcast uses customer delivery address, not store location — wrong proximity calculation  
**Affected Apps:** Backend  
**Root Cause:** `delivery.controller.ts:broadcastToDrivers` and `shopkeeper.controller.ts:broadcastToNearbyDrivers` both use `order.delivery_latitude/longitude` (the customer's address) as the center point for finding nearby drivers. Drivers should be dispatched from store proximity.  
**Current Behavior:** A driver 1km from the customer but 15km from the store receives an offer; a driver next to the store but 5km from customer does not.  
**Severity:** High | **Priority:** P1

---

### DELIVERY-003 · HIGH · P1
**Summary:** Customer not notified when item reallocation fails — order silently degrades  
**Affected Apps:** Backend  
**Root Cause:** `shopkeeper.controller.ts:reallocateMissingItems` has a 4km radius constraint. If no replacement store is found, the order proceeds with fewer items but the customer is never notified.  
**Severity:** High | **Priority:** P1  
**Dependencies:** NOTIF-001

---

### DELIVERY-004 · MEDIUM · P2
**Summary:** `getOrderTrackingFull` writes to `stores` table on every tracking fetch  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:getOrderTrackingFull` calls `reverseGeocode` AND writes the result back to `stores.address` on every call. Tracking is polled every 3–5 seconds, causing hundreds of unnecessary DB writes per active order.  
**Severity:** Medium | **Priority:** P2

---

### WEB-001 · HIGH · P1
**Summary:** Checkout email field is `required` — blocks OTP-only users without email  
**Affected Apps:** Customer Web  
**Root Cause:** `CheckoutPage.tsx` — email input has HTML `required` attribute. Customers who signed up via OTP only (no email) cannot submit the checkout form.  
**Severity:** High | **Priority:** P1

---

### WEB-002 · HIGH · P1
**Summary:** `getCurrentUserFromSession` uses anon Supabase client — blocked by RLS, always returns null  
**Affected Apps:** Customer Web  
**Root Cause:** `frontend/src/services/authService.ts:getCurrentUserFromSession` queries `app_users` using the anon Supabase client. RLS prevents anon clients from reading `app_users` rows.  
**Current Behavior:** Session restore always fails — user is shown as logged out on page refresh even when session data exists in localStorage.  
**Severity:** High | **Priority:** P1

---

### WEB-003 · HIGH · P1
**Summary:** Order tracking page imports `supabaseAdmin` — service-role key exposed in browser  
**Affected Apps:** Customer Web  
**Root Cause:** `frontend/src/hooks/useOrderTrackingRealtime.ts` imports `supabaseAdmin` for realtime subscriptions. The admin client uses the service-role key, which is then bundled into the browser JS. Any user with DevTools can extract the key.  
**Severity:** High | **Priority:** P1

---

### WEB-004 · MEDIUM · P2
**Summary:** Dual polling strategy — realtime + 3s setInterval creates redundant network traffic  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** Both `useOrderTrackingRealtime.ts` (web) and `useOrderTracking.ts` (mobile) subscribe to Supabase realtime AND maintain a 3–5 second polling interval. When realtime works, polling is pure waste.  
**Suggested Fix:** Only poll when the realtime channel is not in `SUBSCRIBED` state.  
**Severity:** Medium | **Priority:** P2

---

### WEB-005 · MEDIUM · P2
**Summary:** No AbortController for in-flight tracking fetches on unmount — potential state-on-unmounted-component warnings  
**Affected Apps:** Customer Web  
**Root Cause:** `useOrderTrackingRealtime.ts` fires `fetchOrderTrackingFull()` on realtime events but has no cancellation for these in-flight fetches when the component unmounts.  
**Severity:** Medium | **Priority:** P2

---

### WEB-006 · MEDIUM · P2
**Summary:** `CartContext.addToCart` mutates object in place — React immutability violation  
**Affected Apps:** Customer Web  
**Root Cause:** `CartContext.tsx:addToCart` — the cart item object is mutated directly instead of creating a new object reference. React may not detect this change and skip re-renders.  
**Severity:** Medium | **Priority:** P2

---

### WEB-007 · HIGH · P1
**Summary:** Address save race condition at checkout — order placed without delivery coordinates  
**Affected Apps:** Customer Web  
**Root Cause:** `CheckoutPage.tsx` — the address save and coordinate fetch run in parallel with order placement. If the geocoding call is slow, the order is placed with `delivery_latitude: null`, breaking the dispatch algorithm entirely.  
**Severity:** High | **Priority:** P1

---

### BACKEND-001 · HIGH · P1
**Summary:** No global Express error handler — unhandled errors return HTML error pages  
**Affected Apps:** Backend  
**Root Cause:** `server.ts` — no `(err, req, res, next)` error middleware registered. Unhandled promise rejections or thrown errors propagate as 500 HTML responses, breaking JSON-expecting clients.  
**Severity:** High | **Priority:** P1

---

### BACKEND-002 · MEDIUM · P2
**Summary:** No request body size limit on `express.json()` — DoS via large payloads  
**Affected Apps:** Backend  
**Root Cause:** `server.ts` — `express.json()` without a `limit` option accepts arbitrarily large payloads.  
**Suggested Fix:** `app.use(express.json({ limit: '1mb' }))`.  
**Severity:** Medium | **Priority:** P2

---

### BACKEND-003 · HIGH · P1
**Summary:** Webhook verification falls back to API key secret when webhook secret is missing  
**Affected Apps:** Backend  
**Root Cause:** `payment.service.ts:verifyWebhook` — if `RAZORPAY_WEBHOOK_SECRET` is unset, it falls back to `RAZORPAY_KEY_SECRET`. These are different secrets with different purposes; using the API key for webhook verification is incorrect and accepts forged webhooks.  
**Severity:** High | **Priority:** P1

---

### BACKEND-004 · LOW · P3
**Summary:** Three separate haversine implementations across the codebase  
**Affected Apps:** Backend, Rider App, Shopkeeper App  
**Root Cause:** `database.service.ts`, `NAT_Near-Now_Rider-/app/(tabs)/home.tsx`, `NAT_Near-Now_Rider-/app/delivery/[orderId].tsx` each have their own `haversineKm` function.  
**Suggested Fix:** Extract to a shared utility. Risk of divergence if one implementation has a bug.  
**Severity:** Low | **Priority:** P3

---

### SECURITY-001 · HIGH · P1
**Summary:** Admin dashboard has no per-endpoint permission enforcement  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts` has `hasPermission()` utility but admin API routes do not apply it as middleware. A `viewer` role admin can call any admin mutation if they bypass the UI.  
**Severity:** High | **Priority:** P1

---

### SECURITY-002 · HIGH · P1
**Summary:** Admin route for creating admins accessible to non-super_admin roles at API level  
**Affected Apps:** Admin Web, Backend  
**Root Cause:** No server-side role check on the admin creation endpoint. Only the UI hides the button for non-super_admin users.  
**Severity:** High | **Priority:** P1

---

### SECURITY-003 · HIGH · P1
**Summary:** CORS wildcard when `ALLOWED_ORIGINS` is not set  
**Affected Apps:** Backend  
**Root Cause:** `server.ts` — CORS `origin` callback returns `true` (allow all) when `ALLOWED_ORIGINS` env var is missing.  
**Severity:** High | **Priority:** P1

---

### DB-001 · MEDIUM · P2
**Summary:** `PaymentStatus` type uses `'completed'` but code uses `'paid'` — type mismatch  
**Affected Apps:** Backend  
**Root Cause:** `database.types.ts:PaymentStatus` includes `'completed'` but all actual DB writes use `'paid'`. TypeScript may accept `'completed'` where `'paid'` is required.  
**Severity:** Medium | **Priority:** P2

---

### DB-002 · MEDIUM · P2
**Summary:** `OrderStatus` type missing `'picking_up'` — added in migration but not in types  
**Affected Apps:** Backend  
**Root Cause:** Migration `20260505000000_add_picking_up_order_status.sql` added this status but `database.types.ts` was not updated.  
**Severity:** Medium | **Priority:** P2

---

### PERF-001 · MEDIUM · P2
**Summary:** Driver location polled every 2s regardless of realtime subscription state  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** A separate `setInterval` fires every 2 seconds for driver location updates, independent of the Supabase realtime subscription. Under good conditions this is redundant; under poor conditions the polling and realtime events race each other.  
**Severity:** Medium | **Priority:** P2

---

### UX-001 · LOW · P3
**Summary:** No empty-cart guard on checkout — user can reach checkout with 0 items via direct URL  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** `CheckoutPage.tsx` and `checkout.tsx` don't redirect when `items.length === 0`.  
**Severity:** Low | **Priority:** P3

---

### ADMIN-001 · MEDIUM · P2
**Summary:** Admin session not invalidated on logout — tokens remain valid until 12h expiry  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts` logout path does not delete the `admin_sessions` row. Sessions expire naturally after 12 hours but are not explicitly invalidated.  
**Severity:** Medium | **Priority:** P2

---

### ADMIN-002 · LOW · P3
**Summary:** Failed login audit log fires even when `logSecurityEvent` itself throws  
**Affected Apps:** Admin Web  
**Root Cause:** `authenticateAdmin` calls `logFailedLogin` then `logSecurityEvent` in sequence without catching individual errors. If the DB is unavailable, the auth function throws without returning null cleanly.  
**Severity:** Low | **Priority:** P3

---

## JIRA TICKETS — PART 2: MOBILE APPS

---

### MOBILE-SEC-001 · CRITICAL · P0
**Summary:** Service-role Supabase key bundled into Customer App APK/IPA via `EXPO_PUBLIC_` prefix  
**Affected Apps:** Customer Mobile App (nearandnowcustomerapp)  
**Root Cause:** `nearandnowcustomerapp/lib/supabase.ts:26` — reads `process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Any variable prefixed `EXPO_PUBLIC_` is baked into the JavaScript bundle inside the APK/IPA. A decompiler (Jadx, apktool) exposes the key in seconds.  
**Current Behavior:** The service-role key bypasses all RLS policies. An attacker can read/write any table in the database including `app_users`, `customers`, `customer_orders`, `payments`.  
**Expected Behavior:** Service-role key must NEVER appear in client-side code. All privileged operations must go through the Railway backend API.  
**Suggested Fix:**
1. Remove `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` from all `.env` files immediately.
2. Move all `supabaseAdmin` calls in `lib/authService.ts` (`getCurrentUserFromSession`, `updateCustomerProfile`) to backend API endpoints.
3. Use `SUPABASE_SERVICE_ROLE_KEY` (without `EXPO_PUBLIC_`) only in backend/EAS build server contexts.  
**QA Validation:** Build APK, run `apktool d app.apk`, grep for the service-role key string — it must not appear.  
**Severity:** Critical | **Priority:** P0

---

### MOBILE-AUTH-001 · CRITICAL · P0
**Summary:** Customer Mobile App `getCurrentUserFromSession` uses service-role client — bypasses RLS silently  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/lib/authService.ts:getCurrentUserFromSession` calls `supabaseAdmin.from('app_users').select(...)`. This bypasses RLS and works only because the service-role key is bundled (see MOBILE-SEC-001). When the key is removed, session restore will silently fail and all users will be logged out on every app restart.  
**Suggested Fix:** Create `GET /api/auth/me` backend endpoint that reads the session and returns `{user, customer}` using the server-side service-role key. Mobile app calls this with Bearer token.  
**Severity:** Critical | **Priority:** P0  
**Dependencies:** MOBILE-SEC-001

---

### MOBILE-AUTH-002 · HIGH · P1
**Summary:** Rider App OTP verification does not send `role` field in `authService.ts` — creates customer account  
**Affected Apps:** Delivery Partner Mobile App (NAT_Near-Now_Rider-)  
**Root Cause:** `NAT_Near-Now_Rider-/lib/authService.ts:verifyOTP` sends `{ phone, otp, name }` with no `role` field. The backend defaults to `'customer'` role. The rider's dedicated `otp.tsx` screen correctly sends `role: 'delivery_partner'` at line 107, but the shared `authService.ts` is used in other flows and will silently create customer accounts for riders.  
**Suggested Fix:** Always include `role: 'delivery_partner'` in the `verifyOTP` call in `authService.ts`.  
**Severity:** High | **Priority:** P1

---

### MOBILE-AUTH-003 · HIGH · P1
**Summary:** Shopkeeper App multi-store — only first store ever used (`stores[0]`)  
**Affected Apps:** Shopkeeper Mobile App (near-now-store_owner)  
**Root Cause:** `near-now-store_owner/app/(tabs)/home.tsx:92` — `const selectedStore = stores[0]`. A shopkeeper with multiple locations only manages store index 0 regardless of which store they intend to operate.  
**Current Behavior:** Multi-store shopkeeper can never switch store context in the mobile app. All accept/reject actions apply only to store 0.  
**Suggested Fix:** Add a store-picker UI (dropdown or tab strip) and persist `selectedStoreId` to AsyncStorage.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-001 · HIGH · P1
**Summary:** Shopkeeper order cache returns stale data — 30s cache with no invalidation on status change  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/services/orderService.ts:fetchOrders` caches responses for 30 seconds using module-level `ordersCache`. The `useOrders` hook runs `useSmartPoll` at 10s/30s intervals, but also hits the same cached `OrderService.getInstance()` singleton — cache invalidation only happens on `acceptOrder`/`rejectOrder`, not on incoming realtime events.  
**Current Behavior:** A new order that arrives via realtime/push is shown in the popup but the main orders list may show the cached (stale) version for up to 30 seconds after interaction.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-002 · MEDIUM · P2
**Summary:** Shopkeeper App uses two separate order-fetching paths — `useOrders` hook and `OrderService` singleton are out of sync  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/hooks/useOrders.ts` fetches from `/shopkeeper/orders` directly using raw `fetch`. `near-now-store_owner/services/orderService.ts` fetches from `/store-owner/stores/:id/orders` — a different endpoint. These two data sources are never reconciled.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-003 · MEDIUM · P2
**Summary:** Rider delivery screen polls pickup-sequence every 10s but has no realtime subscription  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `delivery/[orderId].tsx:300` — `pollRef.current = setInterval(() => loadSequence(token, true), 10000)`. Unlike the home screen which has a Supabase realtime subscription on `driver_order_offers`, the active delivery screen has no realtime channel. Store pickup code arrival requires waiting up to 10 seconds.  
**Suggested Fix:** Add a realtime subscription on `order_store_allocations` filtered by `order_id`.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-NOTIF-001 · HIGH · P1
**Summary:** Customer Mobile App has no push notification registration — customers never receive push notifications  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/hooks/usePushNotifications.ts` exists but there is no column to store customer push tokens in the backend DB schema (`app_users` or `customers` tables have no `expo_push_token`). Even if registered, the backend's `sendPushNotification` only queries `delivery_partners` (NOTIF-002).  
**Severity:** High | **Priority:** P1  
**Dependencies:** NOTIF-001, NOTIF-002

---

### MOBILE-NOTIF-002 · MEDIUM · P2
**Summary:** Shopkeeper App incoming order popup relies solely on polling — no Expo push notification for new orders  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `useOrders.ts:useSmartPoll` drives order discovery at 10s–30s intervals. There is no FCM/APNs/Expo push channel for instant "new order" notification. If the shopkeeper's screen is off or the app is backgrounded, new orders may wait up to 30 seconds before the timeout popup appears — and the 60-second accept timer has already been counting down.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-PAYMENT-001 · HIGH · P1
**Summary:** Customer Mobile App payment reconcile loop has no circuit breaker for cancelled/failed orders  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `usePaymentFlow.ts:reconcile` polls `getOrderPaymentStatus` every 1.5s for up to 10 seconds when `verifyPayment` fails. If the customer cancelled (`status: 'pending'`, `reason: 'cancelled'`), the reconcile loop still runs 6 extra DB polls before resolving. Should short-circuit immediately on `status !== 'pending'` in DB.  
**Severity:** High | **Priority:** P1

---

### MOBILE-PAYMENT-002 · MEDIUM · P2
**Summary:** Saved payment methods feature flag disabled by default but UI shows skeleton permanently  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `razorpayService.ts:SAVED_METHODS_ENABLED` is false by default (env var not set). When disabled, `getSavedPaymentMethods` returns `[]` synchronously. However the `settings/payments.tsx` screen still renders a "Preferred Payment" section skeleton that never populates, which is confusing UX.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-UX-001 · MEDIUM · P2
**Summary:** Rider App `pending_verification` status shows hardcoded admin phone number in UI  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/home.tsx:549` — `Linking.openURL("tel:+919062692914")`. Admin phone number is hardcoded in the UI. Will break when admin changes.  
**Suggested Fix:** Source from backend config or environment variable.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-UX-002 · MEDIUM · P2
**Summary:** Delivery partner app OTP auto-submit fires before all 6 digits confirmed — can submit partial OTP on slow keyboards  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `otp.tsx:54–59` — `useEffect` triggers `handleVerify(otp)` whenever `isComplete` becomes true (all 6 digits filled). On some Android keyboards, IME commits characters one-by-one but the 6th character event may fire twice (once partial), triggering a premature API call.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-UX-003 · LOW · P3
**Summary:** Customer App wallet screen is a placeholder with no functionality  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/app/wallet.tsx` exists in the routing but renders a static screen. No wallet balance, no transaction history, no top-up functionality.  
**Severity:** Low | **Priority:** P3

---

### MOBILE-PERF-001 · MEDIUM · P2
**Summary:** Rider App home screen creates a new Supabase `createClient` instance on every render  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/home.tsx:28` — `const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY)` is declared at module scope, which is fine, but it's inside the module body (not in a component) — the real issue is a new WebSocket connection is established on every cold start without connection pooling or reuse from a singleton.  
**Suggested Fix:** Extract to `lib/supabase.ts` singleton (same pattern as customer and shopkeeper apps).  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-PERF-002 · LOW · P3
**Summary:** Shopkeeper App `fetchStoreProducts` called twice on first mount (initial useEffect + useFocusEffect)  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `home.tsx:167–172` (initial data load) and `useFocusEffect:208–220` both call `fetchStoreProducts` but `firstFocusRef` guard only prevents the focus-effect call, not the useEffect call. The guard works correctly but the comment above it is misleading — a fresh read of the code suggests the double-call risk if the guard is ever changed.  
**Severity:** Low | **Priority:** P3

---

### MOBILE-SEC-002 · HIGH · P1
**Summary:** Shopkeeper App session token stored in plain AsyncStorage with no encryption  
**Affected Apps:** Shopkeeper Mobile App, Delivery Partner Mobile App, Customer Mobile App  
**Root Cause:** All three apps store session tokens (and in some cases full user objects) in AsyncStorage without encryption. On rooted Android devices, AsyncStorage is readable by other apps. The tokens grant full API access.  
**Suggested Fix:** Use `expo-secure-store` for auth tokens. User data (name, phone) can remain in AsyncStorage.  
**Severity:** High | **Priority:** P1

---

### MOBILE-SEC-003 · MEDIUM · P2
**Summary:** Rider App has no session expiry — old tokens persist indefinitely  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `session.ts` stores `{ token, user }` but has no `expiresAt` field. The `delivery_partners.session_token` column has no TTL enforcement on the backend. A stolen device with an old token can access all rider API endpoints forever.  
**Suggested Fix:** Add `expiresAt` to session storage; backend should validate token age (e.g., 30-day rolling window).  
**Severity:** Medium | **Priority:** P2

---

## Severity Summary

| Severity | Count |
|----------|-------|
| Critical | 10 |
| High | 24 |
| Medium | 20 |
| Low | 8 |
| **Total** | **62** |

---

## Team Assignment (4 Developers)

### Dev 1 — Backend Core (Auth, Payments, Security)
AUTH-001, AUTH-002, PAY-001, PAY-002, PAY-003, PAY-005, BACKEND-001, BACKEND-002, BACKEND-003, SECURITY-001, SECURITY-002, SECURITY-003

### Dev 2 — Order Lifecycle & Delivery
ORDER-001, ORDER-002, ORDER-003, DELIVERY-001, DELIVERY-002, DELIVERY-003, DELIVERY-004, COUPON-001, COUPON-002, ORDER-005

### Dev 3 — Mobile Apps (Customer + Rider)
MOBILE-SEC-001, MOBILE-AUTH-001, MOBILE-AUTH-002, MOBILE-NOTIF-001, MOBILE-PAYMENT-001, MOBILE-UX-001, MOBILE-UX-002, MOBILE-SEC-002, MOBILE-SEC-003, MOBILE-PERF-001, WEB-002, WEB-003

### Dev 4 — Frontend Web + Admin + Shopkeeper App
WEB-001, WEB-004, WEB-005, WEB-006, WEB-007, ADMIN-001, ADMIN-002, MOBILE-AUTH-003, MOBILE-ORDER-001, MOBILE-ORDER-002, MOBILE-ORDER-003, MOBILE-NOTIF-002, NOTIF-001, NOTIF-002, DB-001, DB-002

---

## Regression Testing Checklist

### Authentication
- [ ] Customer OTP login — new user creates account and customer profile
- [ ] Customer OTP login — existing user logs in with session token
- [ ] Customer session persisted across app restart
- [ ] Shopkeeper OTP login — existing shopkeeper logs in with correct role
- [ ] Delivery partner OTP login — sends `role: 'delivery_partner'` in request
- [ ] Admin login with correct email + password
- [ ] Admin login with wrong password — logs audit event
- [ ] Invalid OTP returns 400
- [ ] OTP rate limiting — > 5 sends per phone blocked

### Payments
- [ ] Razorpay order created with correct amount in paise
- [ ] Razorpay signature verified server-side
- [ ] Payment captured successfully via explicit capture call
- [ ] `payment_status` updated to `paid` in DB after verification
- [ ] Webhook `payment.captured` event updates order status
- [ ] Webhook `payment.failed` event updates order status  
- [ ] Webhook HMAC validated against raw body bytes (not parsed JSON)
- [ ] Refund triggered on order cancellation for paid orders
- [ ] GSTIN included in payment order metadata

### Order Lifecycle
- [ ] Customer places order → store allocation created for each store
- [ ] Shopkeeper receives new allocation within 30 seconds
- [ ] Shopkeeper accepts all items → pickup code generated
- [ ] Shopkeeper partial-accept → missing items reallocated
- [ ] Customer notified of item reallocation failure
- [ ] Order cancellation cancels all `order_store_allocations`
- [ ] Cancelled order does not appear in shopkeeper queue
- [ ] Paid order cancellation triggers refund

### Delivery
- [ ] Driver goes online → location recorded in `driver_locations`
- [ ] Driver proximity calculated from STORE location (not customer)
- [ ] Driver receives push notification for new offer within 5 seconds
- [ ] Driver accepts offer → atomically assigned via DB RPC
- [ ] Second driver attempting same offer gets `already_taken` response
- [ ] Pickup code verification succeeds with correct 4-digit code
- [ ] Pickup code verification fails with wrong code
- [ ] Delivery OTP verified before "Mark Delivered" button enabled
- [ ] Order status progresses: `pending → accepted → delivery_partner_assigned → picking_up → in_transit → delivered`
- [ ] Customer tracking page reflects each status change in real time

### Notifications
- [ ] Customer receives order confirmation notification
- [ ] Customer receives delivery partner assigned notification
- [ ] Customer receives out-for-delivery notification
- [ ] Customer receives delivered notification
- [ ] Shopkeeper receives push notification for new order (background)
- [ ] Driver receives push notification for new offer (background)

### Security
- [ ] `/api/delivery/simulate` returns 401 without admin auth
- [ ] Anon Supabase client cannot read `app_users` rows
- [ ] Service-role key NOT present in APK bundle (grep test)
- [ ] Customer auth token validated server-side on protected routes
- [ ] Admin `viewer` role cannot access mutation endpoints via API
- [ ] CORS rejects requests from unlisted origins in production

### Mobile App
- [ ] Customer app session restored on cold start without login prompt
- [ ] Customer app works correctly when no service-role key (production mode)
- [ ] Shopkeeper with multiple stores can switch store context
- [ ] Rider app `pending_verification` screen shows configurable contact info
- [ ] All three apps handle network timeout gracefully (30s timeout shows error)

---

## Release Readiness Verdict

**STATUS: BLOCKED — DO NOT RELEASE**

### Launch Blockers (must fix before any production traffic):
1. **MOBILE-SEC-001** — Service-role key in APK (full DB breach possible)
2. **AUTH-001** — Customer token never validated (auth bypass)
3. **PAY-001** — Webhook HMAC broken (payments never auto-confirmed)
4. **PAY-002** — `updateOrderStatus` returns 501 (order management broken)
5. **NOTIF-001** — All notifications are stubs (zero customer communication)
6. **DELIVERY-001** — Simulation endpoint unauthenticated in production
7. **MOBILE-AUTH-001** — Session restore fails without service-role key
8. **WEB-001** — Checkout email required field blocks OTP-only users
9. **WEB-002** — Customer session restore always fails on web (RLS blocks anon client)
10. **SECURITY-003** — CORS wildcard accepts all origins

### Recommended Sprint Plan:
- **Sprint 1 (Blockers):** MOBILE-SEC-001, AUTH-001, PAY-001, DELIVERY-001, NOTIF-001 skeleton (Expo push for critical events only)
- **Sprint 2 (Core Stability):** PAY-002, WEB-001, WEB-002, ORDER-002, DELIVERY-002, MOBILE-AUTH-003
- **Sprint 3 (Quality):** All remaining P1 items
- **Sprint 4 (Polish):** P2 and P3 items, performance optimizations

---

*Audit generated by Claude Code — Near & Now QA Report v1.0 — 2026-05-25*
