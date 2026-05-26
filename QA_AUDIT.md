# [Backend][Auth] Customer OTP token generated but never persisted — auth is non-functional

In `auth.controller.ts:320`, `crypto.randomUUID()` is returned to the client but never written to `app_users.session_token`. Unlike shopkeeper (line 208) and delivery partner (line 199) flows, the customer path skips the DB write entirely. All protected customer routes silently accept any arbitrary Bearer token string.

---

# [Backend][Auth][Rate Limiting] No rate limiting on OTP send and verify endpoints

`server.ts` registers no rate-limiting middleware on `/api/auth/send-otp` or `/api/auth/verify-otp`. An attacker can exhaust Twilio credits by spamming OTP sends, or brute-force the 6-digit code on the verify endpoint with no lockout.

---

# [Delivery Partner App][Auth] verifyOTP in authService.ts omits the role field and silently creates a customer account for new riders

`NAT_Near-Now_Rider-/lib/authService.ts:verifyOTP` sends only `{ phone, otp, name }` with no `role` field. The backend `auth.controller.ts:120–126` defaults a missing role to `'customer'`. Note: `otp.tsx:107` correctly sends `role: 'delivery_partner'` — the bug is isolated to the shared `authService.ts`.

---

# [Admin Web][Auth] navigator.userAgent called directly in admin service — crashes in non-browser contexts

`adminAuthService.ts:119` reads `navigator.userAgent` inside a service function rather than guarding it. This throws a ReferenceError in SSR environments, test runners, or any Node.js context where `navigator` is undefined.

---

# [Android][Customer App][Auth] Customer app uses user UUID directly as Bearer token — trivially forgeable

`nearandnowcustomerapp/context/AuthContext.tsx` uses the customer's `userId` (UUID) as the Bearer token on all API calls. UUIDs are not secrets — they appear in API responses, URLs, and logs. Any party who observes a customer UUID can forge authenticated requests on their behalf.

---

# [Backend][Payment] Webhook HMAC verification always fails — all Razorpay webhooks are silently rejected

`payment.service.ts:verifyWebhook` calls `JSON.stringify(body)` on an already-parsed JS object, producing a different byte sequence than the raw body Razorpay signed. The HMAC never matches, so every `payment.captured`, `payment.failed`, and `refund.processed` event returns 400 and payment status is never auto-updated.

---

# [Backend][Payment] updateOrderStatus returns 501 Not Implemented

`orders.controller.ts:144–152` returns `501 { error: 'Not implemented yet' }` immediately, voiding both the `orderId` and `status` params. Any call to `PATCH /api/orders/:orderId/status` is completely non-functional, making manual order status management broken.

---

# [Customer Web][Payment][Split Payment] UPI portion of a split payment is never charged through Razorpay

In `CheckoutPage.tsx`, `isOnlineRazorpay` is only true when `paymentMethod === 'online' && !splitEnabled`. When split payment is active, the Razorpay flow is skipped and the UPI amount is silently dropped — only the COD portion is recorded.

---

# [Customer Web][Payment] GSTIN and business name are collected at checkout but excluded from the order payload

`CheckoutPage.tsx` maintains `gstin` and `invoiceName` in local form state but neither is included in the `orderData` object passed to `createOrder()`. Business customers who enter their GSTIN will find it absent from backend records and invoices.

---

# [Backend][Payment] Payment order creation has no idempotency key — network retries can cause double charges

`payment.service.ts:createPaymentOrder` creates Razorpay orders without an `X-Razorpay-Idempotency-Key` header. Since the customer mobile app's `apiFetch` includes retry logic, a failed or timed-out request can result in multiple Razorpay charges for the same order.

---

# [Backend][Payment] Webhook verification falls back to the Razorpay API key when the webhook secret is missing

`payment.service.ts:verifyWebhook` uses `RAZORPAY_KEY_SECRET` as a fallback when `RAZORPAY_WEBHOOK_SECRET` is unset. Using the API key for webhook HMAC verification is incorrect and will accept forged webhook events from any attacker who knows the API key.

---

# [Backend][Coupon] Coupon validation ignores the min_order_value column entirely

`database.service.ts:validateCoupon` checks expiry, usage counts, and per-user limits but never reads `min_order_value`. A coupon marked "minimum ₹500 order" can be applied to a ₹50 cart and the discount is granted.

---

# [Backend][Coupon] Coupon usage count has a race condition — concurrent orders can both exceed max_uses

`validateCoupon` reads the current count and writes the update in two separate DB operations. Two concurrent requests can both pass the `max_uses` check before either write completes. Fix requires an atomic `UPDATE ... WHERE usage_count < max_uses RETURNING *` or a Supabase RPC.

---

# [Customer Web][Coupon][UI] Expired coupons appear in the coupon list and only fail at checkout

The coupon list endpoint returns all coupons without filtering on `is_active` or `expiry_date >= now()`. Customers can select an expired coupon, fill out the entire checkout, and only learn it is invalid when they attempt to place the order.

---

# [Backend][Order] Legacy createOrder endpoint hardcodes delivery_fee at ₹20 and sets all financial totals to zero

`orders.controller.ts:createOrder` (the `POST /api/orders` path, distinct from `placeCheckout`) hardcodes `delivery_fee: 20` and writes `total_amount: 0` and `subtotal: 0`. Orders placed through this path generate ₹0 Razorpay payment orders.

---

# [Backend][Order] cancelOrder does not update order_store_allocations — shopkeepers and riders keep seeing cancelled orders

`database.service.ts:cancelOrder` updates `customer_orders` and triggers a refund but never sets associated `order_store_allocations` rows to `cancelled`. Shopkeepers continue seeing them as `pending_acceptance` and drivers may continue receiving dispatches.

---

# [Backend][Order] Rider acceptOrder sets status to in_transit, skipping delivery_partner_assigned and picking_up

`deliveryPartner.controller.ts:327` writes `status: 'in_transit'` directly. The expected sequence is `pending → delivery_partner_assigned → picking_up → in_transit → delivered`. The customer tracking page skips two status steps.

---

# [Backend][Order] getDeliveryAgents ignores the _partnerId parameter and always returns all delivery partners

`database.service.ts:getDeliveryAgents` declares `_partnerId` in its signature but the parameter is never referenced in the query. The endpoint always returns the complete list regardless of the filter passed by the admin dashboard.

---

# [Shopkeeper App][Order] Bulk-reject silently drops items when reallocation finds no replacement store within 4km

`useOrders.ts:rejectOrder` triggers `reallocateMissingItems` which has a hard 4km radius constraint. When no store is found, the function returns without notifying the customer, and the order ships with a reduced item set the customer was never told about.

---

# [Backend][Order] deliveryPartner.controller.ts — acceptOffer follow-up DB writes are non-atomic

The RPC `accept_driver_offer` is called atomically first (correct), but several subsequent Supabase update calls run separately. If any of these fail after the RPC succeeds, the system lands in a partially-updated state — the driver holds the offer but downstream order and allocation state may not reflect it.

---

# [Backend][Order][Customer] customers.controller.ts — updateAddress is a 501 stub

`PUT /api/customers/:customerId/addresses/:addressId` returns `501 Not implemented yet` immediately, voiding the `addressId` param. Customers cannot update any saved delivery address.

---

# [Backend][Order][Customer] customers.controller.ts — deleteAddress is a 501 stub

`DELETE /api/customers/:customerId/addresses/:addressId` returns `501 Not implemented yet` immediately. Customers cannot delete any saved delivery address.

---

# [Backend][Notification] All order notification methods are empty stubs — zero notifications sent throughout the entire order lifecycle

`notification.service.ts` defines `sendOrderPlacedNotification`, `sendOrderConfirmedNotification`, `sendOrderShippedNotification`, `sendOrderDeliveredNotification`, and `sendOrderCancelledNotification` all with empty bodies `{}`. The underlying `sendEmail` and `sendSMS` functions are `console.log` stubs with `// TODO: SendGrid / AWS SES` comments.

---

# [Backend][Notification] sendPushNotification only queries delivery_partners — customer push is structurally impossible

`notification.service.ts:sendPushNotification` looks up `expo_push_token` only in the `delivery_partners` table. Neither `app_users` nor `customers` has this column, so customer push notifications cannot be sent even when notification methods are eventually implemented.

---

# [Backend][Notification] getUserNotifications ignores all parameters and always returns an empty array

`database.service.ts:getUserNotifications(_userId, _unreadOnly?)` ignores both params and returns `[]` without making any DB query. The in-app notification inbox is permanently empty for every user.

---

# [Backend][Notification] markNotificationAsRead returns success without touching the database

`database.service.ts:markNotificationAsRead` returns `{ success: true }` without executing any DB write. Read state is never persisted — notifications always appear unread.

---

# [Backend][Notification] markAllNotificationsAsRead returns success without touching the database

`database.service.ts:markAllNotificationsAsRead` returns `{ success: true }` without any DB operation. The "mark all as read" action has no effect.

---

# [Backend][Notification] getNotificationPreferences returns hardcoded values — user preferences are never loaded

`database.service.ts:getNotificationPreferences` returns `{ email: true, sms: true, push: true }` unconditionally with no DB read. All users always appear to have all notification channels enabled regardless of what they have actually set.

---

# [Backend][Notification] updateNotificationPreferences echoes back the input without writing to the database

`database.service.ts:updateNotificationPreferences` returns the input object unchanged without executing any DB write. User notification preferences can never be persistently changed.

---

# [Backend][Delivery] The delivery simulation endpoint has no authentication — anyone can corrupt live order data

`delivery.controller.ts:startSimulation` has no auth middleware. Any actor who knows the URL can POST to `/api/delivery/simulate` with any real `orderId` and advance that order through every status automatically.

---

# [Backend][Delivery] Driver broadcast uses customer delivery address instead of store location for proximity

`delivery.controller.ts:broadcastToDrivers` and `shopkeeper.controller.ts:broadcastToNearbyDrivers` both use `order.delivery_latitude/longitude` (the drop-off address) as the search center. Drivers should be found near the pickup store — the current logic dispatches from the wrong location.

---

# [Backend][Delivery] Customer is not notified when item reallocation fails — the order silently ships with missing items

`shopkeeper.controller.ts:reallocateMissingItems` has a 4km radius constraint. When no replacement store is found, the function proceeds with a reduced item set with no notification to the customer and no visible change in order status.

---

# [Backend][Delivery] getOrderTrackingFull writes to the stores table on every tracking poll — hundreds of DB writes per active order

`database.service.ts:getOrderTrackingFull` calls `reverseGeocode` and writes the result back to `stores.address` as a side effect inside a GET handler. Since tracking is polled every 3–5 seconds, this produces continuous unintended data mutations on reads.

---

# [Backend][Delivery] shopkeeper.controller.ts broadcastToNearbyDrivers has no driver staleness filter

`delivery.controller.ts:broadcastToDrivers` correctly filters drivers with `updated_at >= tenMinsAgo`, but `shopkeeper.controller.ts:broadcastToNearbyDrivers` applies no staleness filter. Shopkeeper-triggered broadcasts reach drivers who have been offline for hours.

---

# [Customer Web][UI][Checkout] The checkout email field has the HTML required attribute — OTP-only users cannot place orders

`CheckoutPage.tsx` sets `required` on the email input. Customers who registered via OTP only have no email on their account and are blocked from submitting the checkout form by browser validation.

---

# [Customer Web][Auth] getCurrentUserFromSession uses the anon Supabase client which RLS blocks — always returns null

`frontend/src/services/authService.ts:getCurrentUserFromSession` queries `app_users` using the anon Supabase client. RLS prevents anon clients from reading any `app_users` rows, so this function always returns null. Every page refresh shows the user as logged out.

---

# [Customer Web][Security] The order tracking hook imports supabaseAdmin — service-role key is bundled into browser JavaScript

`frontend/src/hooks/useOrderTrackingRealtime.ts` imports `supabaseAdmin` for realtime subscriptions. The admin client carries the service-role key, which Vite bundles into the browser JS bundle where any user with DevTools can extract it.

---

# [Customer Web][Performance] Order tracking runs a realtime subscription and a 3-second setInterval simultaneously — redundant when realtime is active

Both `useOrderTrackingRealtime.ts` and `useOrderTracking.ts` maintain a Supabase realtime channel alongside a polling interval. When realtime is in `SUBSCRIBED` state, the interval is pure wasted network traffic. The interval should only run as a fallback.

---

# [Customer Web][Performance] In-flight tracking fetches have no AbortController — can update state on unmounted components

`useOrderTrackingRealtime.ts` calls `fetchOrderTrackingFull()` on realtime events with no cancellation mechanism. If the component unmounts while a fetch is pending, the resolved response will attempt to update state on an unmounted component.

---

# [Customer Web][UI] CartContext.addToCart mutates the cart item object directly — React may skip re-renders

`CartContext.tsx:addToCart` modifies the existing cart item object in place rather than creating a new reference. React's shallow comparison will not detect this mutation, potentially causing the cart UI to display stale item counts or prices.

---

# [Customer Web][Checkout] Address geocoding and order placement run in parallel — orders can be created with null delivery coordinates

`CheckoutPage.tsx` fires address save and geocoding concurrently with order creation. If geocoding is slow, `createOrder()` receives `delivery_latitude: null` and `delivery_longitude: null`, which breaks the store dispatch algorithm and makes the order undeliverable.

---

# [Backend][API] No global Express error handler registered — unhandled errors return HTML to JSON clients

`server.ts` has no four-argument `(err, req, res, next)` error middleware. Unhandled promise rejections and thrown errors produce Express's default 500 HTML response page, breaking any client expecting a JSON error body.

---

# [Backend][Security] express.json() has no body size limit — large payloads can exhaust server memory

`server.ts` registers `express.json()` without a `limit` option. A single malformed large-payload request can consume enough memory to crash the Node.js process, enabling a trivial DoS.

---

# [Backend][Code Quality] Three independent haversine distance implementations exist with no shared utility

`database.service.ts`, `delivery.controller.ts`, and `NAT_Near-Now_Rider-/app/(tabs)/home.tsx` each define their own `haversineKm` function. A bug fixed in one will not propagate to the others, and the implementations can silently diverge.

---

# [Backend][Scheduling] getAgentSchedule ignores all parameters and returns an empty array

`database.service.ts:getAgentSchedule(_agentId, _date?)` ignores both params and returns `[]` with no DB query. Any scheduling or routing feature that relies on this function is entirely broken.

---

# [Backend][Security] supabaseAdmin silently falls back to the anon client when SUPABASE_SERVICE_ROLE_KEY is missing

`backend/src/config/database.ts` falls back to the anon `supabase` client when `SUPABASE_SERVICE_ROLE_KEY` is not set. All "admin" DB operations that should bypass RLS will silently run under the anon key and be filtered by RLS, returning empty results or failing without any error.

---

# [Backend][Security] storeOwner.controller.ts getStores reads userId from a query parameter — any caller can impersonate any store owner

`storeOwner.controller.ts:getStores` reads `req.query.userId` with a comment explicitly marking it "TEMPORARY — NOT secure — just for development." The Bearer token is never validated. Any unauthenticated caller who knows a store owner's user ID gets full store data disclosure.

---

# [Backend][Security] storeOwner.controller.ts updateStoreStatus and updateProductQuantity have no ownership verification

Both handlers check for Bearer token presence but never validate that the authenticated store owner owns the target store or product. Any authenticated store owner can change another store's open/closed status or manipulate another store's inventory.

---

# [Backend][Security] Invoice generation endpoint has zero authentication — anyone can generate and download any customer invoice

`invoice.routes.ts` registers `POST /api/invoices/generate/:orderId` without any auth middleware. Any caller who knows an order ID can download the invoice, which contains the customer's full name, phone number, delivery address, and itemized order details.

---

# [Backend][Security] Invoice controller requireCustomer uses the customer UUID as a Bearer token — UUIDs are not secrets

`invoice.controller.ts:requireCustomer` authenticates by looking up `app_users` where `.eq('id', token)` — meaning the "token" IS the UUID primary key. UUIDs appear in URLs, logs, and API responses and are not secret. Any party who knows a customer's UUID can forge valid auth for invoice endpoints.

---

# [Backend][Security] Invoice controller requireShopkeeper looks up by id instead of session_token — all shopkeeper invoice requests fail

`invoice.controller.ts:requireShopkeeper` queries shopkeepers with `.eq('id', token)` while shopkeeper session tokens are stored in `session_token`, not `id`. The correct lookup is in `shopkeeper.controller.ts:requireShopkeeper` which uses `.eq('session_token', token)`. Any legitimate shopkeeper using a real session token is rejected.

---

# [Backend][Performance] products.controller.ts getProductById fetches all products then finds the target in JavaScript

`products.controller.ts` calls `databaseService.getProductsWithDetails()` which returns the entire product catalog, then uses `.find()` in JS to locate the single requested product. This is an O(N) full catalog transfer to serve a single product detail request.

---

# [Backend][Performance] getNearbyStores fetches all stores and filters by distance in JavaScript — no DB-level geospatial query

`database.service.ts:getNearbyStores` fetches every store from Supabase and applies haversine filtering in JavaScript. There is no bounding-box pre-filter or PostGIS query. This performs a full table scan and full data transfer for every "nearby stores" request and will not scale beyond a few hundred stores.

---

# [Backend][Performance] getProductsWithDetails fetches all products and filters by radius in JavaScript — same full-scan problem as getNearbyStores

`database.service.ts:getProductsWithDetails` fetches the entire product catalog before filtering by distance in JavaScript. The same scaling problem as `getNearbyStores` applies — full table scan and full data transfer for every search or browse request.

---

# [Admin Web][Security] NotificationsPage sends push notifications directly from the browser to Expo's API — no backend audit trail

`admin/src/pages/admin/NotificationsPage.tsx` POSTs directly from the browser to `https://exp.host/--/api/v2/push/send`. This bypasses the backend entirely — no authentication, no logging, no rate limiting, and no audit trail. Any compromised admin account can send arbitrary push notifications to all users with zero oversight.

---

# [Admin Web][Security][Data] StoresPage.tsx uses the anon Supabase client instead of the admin client

`admin/src/pages/admin/StoresPage.tsx` imports and uses the anon `supabase` client rather than `getAdminClient()`. All store queries run under the anon key and are subject to RLS, potentially returning incomplete data or silently failing for privileged operations. This is inconsistent with every other admin page.

---

# [Admin Web][Security] Admin dashboard has no per-endpoint permission enforcement — role checks are UI-only

`adminAuthService.ts` exposes `hasPermission()` but it is never applied as middleware on any admin API route. A `viewer`-role admin can call any mutation endpoint directly, bypassing the UI role restrictions entirely.

---

# [Admin Web][Security] The admin creation endpoint has no server-side role check — any authenticated admin can create new admins

The backend route for creating admin accounts performs no server-side verification that the requester is a `super_admin`. Only the frontend hides the button for lower-role users, making the restriction trivially bypassable with a direct API call.

---

# [Backend][Security] CORS allows all origins when ALLOWED_ORIGINS environment variable is not set

`server.ts` CORS `origin` callback returns `true` (allow all) when `ALLOWED_ORIGINS` is missing. In a misconfigured production deployment this permits cross-origin requests from any domain, enabling CSRF and data exfiltration attacks.

---

# [Admin Web][Bug] adminService.ts getCustomers returns all app_users including shopkeepers and delivery partners

`admin/src/services/adminService.ts:getCustomers` queries `app_users` with no role filter. All user records — shopkeepers, delivery partners, and customers — appear in the admin Customers list, inflating the customer count and showing incorrect data.

---

# [Admin Web][Bug] adminService.ts status mapping collapses fine-grained order statuses into only 5 frontend states

`admin/src/services/adminService.ts:mapDbStatusToFrontend` maps DB statuses like `preparing_order`, `picking_up`, and `out_for_delivery` into only 5 coarse frontend states. The admin UI cannot distinguish between preparation and pickup phases, making order monitoring inaccurate.

---

# [Admin Web][Bug] adminService.ts updateOrderStatus maps 'confirmed' to 'store_accepted' — skips the preparing_order stage

When an admin selects "confirmed," the service writes `store_accepted` to the DB instead of going through `preparing_order`. This skips a defined workflow stage and causes inconsistent order state between admin, shopkeeper, and customer views.

---

# [Admin Web][Performance] adminService.ts getOrders performs an N+1 fetch pattern for customer data

`admin/src/services/adminService.ts:getOrders` fetches all orders in one query then fetches customer data in a separate query. This is an N+1 anti-pattern that adds a full round-trip minimum and scales poorly as the order count grows.

---

# [Admin Web][Auth] Admin session is stored in sessionStorage only — admins are logged out on every tab close

`adminAuthService.ts` persists the session to `sessionStorage`, which is cleared when the browser tab is closed. Admins are logged out every time they close and reopen the tab, even well within the 12-hour session window stored in the database. There is no option for persistent login.

---

# [Admin Web][Auth] Admin session is not deleted on logout — tokens remain valid for up to 12 hours after logout

`adminAuthService.ts` logout path does not delete the `admin_sessions` row. A logged-out session token continues to authenticate API requests until the natural 12-hour TTL expires.

---

# [Admin Web][Auth] Failed login audit logging can throw and mask the authentication failure response

`authenticateAdmin` calls `logFailedLogin` and `logSecurityEvent` sequentially without isolating their errors. If the database is unavailable during logging, the function throws an unhandled error instead of returning null, causing the login endpoint to 500 instead of returning a clean auth failure.

---

# [Admin Web][Missing] SettingsPage settings are not persisted — all configuration is lost on page reload

The admin `SettingsPage.tsx` renders UI for general, notification, and payment settings but changes are never written to the database or backend API. Every reload resets all settings to defaults.

---

# [Backend][Database] PaymentStatus TypeScript type includes 'completed' but all database writes use 'paid'

`database.types.ts:PaymentStatus` defines `'completed'` as a valid value while every actual payment status write uses `'paid'`. TypeScript will accept code that writes `'completed'` without complaint, producing records that downstream queries filtering for `'paid'` will miss.

---

# [Backend][Database] OrderStatus type is missing 'picking_up' — added in migration but types were not updated

Migration `20260505000000_add_picking_up_order_status.sql` added `picking_up` as a valid status but `database.types.ts:OrderStatus` was not updated. Exhaustive switch statements on order status will silently miss this value.

---

# [Customer Web][Performance] Driver location is polled every 2 seconds unconditionally regardless of realtime subscription state

A `setInterval` firing every 2 seconds fetches driver location independently of the Supabase realtime subscription, running even when the realtime channel is active and delivering updates. Polling and realtime events race each other under normal conditions.

---

# [Customer Web][UI] No empty-cart redirect at checkout — users can navigate directly to /checkout with zero items

`CheckoutPage.tsx` does not check `items.length === 0` on mount and redirect away. A user who navigates directly to the checkout URL with an empty cart sees the full checkout form and can attempt to submit an empty order.

---

# [Android][Security] Service-role Supabase key is bundled into the Customer App APK and IPA via the EXPO_PUBLIC_ prefix

`nearandnowcustomerapp/lib/supabase.ts:26` reads `process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Expo bakes every `EXPO_PUBLIC_` variable into the JavaScript bundle inside the APK and IPA. The service-role key bypasses all RLS — anyone who decompiles the app with Jadx or apktool has unrestricted read/write access to the entire database.

---

# [Android][Customer App][Auth] getCurrentUserFromSession uses supabaseAdmin — session restore breaks when the service-role key is removed

`nearandnowcustomerapp/lib/authService.ts:getCurrentUserFromSession` calls `supabaseAdmin.from('app_users').select(...)` which only works because the service-role key is currently bundled. Removing that key will silently break session restore and log out every customer on every cold start.

---

# [Android][Delivery Partner App][Auth] Rider authService.ts verifyOTP omits role field — new riders get customer accounts

`NAT_Near-Now_Rider-/lib/authService.ts:verifyOTP` sends `{ phone, otp, name }` with no `role` field, causing the backend to default to `'customer'` role. The dedicated `otp.tsx:107` sends the correct `role: 'delivery_partner'`, but the shared service used in other flows will register riders as customers.

---

# [Android][Shopkeeper App][UI] Multi-store shopkeepers can only manage their first store — stores[0] is hardcoded

`near-now-store_owner/app/(tabs)/home.tsx:92` sets `const selectedStore = stores[0]` unconditionally. A shopkeeper with multiple locations has no way to switch context — all accept/reject and inventory actions apply only to store index 0.

---

# [Android][Shopkeeper App][Order] Shopkeeper order cache does not invalidate on incoming realtime events — stale orders shown for up to 30 seconds

`near-now-store_owner/services/orderService.ts:fetchOrders` uses a module-level 30-second cache. Invalidation only happens on `acceptOrder` or `rejectOrder`, not on incoming realtime or push events. A new order appears in the popup but the main list may remain stale until the cache expires.

---

# [Android][Shopkeeper App][Order] Two separate order-fetching paths exist and are never reconciled

`near-now-store_owner/hooks/useOrders.ts` fetches from `/shopkeeper/orders` while `near-now-store_owner/services/orderService.ts` fetches from `/store-owner/stores/:id/orders` — a completely different endpoint. These two data sources are never synchronized, creating inconsistent order state across UI components.

---

# [Android][Shopkeeper App][Order] The OrderService class references four endpoints that do not exist in the backend — dead code

`near-now-store_owner/services/orderService.ts` calls `/store-owner/stores/${storeId}/orders`, `/store-owner/orders/${orderId}/accept`, `/store-owner/orders/${orderId}/reject`, and `/store-owner/orders/${orderId}/verify-qr`. None of these routes are registered in the backend. The class is not used by the working `useOrders.ts` hook and is entirely dead code.

---

# [Android][Shopkeeper App][Order] fetchOrderDetails is a stub that always returns null

`near-now-store_owner/hooks/useOrders.ts:fetchOrderDetails` is defined as `async (_id: string) => null` — it never fetches from any endpoint. Any component that calls this function to get order detail data receives null unconditionally.

---

# [Android][Shopkeeper App][Order] verifyQR always returns failure — shopkeeper QR verification is non-functional

`near-now-store_owner/hooks/useOrders.ts:verifyQR` returns `{ success: false, error: 'Not supported' }` unconditionally. The pickup code QR verification flow from the shopkeeper side is completely broken.

---

# [Android][Shopkeeper App][Bug] setSelectedOrder is a no-op — selecting an order has no effect

`near-now-store_owner/hooks/useOrders.ts:setSelectedOrder` is defined as `() => {}`. Any UI flow that relies on selecting an order to drive a detail view or action panel is broken.

---

# [Android][Shopkeeper App][Bug] Home screen activeOrderCount is hardcoded to 0

`near-now-store_owner/app/(tabs)/home.tsx` sets `const activeOrderCount = 0` unconditionally. The home screen always displays 0 active orders regardless of actual pending order state.

---

# [Android][Shopkeeper App][Missing] Payments screen is a static placeholder — no payout data or backend integration exists

`near-now-store_owner/app/(tabs)/payments.tsx` unconditionally renders "No payouts yet" with no API calls. No backend payout endpoint, earnings calculation, or settlement logic exists anywhere in the platform.

---

# [Android][Shopkeeper App][Notification] Incoming order popup relies solely on polling — no push for new orders in background

`useOrders.ts:useSmartPoll` checks for new orders every 10–30 seconds with no FCM or Expo push channel. If the shopkeeper's screen is off or the app is backgrounded, a new order may not be visible for up to 30 seconds while the 60-second acceptance timer counts down.

---

# [Android][Delivery Partner App][Order] Rider delivery screen polls pickup sequence every 10 seconds with no realtime subscription

`delivery/[orderId].tsx:300` uses only a `setInterval` for active delivery updates. Unlike the home screen which has a Supabase realtime subscription, the delivery screen has no realtime channel, so pickup code arrival requires waiting up to 10 seconds.

---

# [Android][Customer App][Notification] Customer app has no push notification registration — no backend storage for customer push tokens

`nearandnowcustomerapp/hooks/usePushNotifications.ts` handles Expo token registration but neither `app_users` nor `customers` has an `expo_push_token` column in the DB schema. Even if a token were captured, there is nowhere to store it and the backend's `sendPushNotification` does not query customer tables.

---

# [Android][Customer App][Payment] Payment reconcile loop has no circuit breaker for cancelled or failed orders

`usePaymentFlow.ts:reconcile` polls `getOrderPaymentStatus` every 1.5 seconds for up to 10 seconds even when the order is already cancelled. It runs up to 6 redundant DB polls before resolving instead of short-circuiting the moment the status is confirmed non-pending.

---

# [Android][Customer App][Payment] Saved payment methods skeleton renders permanently when the feature flag is off

`razorpayService.ts:SAVED_METHODS_ENABLED` defaults to `false` when its env var is unset. The `settings/payments.tsx` screen still renders a "Preferred Payment" skeleton section that never populates, leaving a permanently empty UI block with no explanation to the user.

---

# [Android][Customer App][Bug] Checkout extra fields (GSTIN, tip, receiver details) are concatenated into a notes string — backend never parses them

`nearandnowcustomerapp/app/support/checkout.tsx` collects `gstin`, `invoiceName`, `tipAmount`, `orderFor`, `receiverName`, `receiverPhone`, and `receiverAddress` in the UI, then concatenates them into a single freeform `notes` string before sending to the backend. The backend never parses this string — GST invoicing, tip handling, and third-party delivery are all structurally broken.

---

# [Android][Customer App][Missing] Wallet screen is a full UI implementation backed by nothing — "Add Money" shows a "coming soon" alert

`nearandnowcustomerapp/app/wallet.tsx` renders balance display, transaction history, and an "Add Money" button which fires `Alert.alert("Payment gateway integration coming soon.")`. No backend wallet, balance API, or payment integration exists anywhere on the platform.

---

# [Android][Delivery Partner App][Missing] Rider earnings are estimated at 15% of order total — no real payout system exists

`NAT_Near-Now_Rider-/app/(tabs)/earnings.tsx` calculates `todayEarnings` as `Number(order.total_amount) * 0.15` for each order. There is no payout table, no backend earnings endpoint, and no agreed payout rate. Riders see entirely fabricated estimates.

---

# [Android][Delivery Partner App][Performance] Rider app polls for active orders every 6 seconds even when the rider is offline

`NAT_Near-Now_Rider-/app/(tabs)/home.tsx` fires an order polling interval every 6 seconds regardless of the rider's online/offline status, causing unnecessary network traffic and battery drain when the rider is not on duty.

---

# [Android][Delivery Partner App][UI] Rider app pending_verification screen shows a hardcoded admin phone number

`NAT_Near-Now_Rider-/app/(tabs)/home.tsx:549` calls `Linking.openURL("tel:+919062692914")` directly in source. This phone number must be updated with a code change and app store release whenever the admin contact changes.

---

# [Android][Delivery Partner App][UI] OTP auto-submit can fire before all 6 digits are confirmed on slow Android keyboards

`otp.tsx:54–59` calls `handleVerify(otp)` as soon as `isComplete` is true. Some Android IME implementations fire the 6th character event more than once before settling, triggering a premature API call with an incomplete OTP.

---

# [Android][Security] Session tokens are stored in plain AsyncStorage across all three mobile apps — readable on rooted devices

All three apps store session tokens and user objects in AsyncStorage without encryption. On a rooted Android device, AsyncStorage is world-readable by any app with root access, giving an attacker full API access using a stolen token.

---

# [Android][Delivery Partner App][Security] Rider session tokens have no expiry — compromised tokens grant permanent API access

`session.ts` stores `{ token, user }` with no `expiresAt` field and the backend `delivery_partners.session_token` column has no TTL enforcement. A stolen device or extracted token can authenticate all rider endpoints indefinitely.

---

# [Cross-App][Missing] No payout or earnings system exists anywhere on the platform

The rider app estimates earnings at 15% of order total (hardcoded). The shopkeeper app shows "No payouts yet" unconditionally. No backend payout endpoint, no DB payout table, no financial settlement logic, and no agreed payout rate exist. Neither riders nor store owners have any accurate financial data — the platform cannot operate commercially without this.

---

# [Cross-App][Bug] Auth token strategy is inconsistent across apps and controllers — some legitimate callers are always rejected

Shopkeeper and rider apps use a randomly generated `session_token` stored in the DB. Customer app uses the raw `user_id` UUID. The main shopkeeper controller correctly validates via `session_token`, but `invoice.controller.ts` validates shopkeepers via the `id` field — meaning every legitimate shopkeeper invoice request fails. This inconsistency makes cross-feature auth unpredictable.

---

# [Cross-App][Bug] Pickup code generation timing is inconsistent — codes may exist before shopkeeper acceptance

`orders.controller.ts` comments state pickup codes are generated at shopkeeper acceptance time. `shopkeeper.controller.ts:reallocateMissingItems` generates the pickup code at allocation insert time, before acceptance. The two code paths behave differently, and pickup codes may be created prematurely depending on which path triggered the allocation.

---

# [Shopkeeper App][Profile] Document upload and document number field are not gated by edit mode — documents can be changed without clicking Edit

`near-now-store_owner/app/profile.tsx` line 415: `onPress={pickDocImage}` has no `editing` check, so the document image picker can be opened at any time. Line 403: the `Field` component for the verification number is rendered with `editing={true}` hardcoded, making it permanently editable regardless of whether the user clicked the Edit button. By contrast, store image and owner image are correctly gated (`onPress={editing ? pickStoreImage : undefined}`). This is inconsistent and allows document tampering outside of edit mode. The rider app (`NAT_Near-Now_Rider-/app/(tabs)/profile.tsx` lines 374–386) displays verification fields as read-only text components with no edit capability at all.

---

# [Shopkeeper App][Missing] No admin approval gate on the online/offline toggle — stores can go live immediately after registration

`near-now-store_owner/app/(tabs)/home.tsx` lines 260–319: the online/offline toggle calls `PATCH /api/store-owner/stores/{id}/online` directly with no check on admin approval status. A newly registered store can toggle itself online with zero admin review. The delivery partner app (`NAT_Near-Now_Rider-/app/(tabs)/home.tsx` line 365) gates the equivalent toggle behind `if (toggling || driverStatus !== "active") return;` and polls for status changes every 30 seconds (`lines 160–189`). The shopkeeper app needs the same pattern: fetch an approval status field on the store record, prevent the toggle when status is not `active`/`approved`, and poll periodically to detect when admin grants approval.

---

# [Shopkeeper App][Missing] No approval-status polling — shopkeeper has no way to know when admin approves their store

The delivery partner app polls `GET /delivery-partner/profile` every 30 seconds while in `pending_verification` state and shows an in-app banner when status changes to `active` (`NAT_Near-Now_Rider-/app/(tabs)/home.tsx` lines 160–189`). The shopkeeper app has no equivalent polling loop and no UI feedback about approval state. After registering, the shopkeeper has no indication of their approval status or when they will be allowed to go online.

---

# [Shopkeeper App][Missing] Store images support only a single image — multi-image upload and carousel/scroll are not implemented

`near-now-store_owner/app/profile.tsx` stores the store image as `storeImageUri: string | null` (line 53) — a single value, not an array. There is no gallery picker, no carousel, and no scrollable image row for the store's photos. Likewise the document upload supports only one document image at a time (`docImageUri: string | null`, line 60). Only the owner profile image is expected to be a single image and is correctly implemented that way. Store images and supporting documents likely need multi-image support with a horizontal scroll/carousel view; this is currently missing entirely.

---

# [Cross-App][Missing] No admin notification when Edit button is clicked — 24-hour change-approval workflow not implemented

Neither the shopkeeper app (`near-now-store_owner/app/profile.tsx`) nor the delivery partner app (`NAT_Near-Now_Rider-/app/(tabs)/profile.tsx`) sends any flag or notification to the admin when a user clicks the Edit button. The intended flow should be: (1) user clicks Edit → backend receives a "change requested" event, (2) admin receives a notification with a 24-hour SLA to approve or reject the change, (3) the edit is only committed once the admin approves. Currently, changes are saved directly to the database (`PATCH /api/store-owner/stores/{id}` and `PATCH /delivery-partner/profile`) with no admin awareness, no approval gate, and no audit trail. This needs a `profile_change_requests` table, a backend endpoint to create the request, admin panel UI to review/approve/reject requests, and a push notification to the admin.

---

# [Delivery Partner App][Profile] Rating is hardcoded at 4.8 — not sourced from user ratings

`NAT_Near-Now_Rider-/app/(tabs)/profile.tsx:353` renders `<Text style={styles.statValue}>4.8</Text>` unconditionally. The value is a hardcoded string literal, not fetched from any ratings table or API. Every delivery partner always shows exactly 4.8 stars regardless of their actual performance. There is no ratings table, no endpoint, and no rating collection flow anywhere on the platform. This needs a backend `delivery_partner_ratings` table, a `GET /delivery-partner/stats` endpoint that aggregates the average, and the profile screen must use that value.

---

# [Delivery Partner App][Missing] Vehicle type selector and vehicle image are not implemented in the profile

The backend `delivery_partners` table has a `vehicle_number` column (collected at signup via `NAT_Near-Now_Rider-/app/signup.tsx:38`) but no `vehicle_type` column and no `vehicle_image_url` column. The profile screen (`NAT_Near-Now_Rider-/app/(tabs)/profile.tsx`) has no vehicle type picker (bike / scooter / cycle), no vehicle photo upload, and no display of the vehicle number that was collected at signup. The intended design is one vehicle image per partner. This is entirely missing from both the profile UI and the backend schema.

---

# [Delivery Partner App][Missing] Document image upload is absent from the profile — only text fields stored

`NAT_Near-Now_Rider-/app/(tabs)/profile.tsx` lines 369–403 render `verification_document` and `verification_number` as read-only `Text` components. There is no document image upload, no document image preview, and no backend endpoint or Supabase Storage bucket for rider document images. The shopkeeper app correctly uploads document images to the `store-documents` Supabase Storage bucket, but the equivalent flow for delivery partners does not exist. Riders cannot submit document images for verification through the app.

---

# [Backend][Database] Supabase RPC `alculate_customer_order_total` has a typo — function is unreachable under its correct name

The live Supabase database (confirmed via OpenAPI introspection) has the function registered as `alculate_customer_order_total` — missing the leading `c`. Any backend or client code that calls `calculate_customer_order_total` receives a PostgREST "function not found" error. The function is effectively dead under its intended name. Fix: `ALTER FUNCTION alculate_customer_order_total RENAME TO calculate_customer_order_total;` in the Supabase SQL editor.

---

# [Backend][Database] `products` table has four spurious columns from a bad migration — schema pollution

The `products` table (which exists only to join `stores` to `master_products`) contains `name`, `phone`, `product_name`, and `deleted_at` columns that do not belong there. A `phone` column on a product record is structurally incorrect. `name` and `product_name` duplicate `master_products.name`. `deleted_at` has no application code reading it. These inflate the PostgREST OpenAPI schema and appear in generated TypeScript types, causing confusion. Migration needed to drop these four columns.

---

# [Backend][Database] Two admin tables (`admins` and `admin_users`) with cross-wired foreign keys — admin auth is structurally split

The live database has both `admins` (3 rows, used by the current admin panel auth) and `admin_users` (separate table). Foreign keys are cross-wired: `admin_sessions` and `admin_activity_logs` reference `admin_users.id`, while `admin_refresh_tokens` and `audit_logs` reference `admins.id`. The two tables are not linked to each other. Cross-joining them (e.g. session → admin profile) silently returns empty results. The system needs one canonical admin table with all FK references pointing to it.

---

# [Backend][Database] `master_products_old` backup table is still publicly exposed via the REST API

`master_products_old` (a pre-migration backup) remains in the `public` schema and is therefore served by PostgREST. It has no primary key constraint and no RLS policies, so any caller with the anon key can read its full contents. The table has no production purpose. It should be dropped or moved to a non-public schema.

---

# [Backend][Database] `customers` profile rows exist for only 5 of 18 `app_users` — profile creation not firing for most registered users

Live DB shows 18 rows in `app_users` but only 5 rows in `customers`. Thirteen registered customers have no profile record. Any query that JOINs `app_users` to `customers` returns nothing for 72% of users — address resolution, delivery instructions, and profile display silently fail for those accounts. The customer profile insert in the `auth.controller.ts` OTP-verify path is either absent or swallowed on error for new registrations.

---

# [Backend][Database] 15 `customer_orders` have no `customer_payments` row — payment records missing for 21% of orders

Live DB has 70 rows in `customer_orders` and only 55 in `customer_payments`. The 15 gap orders either went through COD (which may intentionally skip a payment row) or the payment record insert failed silently. COD orders should still generate a `customer_payments` row with `status: 'pending'` and `payment_method: 'cod'` for accounting. Any online-payment order missing a row cannot be refunded or reconciled.

---

# [Backend][Order] `order_store_allocations` rows exist for only 26 of 70 orders — shopkeeper dispatch broken for 63% of orders

Live DB shows 26 rows in `order_store_allocations` against 70 `customer_orders`. Without an allocation row, shopkeepers never receive the order, no pickup code is generated, and driver dispatch has no store location to reference. The 44 unallocated orders are invisible to the entire fulfillment chain. Root cause is likely that the allocation insert in `orders.controller.ts:placeCheckout` fails silently — possibly caused by the `alculate_customer_order_total` RPC typo — and the error is swallowed without rolling back the order.

---

# [Backend][Invoice] `invoice_documents` has 87 rows for only 29 invoices — duplicate PDFs generated on every request

Live DB shows 87 `invoice_documents` rows for 29 `invoices` (~3 PDFs per invoice). `POST /api/invoices/generate/:orderId` has no idempotency guard — each call inserts a new document row rather than returning the existing PDF. Since the endpoint also has no auth (see SECURITY-007), retries and page reloads each create another record. Add a check-before-insert: if a document for this `invoice_id` + `document_type` already exists, return it.

---

# [Backend][Delivery] `tracking_events` table is permanently empty — the POST endpoint exists but nothing calls it

Live DB shows 0 rows in `tracking_events` despite the table being created in migration `20260427000001_tracking_enhancements.sql`. The backend has `POST /api/tracking/orders/:orderId/updates` for writing to this table, but no part of the order lifecycle (placement, shopkeeper acceptance, driver assignment, pickup, delivery) ever calls it. All customer-facing tracking state comes from `order_status_history` only. The `tracking_events` table and its write endpoint are entirely dead code. Each status transition should insert a corresponding tracking event row.

---

# [Customer Web][Bug] DriverApp.tsx and ShopkeeperApp.tsx call wrong auth endpoint paths — both internal test flows 404

`frontend/src/pages/DriverApp.tsx` and `frontend/src/pages/ShopkeeperApp.tsx` make auth requests to `POST /api/auth/otp` and `POST /api/auth/verify`. Neither path exists — the correct endpoints are `POST /api/auth/send-otp` and `POST /api/auth/verify-otp`. Both internal test interfaces fail at the login step with a 404 and cannot be used for any manual QA of the delivery or shopkeeper flow from the web.

---

# [Shopkeeper App][Bug] Inventory screen calls `GET /store-owner/stores/:storeId/products` — this route does not exist in the backend

`near-now-store_owner/services/storeService.ts` and `near-now-store_owner/app/(tabs)/inventory.tsx` request `GET /store-owner/stores/:storeId/products` to load the store's product list. This route is not registered in `storeOwner.routes.ts` or any other route file. The backend only has `PATCH /store-owner/products/:productId/quantity` and `DELETE /store-owner/products/:productId`. The inventory screen 404s on every load, making inventory management completely non-functional.

---

# [Shopkeeper App][Bug] Invoice screen calls `GET /api/store-owner/orders/:id` — this route does not exist in the backend

The shopkeeper invoice screen fetches order details from `GET /api/store-owner/orders/:id`. No such route is registered in `storeOwner.routes.ts`. The `/store-owner` router has no GET order endpoints at all. The invoice screen will always receive a 404, making invoice viewing on the shopkeeper side non-functional. The correct invoice download endpoint is `GET /api/invoices/order/:orderId/store`, which exists but is a separate flow.

---

# [Shopkeeper App][Bug] App calls `/api/store-owner/*` but backend router is mounted at `/store-owner/*` — path prefix mismatch causes 404 in production

Multiple screens in the shopkeeper app construct URLs with an `/api/store-owner/` prefix (e.g. `store-owner-signup.tsx`, `inventory.tsx`). The backend mounts the store owner router at `/store-owner` with no `/api` prefix — consistent with `/shopkeeper` and `/delivery-partner` routers. In development a proxy may rewrite these, but in production all `/api/store-owner/*` requests return 404. All call-sites in the shopkeeper app need to remove the `/api` prefix from `store-owner` URLs.

---

# [Delivery Partner App][Bug] Pickup code verification sends `:storeId` in the URL but the backend expects `:allocationId`

`NAT_Near-Now_Rider-/app/delivery/[orderId].tsx` constructs the verify-code URL as `POST /delivery-partner/orders/:orderId/stores/:storeId/verify-code`, passing the store's `store_id`. The backend route is `POST /delivery-partner/orders/:orderId/stores/:allocationId/verify-code` and the handler looks up the allocation by its primary key (`order_store_allocations.id`), not by `store_id`. Passing a `store_id` will always return "allocation not found" — pickup code verification never succeeds for any delivery.

---

# [Delivery Partner App][Bug] Signup.tsx sends PATCH to `/api/delivery/partners/:partnerId` but the backend registers this as PUT — new rider profile saves are silently dropped

`NAT_Near-Now_Rider-/app/signup.tsx` submits new rider profile data (vehicle number, address, verification document) using HTTP PATCH. The backend `delivery.routes.ts` registers the update endpoint as `PUT /api/delivery/partners/:partnerId`. Express does not treat PUT and PATCH interchangeably — PATCH requests to this path return 404. New rider profile data submitted after OTP verification is silently lost.

---

# [Shopkeeper App][Bug] `hooks/useOrders.ts` calls `/api/shopkeeper/*` — wrong prefix, ALL order accept/reject operations are broken

`near-now-store_owner/hooks/useOrders.ts` constructs URLs as `${API_BASE}/api/shopkeeper/orders` (line 117), `${API_BASE}/api/shopkeeper/allocations/:id/accept` (line 160), and `${API_BASE}/api/shopkeeper/allocations/:id/reject` (line 71). The backend mounts the shopkeeper router at `/shopkeeper` with no `/api/` prefix. All three return 404 in production. `useOrders.ts` is the primary hook driving order management — this breaks the core function of the shopkeeper app. `app/(tabs)/previous-orders.tsx` independently duplicates the same wrong prefix on lines 273, 297, 387, and 420. This is a separate finding from the `/api/store-owner/` prefix bug in MOBILE-ORDER-011 — this covers the `/shopkeeper` router's prefix being wrong in both the hook layer and the screen layer.

---

# [Admin Web][Bug] Admin panel queries `newsletter_subscriptions` table which does not exist in Supabase — crash on affected pages

`admin/src/services/adminService.ts` calls `supabase.from('newsletter_subscriptions')`. This table is not present in the Supabase public schema — confirmed by live DB inspection (not in PostgREST OpenAPI spec or any migration). Any admin page that triggers this query receives a PostgREST error and crashes or renders empty without surfacing the root cause. Either create the table (if newsletters are a planned feature) or remove the call.

---

# [Backend][Storage] Two product image buckets exist — `product-image` is empty and unused, `product-images` is active

Supabase Storage has both `product-image` (0 files, created Jan 2026) and `product-images` (1 file, created Jan 2026 13 minutes later). The second was created to fix a naming mistake but the first was never deleted. Any upload code targeting `product-image` stores files in a dead bucket. With 44,562 master products and only 1 file in Storage, virtually all product images rely on external URLs in `master_products.image_url`. Delete the empty `product-image` bucket and confirm all upload code targets `product-images`.

---

# [Customer App][Notification] `usePushNotifications.dev.ts` calls `POST /api/push-token` but this route does not exist in the backend

`nearandnowcustomerapp/hooks/usePushNotifications.dev.ts:110` calls `apiFetch('/api/push-token', { method: 'POST', body: { token } })`. No such endpoint is registered in `server.ts` or any route file. The Expo push token is captured from the device but the 404 response means it is never persisted. This is distinct from (and compounds) the missing `expo_push_token` column on `app_users` and the `sendPushNotification` function not querying customer tables — even if those were fixed, push tokens would still be lost because the API route itself is missing.

---

# [Backend][Email] Resend email provider not configured — `sendEmail` is a `console.log` stub, all transactional emails are silently dropped

`backend/src/services/notification.service.ts:53-56` — `sendEmail(to, subject, body)` contains a `// TODO: SendGrid / AWS SES` comment and only calls `console.log`. No email SDK (Resend, `@sendgrid/mail`, SES, nodemailer) is installed in `backend/package.json`. No email API key is present in the `.env` file. Every call to `sendEmail` across the order lifecycle returns `{ success: true }` while doing nothing. Order confirmation emails, refund notifications, and invoice delivery emails are permanently lost. Fix: install Resend SDK, add `RESEND_API_KEY` to env, replace the stub with `new Resend(key).emails.send(...)`, and wire the empty `sendOrderPlacedNotification` to call `sendEmail` with an order template. (See RESEND-001 in qa_audit_old.md)

---

# [Shopkeeper App][Notification] Push token registration calls non-existent `POST /store-owner/notifications/register` — shopkeeper push is structurally impossible

`near-now-store_owner/lib/notifications.ts:155-172` — `registerTokenWithBackend(token)` calls `apiClient.post('/store-owner/notifications/register', ...)`. The backend mounts `storeOwnerRoutes` at `/store-owner` with only six routes registered; `notifications/register` is not one of them. The 404 is swallowed by the catch block. Shopkeeper Expo push tokens are never persisted — there is no table column for them and no write path. The delivery partner push works end-to-end (`PUT /delivery-partner/push-token` → `delivery_partners.expo_push_token`), but shopkeepers have no equivalent. New-order push alerts can never reach a shopkeeper device. Fix: add a push-token column for shopkeepers, register the endpoint in `storeOwner.routes.ts` behind shopkeeper auth middleware, and update the broadcast logic to query it. (See FCM-001 in qa_audit_old.md)

---

# [Customer Web][Checkout] `CheckoutPage.tsx` hardcodes ₹30 delivery fee — dynamic distance-based calculator is completely bypassed

`frontend/src/context/CartContext.tsx:31-32` exports `getDeliveryFeeForSubtotal = (_cartSubtotal) => 30` — ignores all arguments and always returns ₹30. `frontend/src/pages/CheckoutPage.tsx` imports and calls this function on lines 426, 538, 553, 563, and 592 for every payment path (Razorpay, COD, split). A working dynamic calculator already exists in `frontend/src/utils/deliveryFees.ts` — `calculateFeeBreakdown(distanceKm, cartSubtotal)` applies distance tiers, minimum fees, and a free-delivery threshold. The checkout ignores it. Customers 1 km away pay the same as customers 15 km away. Fix: replace `getDeliveryFeeForSubtotal(cartTotal)` calls with `getCompleteFeeBreakdown(distanceKm, cartTotal).deliveryFee` using `distanceKm` from `LocationContext`. (See WEB-009 in qa_audit_old.md)
