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

## 5. New findings — 2026-09-30 deep-dive audit

Covers regressions introduced by commit `31d285e` (this repo) plus first full-depth reviews of the
three mobile apps (`near-now-store_owner`, `NAT_Near-Now_Rider-`, `nearandnowcustomerapp`), none of
which were fixed here — this is a record for the next pass.

**Count by app / severity**

| App | High | Medium | Low | Total |
| --- | --- | --- | --- | --- |
| near-and-now (backend/frontend, commit `31d285e` regressions) | 0 | 4 | 1 | 5 |
| near-now-store_owner (shopkeeper app) | 2 | 1 | 0 | 3 |
| NAT_Near-Now_Rider- (driver app) | 1 | 0 | 2 | 3 |
| nearandnowcustomerapp (customer app) | 1 | 0 | 1 | 2 |
| **Total** | **4** | **5** | **4** | **13** |

### near-and-now — regressions introduced by commit 31d285e

1. **(Medium, FIXED 2026-10-01) `where` label mangled to `"...Controller.if"`.**
   `places.controller.ts` (lines 26, 55, 83, 108, 134, 177), `deliveryPartner.controller.ts:283`,
   `shopkeeper.controller.ts:76` — a mechanical find/replace keyed on the enclosing `if` block, not
   the function name. Every places/geocode/directions failure and every rider/shopkeeper
   auth-middleware failure logged the same useless location, defeating this commit's stated goal of
   locatable errors.
   Fix: each site now reports its real location — `places.autocomplete` / `places.placeDetails` /
   `places.geocode` / `places.reverseGeocode` / `places.directions` / `places.roadRoute`,
   `DeliveryPartnerController.requireRider`, `ShopkeeperController.requireShopkeeperAuth` — matching
   the `<module>.<function>` convention already used everywhere else (e.g.
   `customerAuth.middleware.ts`'s `where = 'customerAuth.requireCustomer'`).
2. **(Medium, FIXED 2026-10-01) Dropped `{status, error_message}` body on "missing API key"
   branches.** `places.controller.ts` lines 26/55/83/108/134 called `sendError` with no `extra`; the
   frontend's `placesService.ts` reads `error_message`/`message`, which didn't exist, so users saw a
   generic "Search failed (500)" instead of a real message — worse than pre-commit behavior.
   Fix: each of the 5 "missing API key" branches now passes
   `extra: { status: 'ERROR', error_message: '<specific message>' }`, matching the shape each
   function's own catch block already sends on a Google API failure, so `placesService.ts` renders a
   real message either way. `roadRoute`'s catch block only needed the `where`/`friendly` fix (#1) — its
   only caller, `fetchDirections()` in `placesService.ts`, checks `response.ok` and falls back to the
   legacy `/directions` endpoint rather than reading `error_message`, so no body-shape change was
   needed there. Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing).
3. **(Medium, FIXED 2026-10-01) A failed nearby-store RPC call is cached as a successful empty
   result.** `frontend/src/services/supabase.ts` `getNearbyStoreIds` caught the Supabase error and
   returned `[]`, and `cached()` stored that `[]` for 5 minutes as if it were valid. One transient
   RPC failure → the radius filter silently dropped and customers were served the **entire
   unfiltered catalogue** for up to 5 minutes, no error shown.
   Fix: the loader now throws instead of swallowing the error, so `cached()` never stores a failed
   call (it only caches a loader's resolved value) and the next caller retries instead of reusing a
   stale "empty" result. This matches the file's existing documented intent elsewhere
   (`getProductsByCategory`/`searchProducts`: "Throws on failure ... a DB failure must not look like
   an empty category") — `resolveStoreIds` and every caller already propagate the error uncaught to
   page-level `catch` blocks that call `describeError()` and show a real error card, so no downstream
   changes were needed. Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (26/26 passing).
4. **(Medium, FIXED 2026-10-01) Concurrent product-page fetch has no `.order()` clause.**
   `fetchProductRows`'s `readChunk` fans out 4 `.range()` pages concurrently (previously serial) with
   no stable sort key — Postgres doesn't guarantee row order across separate offset requests. A
   product's `is_active`/`store_id` changing mid-scan could duplicate/skip rows, and a short page
   mid-batch discarded already-fetched later pages; the result was then cached for 60 s.
   Fix, two parts in `frontend/src/services/supabase.ts`:
   - `buildProductQuery` now adds `.order('id', { ascending: true })` — `id` is the `products` table's
     primary key, so every `.range()` page is a deterministic slice of the same row order, even while
     rows are inserted/updated concurrently.
   - `readChunk`'s batch loop no longer `break`s out on the first short page mid-batch (which
     discarded already-fetched, already-paid-for rows from later pages in the same
     `Promise.all` batch); it now pushes every page's rows unconditionally and only stops issuing
     further batches once every page in the current batch came back full
     (`batch.every((page) => page.length === PRODUCT_PAGE_SIZE)`).
   Verified with `npx tsc --noEmit` (clean), `npx vitest run` (26/26 passing), and `npx vite build`
   (succeeds, same chunk sizes).
5. **(Low, FIXED 2026-10-01) Client-supplied `X-Request-Id`/`X-Amzn-Trace-Id` header was trusted
   almost as-is.** `backend/src/middleware/requestContext.ts` only length-capped it to 128 chars
   before echoing it via `res.setHeader` and embedding it in error bodies/logs; a value with
   characters invalid for an HTTP header threw before any route handler ran.
   Fix: added a `SAFE_REQUEST_ID` allowlist regex (`/^[\x20-\x7E]{1,128}$/` — printable ASCII only,
   no control characters, so no CR/LF header injection and nothing `res.setHeader()` would reject).
   A client-supplied id that fails the check is discarded wholesale (not truncated) and a fresh
   `randomUUID()` is generated instead, so no attacker-controlled fragment ever reaches the response
   header, error bodies, or the log line as a "correlation id". Verified with `npx tsc --noEmit`
   (clean), `npx vitest run` (22/22 backend, 26/26 frontend — unaffected), and a standalone check of
   the regex against valid ids, over-length ids, CR/LF, non-ASCII and empty input.

*(Checked and found clean: `AuthContext`/`NotificationContext` memoization — no stale closures;
`server.ts`'s JSON 404 and unified error handler are ordered correctly.)*

### near-now-store_owner (shopkeeper app)

6. **(High) No store-switcher; `selected_store_id` is set once at first login and never updated.**
   `lib/useSelectedStore.ts:37-40`, seeded only in `app/(tabs)/home.tsx:160-165` (`if (!id)`). A
   shopkeeper with 2+ stores is permanently locked to whichever store the backend returned first —
   inventory, add-products, profile and billing for any other store are silently inaccessible.
7. **(High) Store approval/suspension gate always checks `stores[0]`, not the store actually in
   use.** `lib/storeApproval.ts` (`getPrimaryStore`, `checkStoreApproval`) never honors
   `selected_store_id`, unlike `useSelectedStore`. For a multi-store account this can either lock the
   shopkeeper out of the whole app (store[0] suspended, real store approved) or let them keep
   managing/accepting orders on a store an admin already suspended (store[0] approved, real store
   suspended) — the client-side mirror of backend backlog item 8.
8. **(Medium) Inconsistent multi-store scoping.** Order badges (`incomingOrdersContext.tsx`) and
   invoices (`app/invoice/[orderId].tsx`) correctly aggregate across every store the account owns;
   inventory, profile, billing and the approval gate do not.

### NAT_Near-Now_Rider- (driver app)

9. **(High, FIXED 2026-10-01) Background GPS tracking is never stopped on session invalidation.**
   `lib/backgroundLocationTask.ts`'s `stopBackgroundLocationTracking()` was only called from
   `home.tsx`'s mount lifecycle and the explicit Logout button in `profile.tsx:326` — never from the
   401/`onSessionExpired` handler in `app/_layout.tsx:55` (which only did `setIsLoggedIn(false)`),
   and never checked on cold start with an already-invalid session. An offboarded/force-expired
   rider, or one who force-kills and relaunches the app mid-delivery, kept a live foreground-service
   GPS notification and continuous location polling running indefinitely, draining battery, until
   they manually revoked permission or reinstalled.
   Fix: `app/_layout.tsx`'s `setSessionExpiredHandler` callback now also calls
   `stopBackgroundLocationTracking()` alongside `setIsLoggedIn(false)`, and the initial session-check
   effect calls it too whenever `getSession()` resolves with no token on cold start — covering both
   the "401 arrives while a screen other than home.tsx is mounted" case and the "app relaunched with
   an already-expired/cleared session" case. Verified with `npx tsc --noEmit` (clean).
10. **(Low) `useRiderVerificationGate.ts` fail-open window.** A network error during a verification
    check keeps an already-verified rider verified; a genuine admin-side revoke racing a connectivity
    blip isn't caught for up to ~30 s / until the next successful poll or foreground check.
11. **(Low) Foreground/background GPS watch toggling on rapid backgrounding.** `home.tsx` and the
    background task hand off `watchPositionAsync` on every background/foreground transition; both
    start/stop calls are idempotent so this is log noise, not a functional bug.

### nearandnowcustomerapp (customer app)

12. **(High, FIXED 2026-09-30) Search can bypass the delivery-radius filter.**
    `app/support/search.tsx`: the nearby-store filter (`nearbyIdsRef`) was populated by a separate,
    asynchronous effect while the debounced search effect read it synchronously at fire time. Since
    the search `TextInput` auto-focuses, a user could type and get results before the filter loaded;
    `undefined` is treated as "no filter" by `lib/productService.ts`, so search returned the
    **entire platform catalogue** unrestricted by the 4 km radius — every other screen (`home.tsx`,
    `category/[slug].tsx`, `checkout.tsx`, `order/confirmation/[id].tsx`) awaits the same filter
    inline and was unaffected.
    Fix: added a `nearbyVersion` counter bumped whenever the filter finishes loading; the search
    effect now bails out (staying in its loading state) while `location` is set but
    `nearbyIdsRef.current` is still `undefined`, and re-fires once `nearbyVersion` changes — so a
    query never runs against an unloaded filter. `nearbyIdsRef.current` is also reset to `undefined`
    when a new location fetch starts, so a stale filter from a previous location can't leak into the
    new one. Verified with `npx tsc --noEmit` (clean).
13. **(Low) Client address payload adds no defense against the backend's mass-assignment gap.**
    `lib/addressService.ts:105-161` whitelists fields before POSTing (correct client behavior), but a
    modified/replayed request bypassing the client can still hit backend backlog item 10; also passes
    `google_place_data` through as an arbitrary, unstripped object.
