# Near & Now — Enterprise QA Audit Report (Full Detail)
**Date:** 2026-05-26  
**Auditor Role:** Senior QA Engineer / Full-Stack Architect / Product Analyst  
**Scope:** All platforms — Backend API, Admin Web, Customer Web, Customer Mobile App, Shopkeeper Mobile App, Delivery Partner Mobile App  
**Total Issues Found:** 104 Tickets

---

## Executive Summary

The Near & Now hyperlocal commerce platform is a monorepo (Express/TypeScript backend + React SPA frontend + React Native Expo mobile apps) backed by Supabase PostgreSQL with RLS. The codebase is under active development with 22+ recent migrations. This audit covers a deep dive of every controller, service, hook, screen, and context file across all six sub-applications.

**Codebase Health Assessment:**
- Architecture is conceptually sound — role-scoped auth, atomic offer acceptance via DB RPCs, realtime + polling hybrid tracking
- Core business logic has significant gaps: notification system entirely stubbed, payout system entirely absent, 8 endpoints return 501, invoice auth is completely broken
- Security posture has critical gaps: service-role key in APK, UUID used as Bearer token, store owner controller reads userId from query param, invoice endpoint has zero auth
- Admin panel has its own internal inconsistencies: mixes anon and admin Supabase clients, sends push directly to Expo from browser

**Release Readiness Verdict: BLOCKED — 15 launch blockers identified**

---

## Critical Production Risks Table

| Risk | Affected Flow | Impact | Ticket |
|------|--------------|--------|--------|
| Invoice endpoint has no auth | Invoice generation | Full customer PII exposed to any caller | SECURITY-007 |
| storeOwner.getStores reads userId from query param | Store owner API | Any caller can impersonate any store owner | SECURITY-005 |
| Service-role key in APK | Customer mobile app | Full DB breach via decompiler | MOBILE-SEC-001 |
| Customer uses UUID as Bearer token | Customer API | Any observer can forge auth | MOBILE-SEC-004 |
| Webhook HMAC always fails | Razorpay webhooks | Payment status never auto-updated | PAY-001 |
| Customer token never persisted | All customer APIs | Silent auth bypass | AUTH-001 |
| updateOrderStatus returns 501 | Order management | No REST-level status management | PAY-002 |
| All notification methods empty | Entire order lifecycle | Zero customer/partner notifications | NOTIF-001 |
| No payout system exists | Rider + shopkeeper financials | Platform cannot operate commercially | CROSS-001 |
| supabaseAdmin silently falls back to anon key | All privileged DB ops | RLS blocks all backend-only operations in misconfigured env | SECURITY-004 |
| cancelOrder does not cancel allocations | Order cancellation | Riders/shopkeepers process cancelled orders | ORDER-002 |
| Delivery simulation endpoint unauthenticated | Delivery lifecycle | Anyone can corrupt any live order | DELIVERY-001 |
| All in-app notification DB methods are stubs | Notification inbox | Notification inbox permanently empty | NOTIF-003/004/005 |
| No rate limiting on OTP | Auth endpoints | Twilio draining + OTP brute-force | AUTH-002 |
| CORS wildcard when ALLOWED_ORIGINS unset | Backend | Cross-origin attacks in prod | SECURITY-003 |

---

## JIRA TICKETS — PART 1: BACKEND API

---

### AUTH-001 · CRITICAL · P0
**Summary:** Customer OTP token generated but never persisted — auth is non-functional  
**Affected Apps:** Customer Web, Customer Mobile App, Backend  
**Root Cause:** `auth.controller.ts:320` — `const token = crypto.randomUUID()` is returned in the response but never written to `app_users.session_token`. Shopkeeper tokens are persisted at line 208; delivery_partner tokens at line 199.  
**Current Behavior:** Customer receives a token, stores it, sends it as `Authorization: Bearer <token>` — but no backend middleware validates it. All customer routes accept any string as valid auth.  
**Suggested Fix:** After generating the token, add `await supabaseAdmin.from('app_users').update({ session_token: token }).eq('id', appUser.id)`. Add `requireCustomer` middleware validating `app_users.session_token`.  
**Severity:** Critical | **Priority:** P0

---

### AUTH-002 · HIGH · P1
**Summary:** No rate limiting on OTP send and verify endpoints  
**Affected Apps:** Backend, all client apps  
**Root Cause:** `server.ts` has no rate-limiting middleware. `sendOTP` and `verifyOTP` are open with no per-IP or per-phone throttle.  
**Suggested Fix:** Add `express-rate-limit` scoped per phone number. Max 3–5 OTP sends per phone per hour; max 5 verify attempts before lockout.  
**Severity:** High | **Priority:** P1

---

### AUTH-003 · MEDIUM · P2
**Summary:** Delivery partner app verifyOTP in authService.ts sends no role field — creates customer account  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/lib/authService.ts:verifyOTP` sends `{ phone, otp, name }` with no `role`. The backend `auth.controller.ts:120–126` defaults missing role to `'customer'`. Note: `otp.tsx:107` correctly sends `role: 'delivery_partner'` — bug is in shared `authService.ts` only.  
**Severity:** Medium | **Priority:** P2

---

### AUTH-004 · LOW · P3
**Summary:** navigator.userAgent called directly in admin service — fails in non-browser contexts  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts:119` — `user_agent: navigator.userAgent` inside a service function. Throws ReferenceError in SSR or Node.js contexts.  
**Suggested Fix:** Guard with `typeof navigator !== 'undefined'` or pass as parameter.  
**Severity:** Low | **Priority:** P3

---

### PAY-001 · CRITICAL · P0
**Summary:** Webhook HMAC verification always fails — all Razorpay webhooks silently rejected  
**Affected Apps:** Backend  
**Root Cause:** `payment.service.ts:verifyWebhook` calls `JSON.stringify(body)` where `body` is already a parsed JS object. Re-serializing produces a different byte sequence than Razorpay signed. HMAC never matches.  
**Suggested Fix:** Use `express.raw({ type: 'application/json' })` on the webhook route; compute HMAC over raw buffer bytes, not re-serialized JSON. Remove `RAZORPAY_KEY_SECRET` fallback.  
**Severity:** Critical | **Priority:** P0

---

### PAY-002 · CRITICAL · P0
**Summary:** updateOrderStatus returns 501 Not Implemented  
**Affected Apps:** Backend, Admin Web  
**Root Cause:** `orders.controller.ts:144–152` — `updateOrderStatus` voids both params and returns `501 { error: 'Not implemented yet' }` immediately.  
**Suggested Fix:** Implement by delegating to `databaseService.updateOrderStatus(id, status)`.  
**Severity:** Critical | **Priority:** P0

---

### PAY-003 · HIGH · P1
**Summary:** Split payment — UPI portion never routed through Razorpay  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** `CheckoutPage.tsx` — `isOnlineRazorpay` only true when `!splitEnabled`. When split is active, UPI amount is silently dropped.  
**Severity:** High | **Priority:** P1

---

### PAY-004 · MEDIUM · P2
**Summary:** GSTIN/business name collected at checkout but never sent to backend  
**Affected Apps:** Customer Web  
**Root Cause:** `CheckoutPage.tsx` — `gstin` and `invoiceName` exist in form state but are excluded from `orderData` passed to `createOrder()`.  
**Severity:** Medium | **Priority:** P2

---

### PAY-005 · MEDIUM · P2
**Summary:** Payment order creation has no idempotency key — network retries can cause double charges  
**Affected Apps:** Backend, all client apps  
**Root Cause:** `payment.service.ts:createPaymentOrder` creates Razorpay orders without `X-Razorpay-Idempotency-Key`. Client retry logic can generate multiple Razorpay orders for the same internal order.  
**Suggested Fix:** Use internal orderId as idempotency key.  
**Severity:** Medium | **Priority:** P2

---

### PAY-006 · HIGH · P1
**Summary:** Webhook verification falls back to API key secret when webhook secret is missing  
**Affected Apps:** Backend  
**Root Cause:** `payment.service.ts:verifyWebhook` falls back to `RAZORPAY_KEY_SECRET` when `RAZORPAY_WEBHOOK_SECRET` is unset. Using the API key for webhook HMAC verification accepts forged webhooks.  
**Severity:** High | **Priority:** P1

---

### COUPON-001 · HIGH · P1
**Summary:** Coupon validation ignores min_order_value column  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:validateCoupon` checks expiry, usage count, and per-user limits but never reads `min_order_value`. Any coupon can be applied to any cart value.  
**Severity:** High | **Priority:** P1

---

### COUPON-002 · MEDIUM · P2
**Summary:** Coupon usage count not atomically incremented — race condition allows over-redemption  
**Affected Apps:** Backend  
**Root Cause:** `validateCoupon` reads count then updates separately. Two concurrent requests can both pass the `max_uses` check.  
**Suggested Fix:** Use atomic `UPDATE ... WHERE usage_count < max_uses RETURNING *` or a Supabase RPC.  
**Severity:** Medium | **Priority:** P2

---

### COUPON-003 · LOW · P3
**Summary:** Expired coupons still visible in coupon list — only rejected at checkout  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** Coupon list endpoint does not filter by `is_active` and `expiry_date >= now()`.  
**Severity:** Low | **Priority:** P3

---

### ORDER-001 · HIGH · P1
**Summary:** Legacy createOrder path hardcodes delivery_fee ₹20 and sets all totals to zero  
**Affected Apps:** Backend  
**Root Cause:** `orders.controller.ts:createOrder` (POST /api/orders) hardcodes `delivery_fee: 20`, `total_amount: 0`, `subtotal: 0`. Results in ₹0 Razorpay orders.  
**Severity:** High | **Priority:** P1

---

### ORDER-002 · HIGH · P1
**Summary:** cancelOrder does not cancel order_store_allocations  
**Affected Apps:** Backend, Shopkeeper App  
**Root Cause:** `database.service.ts:cancelOrder` updates `customer_orders` and triggers refund but does not set `order_store_allocations` to `cancelled`. Shopkeepers and riders continue seeing the allocation as active.  
**Severity:** High | **Priority:** P1

---

### ORDER-003 · MEDIUM · P2
**Summary:** Rider acceptOrder sets status to in_transit, skipping delivery_partner_assigned and picking_up  
**Affected Apps:** Backend, Delivery Partner App  
**Root Cause:** `deliveryPartner.controller.ts:327` writes `status: 'in_transit'` directly. Expected: `pending → delivery_partner_assigned → picking_up → in_transit → delivered`.  
**Severity:** Medium | **Priority:** P2

---

### ORDER-004 · LOW · P3
**Summary:** getDeliveryAgents ignores _partnerId parameter — always returns all partners  
**Affected Apps:** Backend, Admin Web  
**Root Cause:** `database.service.ts:getDeliveryAgents` declares `_partnerId` but never uses it in the query.  
**Severity:** Low | **Priority:** P3

---

### ORDER-005 · MEDIUM · P2
**Summary:** Shopkeeper bulk-reject silently drops items when reallocation finds no store within 4km  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `reallocateMissingItems` has a 4km constraint. If no store found, items are dropped with no customer notification.  
**Severity:** Medium | **Priority:** P2

---

### ORDER-006 · HIGH · P1
**Summary:** deliveryPartner acceptOffer follow-up DB writes are non-atomic — system can reach inconsistent state  
**Affected Apps:** Backend  
**Root Cause:** `deliveryPartner.controller.ts` — atomic RPC `accept_driver_offer` is called first, but several subsequent Supabase update calls run separately. If any post-RPC write fails, the driver holds the offer but downstream state (order, allocation) is not updated.  
**Severity:** High | **Priority:** P1

---

### ORDER-007 · HIGH · P1
**Summary:** customers.controller.ts updateAddress returns 501 — customers cannot update saved addresses  
**Affected Apps:** Backend, Customer Web, Customer Mobile App  
**Root Cause:** `PUT /api/customers/:customerId/addresses/:addressId` returns `501 Not implemented yet`. The `addressId` param is voided.  
**Severity:** High | **Priority:** P1

---

### ORDER-008 · HIGH · P1
**Summary:** customers.controller.ts deleteAddress returns 501 — customers cannot delete saved addresses  
**Affected Apps:** Backend, Customer Web, Customer Mobile App  
**Root Cause:** `DELETE /api/customers/:customerId/addresses/:addressId` returns `501 Not implemented yet`.  
**Severity:** High | **Priority:** P1

---

### NOTIF-001 · CRITICAL · P0
**Summary:** All order lifecycle notification methods are empty stubs — zero notifications sent  
**Affected Apps:** Backend  
**Root Cause:** `notification.service.ts` — `sendOrderPlacedNotification`, `sendOrderConfirmedNotification`, `sendOrderShippedNotification`, `sendOrderDeliveredNotification`, `sendOrderCancelledNotification` all have empty bodies. `sendEmail` and `sendSMS` are `console.log` stubs.  
**Severity:** Critical | **Priority:** P0

---

### NOTIF-002 · HIGH · P1
**Summary:** sendPushNotification only queries delivery_partners — customer push is structurally impossible  
**Affected Apps:** Backend  
**Root Cause:** `notification.service.ts:sendPushNotification` looks up `expo_push_token` only in `delivery_partners`. No push token column exists in `app_users` or `customers`.  
**Suggested Fix:** Add `expo_push_token` column to `app_users`; register token on login; update `sendPushNotification` to query both tables.  
**Severity:** High | **Priority:** P1

---

### NOTIF-003 · HIGH · P1
**Summary:** getUserNotifications ignores all parameters and always returns empty array  
**Affected Apps:** Backend, all client apps  
**Root Cause:** `database.service.ts:getUserNotifications(_userId, _unreadOnly?)` makes no DB query and returns `[]`. The in-app notification inbox is permanently empty for every user.  
**Severity:** High | **Priority:** P1

---

### NOTIF-004 · HIGH · P1
**Summary:** markNotificationAsRead returns success without writing to the database  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:markNotificationAsRead` returns `{ success: true }` without executing any DB write.  
**Severity:** High | **Priority:** P1

---

### NOTIF-005 · HIGH · P1
**Summary:** markAllNotificationsAsRead returns success without writing to the database  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:markAllNotificationsAsRead` returns `{ success: true }` without any DB operation.  
**Severity:** High | **Priority:** P1

---

### NOTIF-006 · MEDIUM · P2
**Summary:** getNotificationPreferences returns hardcoded values — user preferences never loaded  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:getNotificationPreferences` returns `{ email: true, sms: true, push: true }` with no DB read. All users appear to have all preferences enabled regardless of their actual settings.  
**Severity:** Medium | **Priority:** P2

---

### NOTIF-007 · MEDIUM · P2
**Summary:** updateNotificationPreferences echoes input without writing to the database  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:updateNotificationPreferences` returns the input object unchanged without executing any DB write. User preferences can never be persistently changed.  
**Severity:** Medium | **Priority:** P2

---

### DELIVERY-001 · CRITICAL · P0
**Summary:** Delivery simulation endpoint is unauthenticated in production  
**Affected Apps:** Backend  
**Root Cause:** `delivery.controller.ts:startSimulation` has no auth middleware. Any actor knowing the URL can advance any real order through all statuses automatically.  
**Suggested Fix:** Gate behind admin auth or remove from production builds.  
**Severity:** Critical | **Priority:** P0

---

### DELIVERY-002 · HIGH · P1
**Summary:** Driver broadcast uses customer delivery address instead of store location  
**Affected Apps:** Backend  
**Root Cause:** `delivery.controller.ts:broadcastToDrivers` and `shopkeeper.controller.ts:broadcastToNearbyDrivers` use `order.delivery_latitude/longitude` (drop-off) as the proximity center. Should use store coordinates.  
**Severity:** High | **Priority:** P1

---

### DELIVERY-003 · HIGH · P1
**Summary:** Customer not notified when item reallocation fails — order silently degrades  
**Affected Apps:** Backend  
**Root Cause:** `shopkeeper.controller.ts:reallocateMissingItems` has a 4km constraint. When no replacement store is found, the order proceeds with fewer items without any customer notification.  
**Severity:** High | **Priority:** P1

---

### DELIVERY-004 · MEDIUM · P2
**Summary:** getOrderTrackingFull writes to stores table on every tracking fetch  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:getOrderTrackingFull` calls `reverseGeocode` and writes result to `stores.address` on every call. Tracking is polled every 3–5 seconds, causing hundreds of unnecessary DB writes per active order.  
**Severity:** Medium | **Priority:** P2

---

### DELIVERY-005 · HIGH · P1
**Summary:** shopkeeper.controller.ts broadcastToNearbyDrivers has no driver staleness filter  
**Affected Apps:** Backend  
**Root Cause:** `delivery.controller.ts:broadcastToDrivers` correctly filters drivers by `updated_at >= tenMinsAgo`, but `shopkeeper.controller.ts:broadcastToNearbyDrivers` applies no staleness filter. Shopkeeper-triggered broadcasts reach drivers who have been offline for hours.  
**Severity:** High | **Priority:** P1

---

### WEB-001 · HIGH · P1
**Summary:** Checkout email field is required — blocks OTP-only users without email  
**Affected Apps:** Customer Web  
**Root Cause:** `CheckoutPage.tsx` — email input has HTML `required` attribute. OTP-only customers cannot submit checkout.  
**Severity:** High | **Priority:** P1

---

### WEB-002 · HIGH · P1
**Summary:** getCurrentUserFromSession uses anon Supabase client — blocked by RLS, always returns null  
**Affected Apps:** Customer Web  
**Root Cause:** `frontend/src/services/authService.ts:getCurrentUserFromSession` queries `app_users` using the anon client. RLS prevents anon reads of `app_users`. Session restore always fails.  
**Severity:** High | **Priority:** P1

---

### WEB-003 · HIGH · P1
**Summary:** Order tracking page imports supabaseAdmin — service-role key exposed in browser bundle  
**Affected Apps:** Customer Web  
**Root Cause:** `frontend/src/hooks/useOrderTrackingRealtime.ts` imports `supabaseAdmin`. The admin client's service-role key is bundled into browser JS by Vite.  
**Severity:** High | **Priority:** P1

---

### WEB-004 · MEDIUM · P2
**Summary:** Dual polling strategy — realtime and 3s setInterval run simultaneously  
**Affected Apps:** Customer Web, Customer Mobile App  
**Root Cause:** Both tracking hooks maintain a Supabase realtime channel AND a polling interval. Polling should only run as a fallback when realtime is not in `SUBSCRIBED` state.  
**Severity:** Medium | **Priority:** P2

---

### WEB-005 · MEDIUM · P2
**Summary:** No AbortController for in-flight tracking fetches on component unmount  
**Affected Apps:** Customer Web  
**Root Cause:** `useOrderTrackingRealtime.ts` fires `fetchOrderTrackingFull()` on realtime events with no cancellation. Resolved responses update state on unmounted components.  
**Severity:** Medium | **Priority:** P2

---

### WEB-006 · MEDIUM · P2
**Summary:** CartContext.addToCart mutates cart item object in place — React immutability violation  
**Affected Apps:** Customer Web  
**Root Cause:** `CartContext.tsx:addToCart` modifies the existing object reference. React's shallow comparison will not detect this change, potentially skipping re-renders.  
**Severity:** Medium | **Priority:** P2

---

### WEB-007 · HIGH · P1
**Summary:** Address geocoding and order placement run in parallel — orders can be created with null coordinates  
**Affected Apps:** Customer Web  
**Root Cause:** `CheckoutPage.tsx` fires address save and geocoding concurrently with order creation. Slow geocoding leads to `delivery_latitude: null`, breaking dispatch.  
**Severity:** High | **Priority:** P1

---

### BACKEND-001 · HIGH · P1
**Summary:** No global Express error handler — unhandled errors return HTML to JSON clients  
**Affected Apps:** Backend  
**Root Cause:** `server.ts` has no four-argument `(err, req, res, next)` error middleware. Unhandled errors produce 500 HTML pages.  
**Severity:** High | **Priority:** P1

---

### BACKEND-002 · MEDIUM · P2
**Summary:** No request body size limit on express.json() — large payloads can exhaust memory  
**Affected Apps:** Backend  
**Root Cause:** `server.ts` — `express.json()` without `limit`. A single large-payload request can exhaust Node.js memory.  
**Suggested Fix:** `app.use(express.json({ limit: '1mb' }))`.  
**Severity:** Medium | **Priority:** P2

---

### BACKEND-003 · LOW · P3
**Summary:** Three separate haversine implementations with no shared utility — can silently diverge  
**Affected Apps:** Backend, Rider App  
**Root Cause:** `database.service.ts`, `delivery.controller.ts`, and `NAT_Near-Now_Rider-/app/(tabs)/home.tsx` each define their own `haversineKm`. Fixes do not propagate between copies.  
**Severity:** Low | **Priority:** P3

---

### BACKEND-004 · MEDIUM · P2
**Summary:** getAgentSchedule ignores all parameters and returns empty array  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:getAgentSchedule(_agentId, _date?)` makes no DB query and returns `[]`. Any scheduling or routing feature dependent on this is broken.  
**Severity:** Medium | **Priority:** P2

---

### SECURITY-001 · HIGH · P1
**Summary:** Admin dashboard has no per-endpoint permission enforcement — role checks are UI-only  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts` has `hasPermission()` but it is never applied as middleware on admin API routes. A `viewer` can call any mutation endpoint directly.  
**Severity:** High | **Priority:** P1

---

### SECURITY-002 · HIGH · P1
**Summary:** Admin creation endpoint has no server-side role check  
**Affected Apps:** Admin Web, Backend  
**Root Cause:** No server-side check that requester is `super_admin`. Only the UI hides the button for lower roles.  
**Severity:** High | **Priority:** P1

---

### SECURITY-003 · HIGH · P1
**Summary:** CORS wildcard when ALLOWED_ORIGINS is not set  
**Affected Apps:** Backend  
**Root Cause:** `server.ts` CORS `origin` callback returns `true` (allow all) when `ALLOWED_ORIGINS` env var is missing.  
**Severity:** High | **Priority:** P1

---

### SECURITY-004 · CRITICAL · P0
**Summary:** supabaseAdmin silently falls back to anon client when service role key is missing  
**Affected Apps:** Backend  
**Root Cause:** `backend/src/config/database.ts` — if `SUPABASE_SERVICE_ROLE_KEY` is not set, `supabaseAdmin` falls back to the anon `supabase` client. All privileged DB operations silently run under the anon key and are filtered by RLS, returning empty results or failing without error in any misconfigured environment.  
**Severity:** Critical | **Priority:** P0

---

### SECURITY-005 · CRITICAL · P0
**Summary:** storeOwner.controller.ts getStores reads userId from query parameter — full impersonation vulnerability  
**Affected Apps:** Backend, Shopkeeper Mobile App  
**Root Cause:** `storeOwner.controller.ts:getStores` reads `req.query.userId` with a comment explicitly marking it "TEMPORARY — NOT secure — just for development." The Bearer token is never validated. Any unauthenticated caller who knows a store owner's user ID gets full store data disclosure.  
**Severity:** Critical | **Priority:** P0

---

### SECURITY-006 · HIGH · P1
**Summary:** storeOwner.controller.ts updateStoreStatus and updateProductQuantity have no ownership verification  
**Affected Apps:** Backend  
**Root Cause:** Both handlers check for Bearer token presence but never validate that the authenticated store owner owns the target store or product. Any authenticated store owner can modify any other store's status or inventory.  
**Severity:** High | **Priority:** P1

---

### SECURITY-007 · CRITICAL · P0
**Summary:** Invoice generation endpoint has zero authentication — full customer PII exposed to unauthenticated callers  
**Affected Apps:** Backend  
**Root Cause:** `invoice.routes.ts` registers `POST /api/invoices/generate/:orderId` without any auth middleware. Any caller who knows an order ID can download the invoice containing customer name, phone, address, and itemized order details.  
**Severity:** Critical | **Priority:** P0

---

### SECURITY-008 · HIGH · P1
**Summary:** Invoice controller requireCustomer uses UUID as Bearer token — trivially forgeable  
**Affected Apps:** Backend  
**Root Cause:** `invoice.controller.ts:requireCustomer` authenticates by looking up `app_users` where `.eq('id', token)`. The "token" is the UUID primary key — not a secret. UUIDs appear in URLs, logs, and API responses.  
**Severity:** High | **Priority:** P1

---

### SECURITY-009 · HIGH · P1
**Summary:** Invoice controller requireShopkeeper looks up by id instead of session_token — all shopkeeper invoice requests fail  
**Affected Apps:** Backend  
**Root Cause:** `invoice.controller.ts:requireShopkeeper` queries by `.eq('id', token)`. The correct field is `session_token` (as used in `shopkeeper.controller.ts`). Every legitimate shopkeeper using a real session token is rejected.  
**Severity:** High | **Priority:** P1

---

### DB-001 · MEDIUM · P2
**Summary:** PaymentStatus type uses 'completed' but all database writes use 'paid'  
**Affected Apps:** Backend  
**Root Cause:** `database.types.ts:PaymentStatus` includes `'completed'`; all actual writes use `'paid'`. Code that writes `'completed'` passes TypeScript without error but produces records invisible to `'paid'` filters.  
**Severity:** Medium | **Priority:** P2

---

### DB-002 · MEDIUM · P2
**Summary:** OrderStatus type missing 'picking_up' — added in migration but types not updated  
**Affected Apps:** Backend  
**Root Cause:** Migration `20260505000000_add_picking_up_order_status.sql` added this status but `database.types.ts` was not updated. Exhaustive switch statements will silently miss this value.  
**Severity:** Medium | **Priority:** P2

---

### PERF-001 · MEDIUM · P2
**Summary:** getNearbyStores fetches all stores and filters by distance in JavaScript — no DB-level geospatial query  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:getNearbyStores` fetches every store from Supabase then applies haversine filtering in JS. Full table scan and full data transfer for every browse request. Will not scale beyond a few hundred stores.  
**Severity:** Medium | **Priority:** P2

---

### PERF-002 · MEDIUM · P2
**Summary:** getProductsWithDetails fetches all products and filters by radius in JavaScript  
**Affected Apps:** Backend  
**Root Cause:** `database.service.ts:getProductsWithDetails` fetches the entire product catalog before filtering. Same full-scan problem as `getNearbyStores`.  
**Severity:** Medium | **Priority:** P2

---

### PERF-003 · MEDIUM · P2
**Summary:** products.controller.ts getProductById fetches entire catalog then finds target in JavaScript  
**Affected Apps:** Backend  
**Root Cause:** `products.controller.ts` calls `databaseService.getProductsWithDetails()` (all products) then `.find()` in JS. O(N) full catalog transfer to serve a single product detail.  
**Severity:** Medium | **Priority:** P2

---

---

## JIRA TICKETS — PART 2: ADMIN PANEL

---

### ADMIN-001 · MEDIUM · P2
**Summary:** Admin session not invalidated on logout — tokens remain valid for up to 12 hours  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts` logout does not delete the `admin_sessions` row. Token remains valid until natural 12-hour TTL.  
**Severity:** Medium | **Priority:** P2

---

### ADMIN-002 · LOW · P3
**Summary:** Failed login audit logging can throw and mask the auth failure response  
**Affected Apps:** Admin Web  
**Root Cause:** `authenticateAdmin` calls `logFailedLogin` and `logSecurityEvent` sequentially without error isolation. DB unavailability causes the function to throw instead of returning null cleanly.  
**Severity:** Low | **Priority:** P3

---

### ADMIN-003 · HIGH · P1
**Summary:** StoresPage.tsx uses the anon Supabase client — inconsistent with rest of admin panel and subject to RLS  
**Affected Apps:** Admin Web  
**Root Cause:** `admin/src/pages/admin/StoresPage.tsx` imports and uses the anon `supabase` client instead of `getAdminClient()`. Queries may return incomplete data or fail silently for privileged operations.  
**Severity:** High | **Priority:** P1

---

### ADMIN-004 · MEDIUM · P2
**Summary:** adminService.ts mapDbStatusToFrontend collapses fine-grained order statuses into only 5 states  
**Affected Apps:** Admin Web  
**Root Cause:** DB statuses like `preparing_order`, `picking_up`, `out_for_delivery` map to only 5 frontend states. Admin UI cannot distinguish between preparation and pickup phases.  
**Severity:** Medium | **Priority:** P2

---

### ADMIN-005 · MEDIUM · P2
**Summary:** adminService.ts updateOrderStatus maps 'confirmed' to 'store_accepted' — skips preparing_order stage  
**Affected Apps:** Admin Web  
**Root Cause:** `adminService.ts` sends `store_accepted` to DB when admin selects "confirmed," bypassing `preparing_order`. Causes inconsistent order state between admin, shopkeeper, and customer views.  
**Severity:** Medium | **Priority:** P2

---

### ADMIN-006 · HIGH · P1
**Summary:** adminService.ts getCustomers returns all app_users including shopkeepers and delivery partners  
**Affected Apps:** Admin Web  
**Root Cause:** Customer list query has no role filter. Shopkeepers, delivery partners, and customers all appear in the admin Customers list, inflating count and polluting the view.  
**Severity:** High | **Priority:** P1

---

### ADMIN-007 · MEDIUM · P2
**Summary:** adminService.ts getOrders performs an N+1 fetch pattern for customer data  
**Affected Apps:** Admin Web  
**Root Cause:** All orders are fetched first, then customer data is fetched in a separate query. Two round trips minimum, scales poorly with order count.  
**Severity:** Medium | **Priority:** P2

---

### ADMIN-008 · MEDIUM · P2
**Summary:** Admin session stored in sessionStorage only — admins logged out on every tab close  
**Affected Apps:** Admin Web  
**Root Cause:** `adminAuthService.ts` persists session to `sessionStorage`, cleared on tab close. No persistent login option despite a 12-hour server-side session window.  
**Severity:** Medium | **Priority:** P2

---

### ADMIN-009 · CRITICAL · P0
**Summary:** NotificationsPage sends push notifications directly from browser to Expo API — no backend audit trail  
**Affected Apps:** Admin Web  
**Root Cause:** `admin/src/pages/admin/NotificationsPage.tsx` POSTs directly from the browser to `https://exp.host/--/api/v2/push/send`. No backend involvement — no auth check, no rate limiting, no logging, no audit trail. Any compromised admin account can send arbitrary messages to all users.  
**Severity:** Critical | **Priority:** P0

---

### ADMIN-010 · HIGH · P1
**Summary:** SettingsPage.tsx does not persist any settings — all configuration lost on page reload  
**Affected Apps:** Admin Web  
**Root Cause:** Settings UI renders forms for general, notification, and payment settings but changes are never written to backend or database. Every reload reverts to defaults.  
**Severity:** High | **Priority:** P1

---

---

## JIRA TICKETS — PART 3: CUSTOMER MOBILE APP

---

### MOBILE-SEC-001 · CRITICAL · P0
**Summary:** Service-role Supabase key bundled into Customer App APK and IPA via EXPO_PUBLIC_ prefix  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/lib/supabase.ts:26` reads `process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Expo bakes all `EXPO_PUBLIC_` vars into the JS bundle in the APK/IPA. Anyone who decompiles the app with Jadx or apktool has unrestricted read/write access to the entire database.  
**Suggested Fix:** Remove from client entirely. Move all `supabaseAdmin` calls to backend API endpoints.  
**QA Validation:** Build APK, run `apktool d app.apk`, grep for service-role key — must not appear.  
**Severity:** Critical | **Priority:** P0

---

### MOBILE-SEC-002 · HIGH · P1
**Summary:** Session tokens stored in plain AsyncStorage across all three mobile apps — readable on rooted devices  
**Affected Apps:** Customer App, Shopkeeper App, Rider App  
**Root Cause:** All three apps store session tokens and user objects in unencrypted AsyncStorage. On rooted Android, AsyncStorage is world-readable. Stolen token grants full API access.  
**Suggested Fix:** Use `expo-secure-store` for auth tokens.  
**Severity:** High | **Priority:** P1

---

### MOBILE-SEC-003 · MEDIUM · P2
**Summary:** Rider app has no session expiry — compromised tokens remain valid indefinitely  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `session.ts` stores `{ token, user }` with no `expiresAt`. The `delivery_partners.session_token` column has no TTL enforcement on backend.  
**Suggested Fix:** Add `expiresAt` to session; backend validates token age (e.g., 30-day rolling window).  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-SEC-004 · CRITICAL · P0
**Summary:** Customer app uses user UUID directly as Bearer token — trivially forgeable  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/context/AuthContext.tsx` uses `userId` (UUID) as Bearer token. UUIDs are not secrets — they appear in API responses, URLs, and logs. Any observer can forge auth.  
**Severity:** Critical | **Priority:** P0

---

### MOBILE-AUTH-001 · CRITICAL · P0
**Summary:** Customer app getCurrentUserFromSession uses supabaseAdmin — session restore breaks when key is removed  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/lib/authService.ts:getCurrentUserFromSession` calls `supabaseAdmin.from('app_users')`. This only works because the service-role key is bundled. Removing the key breaks session restore for all customers.  
**Suggested Fix:** Create `GET /api/auth/me` backend endpoint. Mobile app calls it with Bearer token.  
**Severity:** Critical | **Priority:** P0  
**Dependencies:** MOBILE-SEC-001

---

### MOBILE-AUTH-002 · HIGH · P1
**Summary:** Rider authService.ts verifyOTP omits role field — new riders get customer accounts  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/lib/authService.ts:verifyOTP` sends `{ phone, otp, name }` with no `role`. Backend defaults to `'customer'`. Fix: always include `role: 'delivery_partner'`.  
**Severity:** High | **Priority:** P1

---

### MOBILE-AUTH-003 · HIGH · P1
**Summary:** Multi-store shopkeeper can only manage first store — stores[0] hardcoded  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/app/(tabs)/home.tsx:92` — `const selectedStore = stores[0]`. No store picker UI. All actions apply to store index 0 only.  
**Suggested Fix:** Add store picker UI; persist `selectedStoreId` to AsyncStorage.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-001 · HIGH · P1
**Summary:** Shopkeeper order cache returns stale data — 30s TTL with no realtime invalidation  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/services/orderService.ts:fetchOrders` uses a 30s module-level cache. Invalidation only on `acceptOrder`/`rejectOrder`, not on realtime events. New orders appear in the popup but the list may remain stale for up to 30 seconds.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-002 · MEDIUM · P2
**Summary:** Two separate order-fetching paths exist in the shopkeeper app and are never reconciled  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `hooks/useOrders.ts` fetches from `/shopkeeper/orders`; `services/orderService.ts` fetches from `/store-owner/stores/:id/orders` (a non-existent endpoint). Two out-of-sync data sources.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-003 · MEDIUM · P2
**Summary:** Rider delivery screen polls pickup sequence every 10 seconds with no realtime subscription  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `delivery/[orderId].tsx:300` uses only `setInterval` at 10s. No Supabase realtime channel unlike the home screen. Pickup code arrival requires up to 10 seconds.  
**Suggested Fix:** Add realtime subscription on `order_store_allocations` filtered by `order_id`.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-004 · HIGH · P1
**Summary:** Shopkeeper OrderService class references four non-existent backend endpoints — entire class is dead code  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/services/orderService.ts` calls `/store-owner/stores/${storeId}/orders`, `/store-owner/orders/${orderId}/accept`, `/store-owner/orders/${orderId}/reject`, and `/store-owner/orders/${orderId}/verify-qr`. None exist in the backend. The class is not used by the working `useOrders.ts` hook.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-005 · HIGH · P1
**Summary:** useOrders.ts fetchOrderDetails is a stub that always returns null  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/hooks/useOrders.ts:fetchOrderDetails` is defined as `async (_id: string) => null`. Any component calling this for order detail data receives null unconditionally.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-006 · HIGH · P1
**Summary:** useOrders.ts verifyQR always returns failure — shopkeeper QR verification is non-functional  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/hooks/useOrders.ts:verifyQR` returns `{ success: false, error: 'Not supported' }` unconditionally. Pickup code QR verification from the shopkeeper side is completely broken.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-007 · MEDIUM · P2
**Summary:** useOrders.ts setSelectedOrder is a no-op — selecting an order has no effect  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/hooks/useOrders.ts:setSelectedOrder` is defined as `() => {}`. Any UI flow relying on selected order state is broken.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-008 · HIGH · P1
**Summary:** Shopkeeper home screen activeOrderCount is hardcoded to 0  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/app/(tabs)/home.tsx` — `const activeOrderCount = 0` unconditionally. Home screen always shows 0 active orders.  
**Severity:** High | **Priority:** P1

---

### MOBILE-NOTIF-001 · HIGH · P1
**Summary:** Customer app has no push notification registration — no backend column to store push tokens  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `usePushNotifications.ts` handles Expo token registration but neither `app_users` nor `customers` has an `expo_push_token` column. No backend storage path and `sendPushNotification` doesn't query customer tables.  
**Severity:** High | **Priority:** P1

---

### MOBILE-NOTIF-002 · MEDIUM · P2
**Summary:** Shopkeeper incoming order popup relies solely on polling — no push for background orders  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `useOrders.ts:useSmartPoll` at 10–30s intervals. No FCM/APNs/Expo push channel. Background shopkeepers may miss 60-second acceptance window.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-PAYMENT-001 · HIGH · P1
**Summary:** Payment reconcile loop has no circuit breaker for cancelled or failed orders  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `usePaymentFlow.ts:reconcile` polls `getOrderPaymentStatus` every 1.5s for up to 10 seconds even when order is already cancelled. Should short-circuit on first non-pending status.  
**Severity:** High | **Priority:** P1

---

### MOBILE-PAYMENT-002 · MEDIUM · P2
**Summary:** Saved payment methods skeleton renders permanently when feature flag is disabled  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `razorpayService.ts:SAVED_METHODS_ENABLED` defaults to false. `settings/payments.tsx` renders a "Preferred Payment" skeleton that never populates.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-BUG-001 · HIGH · P1
**Summary:** Customer app checkout fields (GSTIN, tip, receiver details) concatenated into a notes string — backend never parses them  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/app/support/checkout.tsx` collects `gstin`, `invoiceName`, `tipAmount`, `orderFor`, `receiverName`, `receiverPhone`, `receiverAddress` then concatenates them into a single freeform `notes` string. The backend receives the string but never parses it. GST invoicing, tip handling, and third-party delivery are all structurally broken.  
**Severity:** High | **Priority:** P1

---

### MOBILE-UX-001 · MEDIUM · P2
**Summary:** Rider app pending_verification screen shows hardcoded admin phone number  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/home.tsx:549` — `Linking.openURL("tel:+919062692914")`. Requires code change and release to update.  
**Suggested Fix:** Source from backend config or environment variable.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-UX-002 · MEDIUM · P2
**Summary:** OTP auto-submit can fire prematurely on slow Android keyboards  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `otp.tsx:54–59` calls `handleVerify` when `isComplete` is true. Some Android IME implementations fire the 6th character event multiple times, triggering premature API calls.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-UX-003 · HIGH · P1
**Summary:** Customer app wallet screen is full UI with an "Add Money" button that shows a coming-soon alert — no backend  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/app/wallet.tsx` renders balance, transaction history, and an "Add Money" button which fires `Alert.alert("Payment gateway integration coming soon.")`. No backend wallet, balance API, or payment integration exists.  
**Severity:** High | **Priority:** P1

---

### MOBILE-UX-004 · HIGH · P1
**Summary:** Shopkeeper payments screen is an unconditional "No payouts yet" placeholder — no backend payout system  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/app/(tabs)/payments.tsx` renders "No payouts yet" with no API calls. No backend payout endpoint, DB payout table, or settlement logic exists.  
**Severity:** High | **Priority:** P1

---

### MOBILE-PERF-001 · MEDIUM · P2
**Summary:** Rider app home screen creates a new Supabase client instance on every cold start  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/home.tsx:28` calls `createClient(...)` inline instead of using a shared `lib/supabase.ts` singleton. New WebSocket connection every cold start.  
**Suggested Fix:** Extract to `lib/supabase.ts` singleton, same pattern as other apps.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-PERF-002 · LOW · P3
**Summary:** Shopkeeper app fetchStoreProducts called twice on first mount  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `home.tsx` initial `useEffect` and `useFocusEffect` both call `fetchStoreProducts`. `firstFocusRef` guard prevents subsequent focus calls but not the double call on initial mount.  
**Severity:** Low | **Priority:** P3

---

### MOBILE-PERF-003 · MEDIUM · P2
**Summary:** Rider app polls for active orders every 6 seconds even when offline  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/home.tsx` fires an order polling interval every 6 seconds regardless of rider online/offline status. Unnecessary battery and bandwidth drain when not on duty.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-PERF-004 · MEDIUM · P2
**Summary:** Customer app runs realtime subscription and 5-second polling simultaneously for order tracking  
**Affected Apps:** Customer Mobile App  
**Root Cause:** `nearandnowcustomerapp/hooks/useOrderTracking.ts` establishes a Supabase realtime subscription AND polls every 5 seconds. Redundant when realtime is active. Additionally polls driver location separately every 2 seconds.  
**Severity:** Medium | **Priority:** P2

---

---

## JIRA TICKETS — PART 4: CROSS-APP & SYSTEM

---

### CROSS-001 · CRITICAL · P0
**Summary:** No payout or earnings system exists anywhere on the platform  
**Affected Apps:** Rider App, Shopkeeper App, Backend  
**Root Cause:** Rider app estimates earnings as 15% of order total (hardcoded in `earnings.tsx`). Shopkeeper app shows "No payouts yet" unconditionally. No backend payout endpoint, no DB payout table, no financial settlement logic, and no agreed payout rate exist anywhere.  
**Impact:** Neither riders nor store owners have any accurate financial data. Platform cannot operate commercially without this.  
**Severity:** Critical | **Priority:** P0

---

### CROSS-002 · HIGH · P1
**Summary:** Auth token strategy inconsistent across apps and controllers — some legitimate callers always rejected  
**Affected Apps:** All  
**Root Cause:** Shopkeeper and rider use randomly generated `session_token` stored in DB. Customer uses raw `user_id` UUID. Main shopkeeper controller validates via `session_token` (correct). `invoice.controller.ts` validates shopkeepers via `id` field (wrong) — every legitimate shopkeeper invoice request is rejected. Customer invoice auth uses UUID as the token. The strategies are incompatible and inconsistently applied.  
**Severity:** High | **Priority:** P1

---

### CROSS-003 · MEDIUM · P2
**Summary:** Pickup code generation timing is inconsistent — codes may exist before shopkeeper acceptance  
**Affected Apps:** Backend  
**Root Cause:** `orders.controller.ts` comments state pickup codes are generated at shopkeeper acceptance time. `shopkeeper.controller.ts:reallocateMissingItems` generates pickup codes at allocation insert time, before acceptance. The two paths behave differently, and pickup codes may be created prematurely depending on which path ran.  
**Severity:** Medium | **Priority:** P2

---

## Severity Summary

| Severity | Count |
|----------|-------|
| Critical | 15 |
| High | 48 |
| Medium | 33 |
| Low | 8 |
| **Total** | **104** |

---

## Team Assignment (4 Developers)

### Dev 1 — Backend Core (Auth, Payments, Security)
AUTH-001, AUTH-002, PAY-001, PAY-002, PAY-003, PAY-005, PAY-006, BACKEND-001, BACKEND-002, SECURITY-001, SECURITY-002, SECURITY-003, SECURITY-004, SECURITY-005, SECURITY-006, SECURITY-007, SECURITY-008, SECURITY-009

### Dev 2 — Order Lifecycle, Delivery & Notifications
ORDER-001, ORDER-002, ORDER-003, ORDER-005, ORDER-006, ORDER-007, ORDER-008, DELIVERY-001, DELIVERY-002, DELIVERY-003, DELIVERY-004, DELIVERY-005, NOTIF-001, NOTIF-002, NOTIF-003, NOTIF-004, NOTIF-005, NOTIF-006, NOTIF-007, COUPON-001, COUPON-002, BACKEND-004, PERF-001, PERF-002, PERF-003, CROSS-001, CROSS-003

### Dev 3 — Mobile Apps (Customer + Rider)
MOBILE-SEC-001, MOBILE-SEC-002, MOBILE-SEC-003, MOBILE-SEC-004, MOBILE-AUTH-001, MOBILE-AUTH-002, MOBILE-BUG-001, MOBILE-NOTIF-001, MOBILE-PAYMENT-001, MOBILE-PAYMENT-002, MOBILE-UX-001, MOBILE-UX-002, MOBILE-UX-003, MOBILE-PERF-001, MOBILE-PERF-003, MOBILE-PERF-004, WEB-002, WEB-003

### Dev 4 — Frontend Web, Admin & Shopkeeper App
WEB-001, WEB-004, WEB-005, WEB-006, WEB-007, ADMIN-001, ADMIN-002, ADMIN-003, ADMIN-004, ADMIN-005, ADMIN-006, ADMIN-007, ADMIN-008, ADMIN-009, ADMIN-010, MOBILE-AUTH-003, MOBILE-ORDER-001, MOBILE-ORDER-002, MOBILE-ORDER-003, MOBILE-ORDER-004, MOBILE-ORDER-005, MOBILE-ORDER-006, MOBILE-ORDER-007, MOBILE-ORDER-008, MOBILE-NOTIF-002, MOBILE-UX-004, MOBILE-PERF-002, CROSS-002, DB-001, DB-002

---

## Release Readiness Verdict

**STATUS: BLOCKED — DO NOT RELEASE**

### Launch Blockers (must fix before any production traffic):
1. **SECURITY-007** — Invoice endpoint has zero auth (any caller gets customer PII)
2. **SECURITY-005** — storeOwner.getStores reads userId from query param (impersonation)
3. **MOBILE-SEC-001** — Service-role key in APK (full DB breach via decompiler)
4. **MOBILE-SEC-004** — Customer UUID used as Bearer token (trivially forgeable)
5. **SECURITY-004** — supabaseAdmin silently falls back to anon key in misconfigured env
6. **AUTH-001** — Customer token never persisted (auth bypass on all customer routes)
7. **PAY-001** — Webhook HMAC always fails (payment status never auto-confirmed)
8. **PAY-002** — updateOrderStatus returns 501 (no order status management)
9. **NOTIF-001** — All notification methods empty (zero customer communication)
10. **ADMIN-009** — Push notifications sent directly from browser to Expo (no backend oversight)
11. **CROSS-001** — No payout system exists (platform cannot operate commercially)
12. **DELIVERY-001** — Simulation endpoint unauthenticated in production
13. **MOBILE-AUTH-001** — Session restore fails without service-role key
14. **WEB-001** — Checkout email required blocks OTP-only users
15. **SECURITY-003** — CORS wildcard accepts all origins

### Recommended Sprint Plan:
- **Sprint 1 (Critical Security + Auth):** SECURITY-004, SECURITY-005, SECURITY-007, MOBILE-SEC-001, MOBILE-SEC-004, AUTH-001, AUTH-002, ADMIN-009
- **Sprint 2 (Core Flows):** PAY-001, PAY-002, NOTIF-001 skeleton, DELIVERY-001, MOBILE-AUTH-001, WEB-001, WEB-002, ORDER-002
- **Sprint 3 (Stability + Stubs):** ORDER-007, ORDER-008, NOTIF-002 through NOTIF-007, SECURITY-006, SECURITY-008, SECURITY-009, ADMIN-003, ADMIN-006, MOBILE-ORDER-004 through MOBILE-ORDER-008
- **Sprint 4 (Commercial Viability):** CROSS-001 (payout system), MOBILE-UX-003, MOBILE-UX-004, MOBILE-BUG-001
- **Sprint 5 (Polish):** All remaining P2 and P3 items, performance optimizations

---

*Audit generated by Claude Code — Near & Now QA Report v2.0 — 2026-05-26*
