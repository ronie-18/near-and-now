# Performance, reliability and error-message changes — 2026-09-26

Companion to `AWS_MIGRATION_PLAN.md`. This pass was re-done against `origin/main` at `89bd719`
(the first attempt, on a July checkout, lives on branch `perf/catalogue-errors-aws-plan` for reference).
It records what changed, why each change matters for the "delayed UI / slow to update / buggy /
unreadable errors" complaints, and the audit findings that are **not** fixed yet.

Deliberately **not** done: route-level lazy loading. `App.tsx` records a 2026-08-26 product decision
that no page is lazy-loaded; that decision is respected here.

---

## 1. Root causes found and fixed

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Home, category, search and product pages took seconds | `fetchProductRows` **downloaded the whole nearby catalogue** (500-row pages, one after another, `master_products(*)`) and `getProductsByCategory` / `searchProducts` filtered it in the browser. The header search box did this on every debounced keystroke, and the product page did it to find one product. | Category / name / id filters now run in Postgres (`master_products!inner` + `.eq` / `.or(ilike)`), only needed columns are selected, store chunks and pages load in parallel, and results are cached in memory for 60 s with in-flight de-duplication (`frontend/src/utils/queryCache.ts`). New `getProductById()` for the product page. The approved-store snapshot and nearby-store RPC are cached too. |
| Order tracking page showed "Order not found" and never updated | `trackingApi.ts` sent **no Authorization header** to routes behind `requireCustomer`; every call was a 401 swallowed as `null`. | Auth headers added; failures are recorded with endpoint, server `where` and request id and shown on the "Couldn't Load Order" card. |
| Category and address pages refetched in a loop when the API failed; any toast re-rendered the whole app | `showNotification` (in several effects' deps) got a new identity on every render; Auth and Notification context values were rebuilt every render | `useCallback` / `useMemo` in `AuthContext` and `NotificationContext`. |
| Orders page showed raw `pending_at_store` badges in grey | Label map only knew the legacy five statuses | Full pipeline-status → label + colour map. |
| Map re-requested Google Directions and refit the viewport on every GPS tick | Route key used 5-decimal (≈1 m) coordinates | Route recompute at ≈11 m, viewport refit at ≈100 m. |
| Fonts flashed and blocked rendering on eight pages; unused Font Awesome CSS on every page | `@import url(fonts.googleapis…)` inside inline `<style>`; CDN stylesheet in `index.html` | One non-blocking font stylesheet + preconnects in `index.html`; per-page imports removed; debug script removed. |
| Broken images could loop forever | `onError` reset `src` to the same external placeholder host | Inline SVG placeholder applied once (`utils/placeholderImage.ts`). |
| "Newest" sort on category pages was random | Default branch shuffled on every render | Sorted by `created_at` descending. |
| Thank-you page redirected after 3 s (comment said 7) and treated a missing rider id as "rider assigned" | `!== null` on an `undefined` field; timer never cleared | `!= null`, 7 s, cancel timer cleared. |
| Driver app never recognised a multi-store pickup as the active order | Filter checked `en_route_delivery`, which the backend never emits; it emits `picking_up` | `picking_up` added. |
| Logging out kept the previous user's delivery location | Header re-seeded `LocationContext` from `currentLocation`, which logout never cleared | Cleared on logout. |
| Stale riders never went offline | `void supabaseAdmin.rpc(...)` — Supabase queries are lazy and only run when awaited | `.then()`'d. |
| Unknown coupon codes returned a PostgREST error | `.single()` throws on zero rows | `.maybeSingle()` + a clear message. |
| OTP rate limits could be bypassed by re-formatting the phone number | Limiter keyed on the raw string | Keyed on the last 10 digits. |
| Login responses echoed secrets | `app_users.*` minus only `password_hash` | `session_token` and `email_verification_code` stripped too. |

## 2. Error messages you can locate

**Backend** (`backend/src/utils/httpError.ts`, wired into all 27 controllers — 251 `res.status(500)` sites → 0):

```json
{ "success": false, "error": "Could not load the categories", "where": "ProductsController.getCategories",
  "requestId": "3f0c…", "code": "42501", "detail": "permission denied for table categories" }
```

- `where` = controller + method (or middleware). `requestId` = the id on the server log line and the `X-Request-Id` response header.
- `detail` = upstream reason; always for 4xx, only outside production for 5xx.
- Status inferred from the upstream error (PostgREST `PGRST116` → 404, `23505` → 409, Twilio/Razorpay `status`, `42501` → 403) instead of always 500.
- `server.ts`: JSON 404 (`server.notFound`), unified error handler (`server.errorHandler`, keeps Multer/413 handling), CORS rejections are 403 with a sentence naming `ALLOWED_ORIGINS`, `trust proxy` (real client IPs behind App Runner/ALB for the rate limiters), gzip `compression`, graceful `SIGTERM`, keep-alive tuned for load balancers.
- `requestContext` middleware logs one JSON line per request `{requestId, method, route, status, durationMs}` for CloudWatch Logs Insights.
- Public catalogue GETs send `Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=120`; categories are cached 60 s in memory.

**Frontend** (`frontend/src/utils/apiErrors.ts`): `describeError(where, action, err)` renders

> Could not load the "dairy" category (CategoryPage.fetchProducts): permission denied for table products [ref 3f0c…]

`fetchJson()` / `apiErrorFromResponse()` turn non-2xx bodies into `ApiError` carrying the backend's `where` / `requestId`. The Home, Shop, Category, Addresses and Tracking error cards now show the recorded reason instead of "Something went wrong".

## 3. Verification

- `npx tsc --noEmit` clean for `backend/` and `frontend/`.
- Backend tests 22/22 (the two pre-existing `payment.service.test.ts` failures were repaired), frontend tests 26/26.
- `vite build` succeeds; see the commit message for chunk sizes.

## 4. Backlog — found by the audits, not fixed here

Ordered by risk. Line numbers refer to `origin/main` at `89bd719`.

**Payments / orders (high)**
1. Webhooks can downgrade a `paid` order (`payment.service.ts` `payment.authorized` / `payment.failed` have no status guard); `refund.processed` marks partial refunds as full.
2. Payment is captured before amount/notes validation (`payment.controller.ts`, `wallet.controller.ts`, `orderAdditions.controller.ts`); a customer can pay for an order that `cancelIfPaymentAbandoned` already cancelled.
3. Admin refund never updates `refunded_amount` / `payment_status`, so a later cancel refunds twice; `amount: 0` triggers a full refund.
4. `cancelOrder` cancels allocations/offers/store_orders before the atomic status guard and races with rider acceptance.
5. Pickup-code submit has no `status='accepted'` guard (double submit) and counts rejected allocations.

**Access control (high)**
6. Saved-address resolution merges other customers whose `contact_phone` fuzzy-matches and returns **their** addresses (`database.service.ts` `getCustomerSavedAddressesResolved`).
7. Riders can claim any order regardless of status (`acceptOrder`), set any order status via `/api/tracking/orders/:id/updates` (skips OTP and forward-only guards), and read customer name/phone before accepting.
8. Deactivated admins, suspended shopkeepers and offboarded riders keep access (no status checks in `requireAdmin`, `requireShopkeeper`, `requireRider`, `resolveShopkeeperFromToken`).
9. Customers can keep reading a rider's live location after delivery (no active-order filter).
10. `customers.controller.ts` address create spreads `req.body` into the insert (mass assignment).
11. Store-owner document upload routes run `multer` before authentication.

**Data / multi-store (medium)**
12. `.maybeSingle()` on multi-row results: shopkeepers with several stores get `store: null`; riders/shopkeepers on multi-store orders get 403/404 for invoices and order detail.
13. `assignDeliveryAgent` never sets `customer_orders.assigned_driver_id`, so admin-assigned riders get 403 on pickup.
14. Invoices generate for unpaid/cancelled orders and default `payment_status` to `paid`.
15. Simulation can mark a cancelled order delivered.

**Performance (medium)**
16. Tracking poll runs three watchdog reads plus the order read per request; `reBroadcastIfStuck` checks its throttle after querying.
17. Whole-table scans filtered in JS: `driver_locations` (delivery + shopkeeper controllers), all stores by haversine, all `ready_for_pickup` orders, `adminActivityLog` (six unbounded reads).
18. Unbounded list endpoints (rider orders/history, coupons, admin lists) will be silently truncated by PostgREST's row cap.
19. No outbound `fetch` timeout anywhere (Razorpay, Google, Expo push, Resend).
20. `requireCustomer` writes `session_token_issued_at` on every request (one DB write per tracking poll).

**Frontend (medium/low)**
21. `DeliveryPartnerPage` (legacy `/driver-legacy`) pushes GPS with no auth header → always 401.
22. `ShopPage` calls the nearby-store RPC three times per location change (now served from cache, but still three calls).
23. Timeouts/listeners not cleared in `MapLocationPicker`, `LocationPicker`, `DeliveryMap`.
24. `WishlistPage` optimistic-remove restores a stale snapshot on failure; `DriverApp` online toggle has no rollback and collapses expanded stops every 6 s.
25. `CheckoutPage` prefills only from `currentLocation`, not `LocationContext`.
26. ESLint cannot run: `.eslintrc.json` references `eslint-plugin-react`, which is not installed.
