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

Ordered by risk. Line numbers refer to `origin/main` at `89bd719`. **Status column re-verified
against live code on 2026-10-01** (see section 6.2) — items not re-verified keep their original text.

**Payments / orders (high)**
1. `[STILL OPEN]` Webhooks can downgrade a `paid` order (`payment.service.ts` `payment.authorized` / `payment.failed` have no status guard, lines 546-562/613-625); `refund.processed` (626-639) marks partial refunds as full.
2. `[STILL OPEN]` Payment is captured before amount/notes validation (`payment.controller.ts:84`, `orderAdditions.controller.ts:298` — `ensurePaymentCaptured` runs before the cross-check that follows); a customer can pay for an order that `cancelIfPaymentAbandoned` already cancelled.
3. `[PARTIALLY MITIGATED]` The generic `POST /refund` (`payment.controller.ts:199-217`) still never updates `refunded_amount`/`payment_status`, so a later cancel refunds twice, and `amount: 0` still triggers a full refund (`payment.service.ts:509`'s `if (data.amount)` is falsy for 0). But a new, correctly-built `resolveItemRefund` endpoint (`payment.controller.ts:223-318`) was added since — it updates both fields, caps at the paid total, and rejects `amount<=0`.
4. `[MITIGATED 2026-10-01]` `cancelOrder` (`database.service.ts:360-461`) still cancels allocations/offers/store_orders (398-438) before its own atomic status-guarded `customer_orders` update (447-456) — internally still a multi-step, non-transactional sequence. The exploitable consequence (a rider's `acceptOrder` winning a race landing between those steps) is now closed from the other side instead — see item 7's fix. A future caller that reads/writes `store_orders`/`customer_orders` state without the same defensive status guard `acceptOrder` now has could still hit a similar race; `cancelOrder` itself would ideally become one atomic Postgres function (matching `finalize_order_if_ready`'s pattern) rather than relying on every consumer to defend against its non-atomicity individually.
5. `[FIXED]` `acceptAllocation` (`shopkeeper.controller.ts`) now has a read-check (238) and an atomic `.eq('status','pending_acceptance')` write guard (317-325) against double-submit; migration `20260930340000_finalize_order_if_ready_require_accepted.sql` closed the related "all-rejected still marked ready" gap.

**Access control (high)**
6. `[STILL OPEN]` Saved-address resolution (`database.service.ts:582-687` `getCustomerSavedAddressesResolved`) still does `ilike '%tendigits%'` substring matching on `contact_phone` across all customers and merges in their addresses.
7. `[PARTIALLY FIXED 2026-10-01]` `acceptOrder` (`deliveryPartner.controller.ts:816-845`) claimed via `.is('delivery_partner_id', null)` with no `store_orders.status` filter; `addTrackingUpdate` (`tracking.controller.ts:107-134`, `database.service.ts:2406-2446`) let any assigned rider set any `VALID_ORDER_STATUSES` value directly, with no forward-only/OTP guard; and riders could read customer name/phone before accepting.
   `[STILL OPEN]` The third sub-issue — `getAvailableOrders` (`deliveryPartner.controller.ts:1917,1931,1966-1967`) returns `customer_name`/`customer_phone` (from `receiver_name`/`receiver_phone` or the `app_users` row) directly in every offer payload sent to any online rider browsing available orders, before they've accepted anything — was not addressed in this pass. Not fixed here; carried forward.
   Fix, two parts:
   - `acceptOrder`'s `store_orders` claim now also requires `.not('status', 'in', '(order_cancelled,order_delivered)')`, closing the race where `cancelOrder`'s non-atomic multi-step sequence (item 4) could let a claim land between steps and succeed on an order actually being cancelled. A second, narrower-window guard was added on the follow-up `customer_orders` update too (same status exclusion); if that one loses the race instead, the `store_orders` claim is rolled back (`delivery_partner_id: null`, `status: 'ready_for_pickup'` — the same reset `rejectOrder` already uses) rather than leaving the rider holding a live claim on a cancelled order. Note: confirmed via grep that `POST /delivery-partner/orders/:orderId/accept` (`acceptOrder`) has zero live callers today — every app (rider app, website's `DriverApp.tsx`, legacy `DeliveryPartnerPage.tsx`) only ever calls the offer-based `/delivery-partner/offers/:offerId/accept` (`acceptOffer`), whose underlying `accept_driver_offer()` Postgres function was already fully atomic and correctly order-status-gated (checked during this same audit). So the day-to-day accept flow was never actually exposed to this race — `acceptOrder` is hardened as a matter of principle (same "dead but reachable, still worth closing" reasoning as `addTrackingUpdate` below), not because real traffic was hitting it.
   - `addTrackingUpdate` (`database.service.ts`) now enforces a forward-only `ORDER_STATUS_SEQUENCE` (rejects any transition that isn't strictly forward, `order_cancelled` excepted as a separate terminal branch reachable from anywhere) and requires `customer_orders.delivery_otp_verified_at` to already be set before accepting a transition to `order_delivered` — closing the second, unguarded path to a status the dedicated `markDelivered` endpoint otherwise gates properly on OTP verification. Confirmed via grep that this route (`POST /api/tracking/orders/:orderId/updates`) has zero live callers in either the rider app or the website today — hardened rather than removed, since it's still a registered, `requireRider`-gated endpoint reachable directly.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing).
8. `[MOSTLY FIXED 2026-10-01]` `requireAdmin` (`adminAuth.middleware.ts:17-63`) only checked session validity, never `admins.status`; `requireRider` (`deliveryPartner.controller.ts:247-285`) never checks `is_approved`; `resolveShopkeeperFromToken` (`storeOwner.controller.ts:65-96`) never checked store approval at all. Contrast: `customerAuth.middleware.ts:65-67` *does* check `is_suspended` — the gap was specific to admin/shopkeeper/rider gates. The admin panel had the same gap independently — see section 6.1, finding A1.
   Fix: `requireAdmin` now does a second lookup on `admins.status` and rejects with 401 unless `'active'`. The Supabase migration `20261001000000_is_admin_authenticated_checks_status.sql` adds the same `admins.status = 'active'` join to the `is_admin_authenticated()` SECURITY DEFINER function that gates the `admin_full_access` RLS policy on 9 tables (including `admin_sessions` itself) — this closes the admin-panel side (finding A1) for free, since `secureAdminAuth.ts`'s own session-validity check already treats "no row returned" as "session invalid" and logs out, and that query is itself RLS-gated by this same function. **`[APPLIED 2026-10-01]`** — see section 7 for verification.
   For shopkeepers, `resolveShopkeeperFromToken` deliberately stays approval-agnostic (many callers — document upload/delete, billing info, support messages, profile-change requests — must keep working for a pending/suspended shopkeeper so they can act on admin's feedback); instead, the two customer-facing storefront-gallery mutations that were missing the check pending stores already had elsewhere (`deleteStoreProduct`, `updateProductQuantity`, `updateProductActiveState`) — `addStoreImage` and `deleteStoreImage` — now go through a new `assertOwnsApprovedStore()` helper instead of the approval-agnostic `assertOwnsStore()`.
   For riders, `requireRider` is intentionally left unchanged: it's documented in-code (deliveryPartner.controller.ts:311-317) as deliberately approval-agnostic so a pending rider can still view their own profile/status, and every actual order-mutating action (`acceptOrder`, `acceptOffer`, going online) already re-checks `is_approved` fresh from the DB on every call via `getRiderApprovalState()`/inline checks — confirmed this isn't a stale-session gap like the admin case, since there's no "checked once at login" pattern here to begin with.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing, unaffected).
9. `[STILL OPEN]` `getDriverLocationsForOrder` (`database.service.ts` ~2490) still has no filter excluding `order_delivered`/`order_cancelled`.
10. `[STILL OPEN]` `customers.controller.ts:85-101` `createAddress` still spreads `...req.body` into the insert; `updateAddress` right below it correctly uses an allowlist — the fix was applied inconsistently between the two.
11. `[STILL OPEN]` `storeOwner.routes.ts:19,22` still wire `docUpload.single('file')` ahead of the controller; the auth check in `resolveShopkeeperFromToken` runs as the first line *inside* the handler, after multer already parsed the upload.

**Data / multi-store (medium)**
12. `[STILL OPEN]` `invoice.controller.ts` `verifyOrderBelongsToShopkeeper` still uses `.maybeSingle()` on a join; a shopkeeper whose two stores are both allocated on one order gets a silently-swallowed multi-row error → 403.
13. `[STILL OPEN]` `assignDeliveryAgent` (`database.service.ts:1888-1911`) still only writes `store_orders`, never `customer_orders.assigned_driver_id`.
14. `[STILL OPEN]` `getCustomerInvoice` (`invoice.controller.ts:67-100`) still auto-generates via `generateForOrder` with zero order/payment-status check; `invoice.service.ts:515` still defaults `payment_status` to `'paid'`.
15. `[STILL OPEN]` `deliverySimulation.service.ts:452` still writes `order_delivered` unconditionally; the only cancellation check is a one-time read at function start (223-224), not re-checked before the final write.

**Performance (medium)**
16. `[PARTIALLY MITIGATED]` The 3 tracking watchdogs are now fire-and-forget (no longer blocking the response), but they still run every poll, and `reBroadcastIfStuck` (`shopkeeper.controller.ts:887-897`) still does a DB read before its in-memory throttle check.
17. `[STILL OPEN]` `assignCandidatesInRadius` (580-589) and the driver-online catch-up path (757-788) still pull all active/approved stores or all `ready_for_pickup` orders and filter by `haversineKm` in JS; `adminActivityLog.controller.ts:57-77` still has six unbounded `.select()`s with no `.limit()` — **the admin panel's own `ActivityLogPage` has no pagination UI either**, see section 6.1, finding A3.
18. `[PARTIALLY MITIGATED]` Rider `getOrders` gained an opt-in `?limit=` (capped 200) but defaults to unbounded by design (documented); `coupons.controller.ts` → `database.service.ts:1420-1432` `getCoupons()` is still fully unbounded. **`adminRiderPayouts.controller.ts`'s `listRiderPayouts` is also unbounded**, see section 6.1, finding A3.
19. `[STILL OPEN]` No `AbortController`/`signal` on any fetch in `directions.service.ts`, `geocoding.service.ts`, `notification.service.ts`, `payment.service.ts`, `roads.service.ts`.
20. `[PARTIALLY MITIGATED]` `customerAuth.middleware.ts:91-101` still writes `session_token_issued_at` every request, but it's now fire-and-forget (`void (async...)`), so it no longer blocks the response.

**Frontend (medium/low)**
21. `[STILL OPEN]` `DeliveryPartnerPage.tsx:380-382` still sends no `Authorization` header.
22. `[FIXED]` `ShopPage.tsx` was rewritten around server-side `get_nearby_products_page`/`getNearbyProductsMeta`/`hasNearbyStores`; the old triple-RPC-call pattern is gone.
23. `[PARTIALLY MITIGATED]` `DeliveryMap.tsx` now has real cleanup (`cancelled` flags, `zoomListenerRef.current?.remove()`); `MapLocationPicker.tsx` still has zero `useEffect`/cleanup for its `idle` listener or debounce timeouts.
24. `[STILL OPEN]` `WishlistPage.tsx:77-92` `remove()` still captures a stale `previous` snapshot vulnerable to concurrent-remove races; `DriverApp.tsx:577-587` `toggleOnline` still has no rollback; `fetchSequence` (295-313) still force-collapses `expandedStops` every 6s.
25. `[STILL OPEN]` `CheckoutPage.tsx:182` still reads raw `localStorage.getItem('currentLocation')`, never `LocationContext`.
26. `[FIXED]` `npx eslint . --ext ts,tsx --max-warnings 0` in `frontend/` now runs cleanly (4 errors/85 warnings, no config crash) — the broken `eslint-plugin-react` reference is gone.

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

## 6. 2026-10-01 deep-dive — admin panel (new), backend backlog re-verification, and fresh areas of all three mobile apps

Section 4's 26-item backlog was re-verified line-by-line against live code (statuses now inline in
section 4). This section covers what that pass found that wasn't already in section 4 or 5: the
admin panel (audited for the first time) and new areas of each mobile app not covered by the
2026-09-30 pass (section 5).

### 6.1 near-and-now/admin (admin panel — first audit)

**A1. (High, FIXED 2026-10-01) Deactivating/suspending an admin does not revoke their live session.**
`status='active'` was checked only at login (`admin.controller.ts:62`). None of
`adminAuth.middleware.ts`'s `requireAdmin` (17-63) / `requirePermission` (79-83), the RLS function
`is_admin_authenticated()` (`20260815000000_security_definer_search_path_hardening.sql:50-87`), or
the admin panel's own client-side guard (`admin/src/services/secureAdminAuth.ts:74-123`) ever checked
`admins.status` after login. A super_admin could set another admin to `inactive`, but that admin's
existing token kept working — API and admin panel both — until it expired or they logged out
themselves. Same root cause as backend backlog item 8, confirmed independently present at the
RLS/admin-panel layer too, not just the one Express middleware spot.
Fix: `requireAdmin` now re-checks `admins.status` on every request (see item 8's fix note above);
migration `20261001000000_is_admin_authenticated_checks_status.sql` adds the same check inside
`is_admin_authenticated()`, so every RLS-gated admin-panel query — including `secureAdminAuth.ts`'s
own session-validity check, since it reads `admin_sessions` through this same RLS policy — fails
closed for a deactivated admin with no separate client-side change needed. **`[APPLIED 2026-10-01]`**
— see section 7.

**A2. (Medium, FIXED 2026-10-01) Store-approval "documents complete" check is UI-only, not enforced by RLS.**
`admin/src/pages/admin/StoresPage.tsx`'s `toggleApproval()` (~line 1019) gates `is_approved=true` on
a client-side `approvalReadiness()` check against locally-fetched document rows, then writes directly
to `stores` via Supabase. The RLS policy `admin_update_requires_permission`
(`20260919000000_stores_delivery_partners_permission_rls.sql:48`) only checked the caller's
`store_verification` permission — it never re-validated that required documents are actually
approved. Any admin with that permission could bypass the UI gate via a direct REST call and approve a
store with missing/rejected KYC documents.
Fix: `20261001030000_stores_approval_requires_docs_approved.sql` adds a `store_required_docs_approved()`
SECURITY DEFINER function mirroring `approvalReadiness()`'s own check exactly (all 4 onboarding-required
doc types — aadhaar_front/back, pan_front/back — have at least one `status = 'approved'` row), and
requires it in the `stores` UPDATE policy's `WITH CHECK` whenever the write would leave
`is_approved = true`. Revoking approval is never gated by this, matching `toggleApproval()`'s own
"only gate the approve direction" comment. Confirmed via grep that `toggleApproval()` is the only
client-side write to `stores.is_approved` anywhere in the admin panel, and that no other write
(`toggleStoreActive`, `handleDeleteStore`, `handleRestoreStore`) touches `is_approved` in a way this
check could block — each either omits it (keeping the existing value, which is already consistent with
document status per the codebase's approve/revoke invariant) or explicitly sets it to `false`.
**`[APPLIED 2026-10-01]`** — verified live via an anon-key RPC call to `store_required_docs_approved`
(returns `200 false` for a nonexistent store id, confirming the function exists and runs); migration
history repaired the same way as the others in section 7.

**A3. (Medium, FIXED 2026-10-01) Unbounded queries, no pagination.**
`backend/src/controllers/adminActivityLog.controller.ts` (54-77): 6 parallel queries across
profile-change-requests, product-submissions and verification-document tables, none with
`.limit()`/`.range()`; `admin/src/pages/admin/ActivityLogPage.tsx` called it with no limit param and
had no "load more" UI (unlike `SecurityLogPage`/`NotificationsPage`, which both paginate).
`backend/src/controllers/adminRiderPayouts.controller.ts`'s `listRiderPayouts` (19-26) was also
unbounded.
Fix: both endpoints now accept `?limit=` (`Math.min(Number(req.query.limit) || 100, 500)`, same
convention as `adminSecurityLog.controller.ts`). `listActivityLog`'s 6 source queries are each ordered
by `reviewed_at` descending and capped at `limit` independently (so a quiet source can't be starved
out of the merged result by a noisy one), and the final role-filtered, sorted list is truncated to
`limit` again. `ActivityLogPage.tsx` and `RiderPayoutsPage.tsx` both gained the exact "Load More"
pattern already used on `SecurityLogPage` (re-request with `limit + 100`, `hasMore = rows.length ===
limit`) — `RiderPayoutsPage` additionally resets to the default limit when the pending/paid filter
changes, in one combined effect so switching tabs can't fire two fetches back to back. Verified with
`npx tsc --noEmit` (clean for `backend/` and `admin/`) and `npx vitest run` (22/22 passing); confirmed
via grep that each endpoint has exactly one route and one frontend caller, both updated.

**A4. (Minor, deliberately not fixed) Route-level guards check auth only, not permission.**
`admin/src/routes/AdminRoutes.tsx`'s `AdminAuthGuard` checks `isAdminAuthenticated()` for every
route, not role/permission — pages self-gate via `hasPermission`/`hasRole` inside the component
(confirmed present), so a low-privilege admin typing a URL directly gets a client-side "no
permission" render rather than real data. Low risk since backend endpoints are separately
permission-checked. Left alone: correctly replicating this at the route level would mean re-deriving
the exact required permission for all ~30 routes to match each page's own internal check exactly — a
broad, error-prone change where getting even one wrong risks locking a legitimate admin out of a page
entirely, a worse outcome than today's client-side message, for the lowest-severity item on this
list. Worth a shared route-level guard for consistency if picked up deliberately later, with each
route's permission carefully cross-checked against its page component first.

**What's left (admin panel):** rider payouts explicitly "records the outcome, doesn't move money" —
no real disbursement/payment-gateway integration exists yet (documented in the controller's own
header comment). Two independent "notification" concepts coexist under similar names —
`admin/src/context/NotificationContext.tsx` (toast/alert only) vs. the real `admin_notifications`
per-admin-read-state system used by `NotificationsPage.tsx` — not a bug, but a naming collision
worth resolving before it causes one.

### 6.2 near-and-now backend — 2 new bugs found in previously-unreviewed files

**B1. (Medium) `createWalletTopupOrder` sends no idempotency key.**
`payment.service.ts` (~line 285) calls `razorpayRequest('POST','/orders', orderBody)` with no
idempotency key, unlike its two siblings `createPaymentOrder` (168) and
`createAdditionPaymentOrder` (234), which both set one. A retried/double-tapped wallet top-up can
create two separate Razorpay orders for the same intent.

**B2. (Medium) Admin-only `updateDeliveryStatus` has no status validation.**
`delivery.controller.ts:304-323` only checks `if (!status)` — never validates against the
`VALID_ORDER_STATUSES` enum the rider-facing equivalent (`tracking.controller.ts`) enforces, and has
no forward-only guard. A malformed status value from the admin panel can write straight into
`customer_orders.status`.

### 6.3 near-now-store_owner (shopkeeper app) — new area

**S1. (Medium, FIXED 2026-10-01) Partial multi-photo upload failure creates duplicate gallery entries
on retry.** `components/kyc/useStoreImages.ts:102-134` (`saveAll`) uploaded+registered each staged
photo sequentially; if photo 2 of 3 failed to register (network blip), `pending` was never trimmed for
the already-succeeded photo 1 (only cleared via `setPending([])` on full success) and `reload()` never
ran. Retrying re-uploaded and re-registered photo 1, creating a duplicate gallery entry.
Fix: `saveAll` now works off a local copy of `pending`, trimming it (and mirroring into state via
`setPending`) as each photo's own upload+register succeeds, and calls `reload()` whenever at least one
photo succeeded even if a later one failed — so a retry only resends what's actually still staged, and
the gallery reflects reality immediately rather than after the next full success. The caller's
contract (`Promise<boolean>`, `false` halts `useVerificationDocuments.ts`'s own save flow) is
unchanged, so no caller updates were needed.
Checked `app/profile.tsx`'s sibling `components/profile/useStoreGallery.ts` — it's structurally
different (uploads one photo immediately per `pick()` call, no staging/batching), so there's no
multi-photo partial-failure scenario there; no fix needed.
Verified with `npx tsc --noEmit` (clean) and a grep confirming `useVerificationDocuments.ts:281` is
the only caller of `saveAll` and its `if (!imagesOk) return;` handling is unaffected.

Everything else in this pass (onboarding, KYC upload, billing/payouts, profile edit, settings,
help/support, notifications, signup, custom-product submission, caching) came back clean — already
hardened with explicit audit-trail comments from prior fixes. No incomplete features found.

### 6.4 NAT_Near-Now_Rider- (driver app) — new area

**D1. (Medium, FIXED 2026-10-01) No double-tap guard on profile save.**
`app/(tabs)/profile.tsx:229` `handleSave` gated re-entry only via `saving` state, not a synchronous
ref like `billing-info.tsx:175` (`savingRef`) or `delivery/[orderId].tsx:126` (`verifyingRef`) use for
this exact race. A fast double-tap could fire two concurrent profile-change-request POSTs.
Fix: added the identical `savingRef` pattern (checked synchronously at the top of `handleSave`, set
before the async work, reset in a `finally`). While adding the `finally`, also found and fixed a
second, related bug: the two early `return`s inside the `try` block (session expired, no changes to
save) previously skipped `setSaving(false)` entirely, since it was a bare statement after the
try/catch rather than inside a `finally` — leaving `saving`/`savingRef` stuck `true` forever on those
paths. Verified with `npx tsc --noEmit` (clean).

**D2. (Medium, FIXED 2026-10-01) No email format validation before submitting a profile change.**
`app/(tabs)/profile.tsx:241` pushed `email.trim()` straight into the admin-review patch with no
validation, unlike `billing-info.tsx:180` (UPI regex) or `documents.tsx`'s per-doc-type regex checks.
Fix: reuses the same email regex already used in `signup.tsx` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`),
checked before the `savingRef` guard engages. Verified with `npx tsc --noEmit` (clean).

**D3. (Low-Medium) Optimistic-revert race on concurrent notification actions.**
`notifications.tsx`'s `markOneRead`/`markAllRead` (84-112) and `notification-preferences.tsx`'s
`toggle` (92-107) each snapshot `previous` state before their async PUT resolves. Two such actions
fired close together can have the earlier one's failure revert to a snapshot taken before *both*,
silently erasing the second action's successful change.

**D4. (Low) Unhandled promise rejections from `Linking.openURL()`.**
No `.catch()` on calls in `delivery/[orderId].tsx:162,166,504`, `pending-verification.tsx:385`, or
`home.tsx:976,1110,1142` — rejects with no app installed to handle the scheme (e.g. no dialer/maps
app).

**D5. (Low) Same missing-ref double-tap pattern on image pickers.**
`profile.tsx:190` `handlePickImage` and `billing-info.tsx:127` `pickProfileImage` gate only on state.
Low real-world risk since the native picker modal blocks re-taps.

**What's left (driver app):** no support/chat screen (tel: links to hardcoded numbers only); no
ratings/reviews screen for riders; no dedicated trip-history/analytics screen; `orders.tsx:138`
fetches `has_more` but never uses it — the "Past" tab is hard-capped at 50 with no pagination
(earnings totals are unaffected — fetched separately and unbounded).

### 6.5 nearandnowcustomerapp (customer app) — new area

**C1. (Medium-High, FIXED 2026-10-01) Home catalog cache is dead code, silently defeating a perf
optimization.** `app/(tabs)/home.tsx:883-942` (`fetchFresh`/`fetchFreshFast`) only wrote the
AsyncStorage/memory cache `if (!filter)`. Every real call site passes a truthy `Set` (cold start
passes `getAllActiveProductIds()`; the location-driven refresh passes `filter.productIds`, truthy even
when empty) — so `!filter` only fired if zero active+approved stores existed platform-wide, which
never happens live. Net effect: `readHomeCatalogCache()`/`getMemoryHomeCache()`, consumed by
`order-again.tsx:329-357` and `categories.tsx:151-205` for instant-paint, returned `null` on every app
run, silently falling through to the slower live-fetch fallback every time. A regression from when the
mandatory nearby/active-store filtering was added (the 2026-09-03 radius fix) without updating this
caching condition to match.
Fix: both functions now take an explicit `options?: { cacheable?: boolean }` instead of inferring
intent from `!filter` — caching no longer depends on whether a filter is present, but on whether the
filter in play is the cold-start **global** `getAllActiveProductIds()` set (safe to cache platform-wide)
versus the **location-scoped** `getNearbyProductFilter()`/`nearbyIds` set used by the location-change
effect and pull-to-refresh (never safe to cache globally — it would poison the shared cache with one
location's results for every other location). Only the three cold-start call sites (memory-cache-stale
refresh, AsyncStorage-cache-stale refresh, no-cache-at-all fast path) now pass `{ cacheable: true }`;
the location-driven effect and `onRefresh` are unchanged. Confirmed via grep that `writeHomeCatalogCache`
has no other caller anywhere in the app. Verified with `npx tsc --noEmit` (clean).

**C2. (Low) Coupon list never checks expiry client-side.**
`app/product/coupons.tsx:54-57` (`isApplicable`) only checks `min_order_value` against subtotal,
never `expires_at`. Depends entirely on the backend's "active" coupon list correctly excluding
expired ones — no defense-in-depth check like the min-order-value one got.

**What's left (customer app):** `app/verify-email.tsx` is orphaned dead code — the post-signup
redirect to it is commented out in `otp.tsx` (112-118, "Email verification step disabled for now"),
new users go straight to `/onboarding` instead, and email verification now happens inline in
`app/settings/profile.tsx`'s own code-entry UI; zero live references to `verify-email.tsx` remain. No
referral/rewards screens exist anywhere in the app (not started).

### 6.6 Recommended priority

1. **`[DONE + APPLIED 2026-10-01]` Backend item 8 + admin panel A1** (same root cause) — added an
   `admins.status` check to `requireAdmin` and the `is_admin_authenticated()` RLS function (migration
   applied to the live database, see section 7), and an `is_approved` check to the shopkeeper
   storefront-gallery mutations that were missing it. `requireRider` was deliberately left unchanged
   after confirming every order-mutating rider action already re-checks `is_approved` fresh per call —
   not the same stale-session pattern as the admin case. Applying this migration also surfaced 2 new,
   unrelated live vulnerabilities (V1, V2 — section 7), now also fixed and applied.
2. **`[DONE 2026-10-01]` Backend items 4 and 7** — the `cancelOrder`/`acceptOrder`/`addTrackingUpdate`
   race conditions. `acceptOrder`'s claim now excludes cancelled/delivered orders (with a rollback if
   the narrower `customer_orders` update loses the race instead); `addTrackingUpdate` now enforces
   forward-only transitions and requires OTP verification before `order_delivered`. `cancelOrder`
   itself is still internally non-atomic (see item 4's updated note) — the exploitable consequence is
   closed, but a fully atomic rewrite (matching `finalize_order_if_ready`'s pattern) remains a
   worthwhile follow-up, not done here.
3. **`[DONE 2026-10-01]` Admin panel A2** — closed the store-approval RLS gap so the UI check can't be
   bypassed; migration still needs to be applied to the live database.
4. `[DONE 2026-10-01]` Mobile-app mediums (S1, D1, D2, C1) — all fixed.
5. `[DONE 2026-10-01]` Admin panel A3 — pagination added to activity log and rider payouts.
   A4 deliberately left as-is — see its own note (lowest severity, high regression risk to
   "fix properly" across ~30 routes without miscategorizing one).

## 7. 2026-10-01 — migration-history reconciliation and 2 new live vulnerabilities found while applying the item-8 fix

While preparing to push `20261001000000_is_admin_authenticated_checks_status.sql` (section 6's fix),
`supabase migration list` showed ~37 local migration files (everything from `20260930060000` onward,
plus two files both timestamped `20260926000000` — a pre-existing filename collision, left unresolved,
flagged for manual cleanup) with no corresponding row in the remote history table. Confirmed live via
direct anon-key REST calls (not just trusting the CLI) that this entire range **was** actually already
applied to the production database (`get_nearby_products_page`, `wishlist_items`,
`place_multi_store_order`, `store_images.status`, `app_users.is_suspended`, `stores.deleted_at` all
exist/behave exactly as their migration files specify) — just never recorded, presumably applied via
the Supabase SQL editor rather than the CLI. Ran `supabase migration repair --status applied` for the
confirmed range (bookkeeping only, no SQL re-executed) so future `db push` calls don't try to re-run
already-live changes.

Reading through that whole previously-unaudited batch turned up two real, currently-live
vulnerabilities — neither existed in the code before Sept 30; both are regressions introduced by
migrations *within* that same batch undoing a fix an earlier migration in the same batch had just made:

**V1. (Critical) `finalize_order_if_ready` is callable by anyone with the public anon key,
completely bypassing order-acceptance business logic.**
`20260930260000_revoke_public_grant_order_verification_rpcs.sql` correctly revoked `PUBLIC`/`anon`/
`authenticated` EXECUTE on this function specifically because anon-callable access lets any client
force-advance any order straight to `ready_for_pickup` before any store accepted it. Ten migrations
later the same day, `20260930340000_finalize_order_if_ready_require_accepted.sql` (an unrelated,
correct fix adding a "require at least one accepted allocation" check) did
`CREATE OR REPLACE FUNCTION finalize_order_if_ready(...)` and copied the function's *original*,
pre-260000 grant line (`GRANT EXECUTE ... TO service_role, authenticated, anon`) — silently re-opening
the hole 260000 had just closed. `CREATE OR REPLACE` doesn't reset grants on its own; this migration's
own explicit `GRANT` statement is what undid it.
Confirmed live 2026-10-01: an anon-key RPC call with a fake order id returned `200 false` (a real
execution) rather than a `42501` permission error — while the sibling functions revoked by the same
260000 migration (`mark_verification_submitted_if_ready`, `mark_rider_verification_submitted_if_ready`)
correctly still return 401, since neither was `CREATE OR REPLACE`'d again afterward.
Fix: `20261001010000_finalize_order_if_ready_revoke_anon.sql` re-revokes `PUBLIC`/`anon`/`authenticated`
EXECUTE on this one function. Verified the only live caller is `shopkeeper.controller.ts:551`'s
`supabaseAdmin.rpc('finalize_order_if_ready', ...)` (service_role client, unaffected by the revoke) —
no legitimate caller regresses.

**V2. (High) `get_admin_dashboard_order_stats()` leaks platform-wide business metrics to
unauthenticated callers.**
`20260930380000_admin_dashboard_order_stats_rpc.sql` created this aggregation function (total orders,
total customers, total revenue, order counts by status) with no internal auth check in its body —
unlike its same-day siblings `admin_get_delivery_partner_push_tokens()`/`admin_get_customer_push_tokens()`
(`20260930290000`), which both correctly `RAISE EXCEPTION` unless `is_admin_authenticated()` first.
`20260930390000_fix_admin_dashboard_order_stats_grant.sql` then granted EXECUTE to `anon, authenticated`
(necessary — the admin panel calls it via `getAdminClient()`, an anon-key client) without ever adding
the internal check this function was missing from creation.
Confirmed live 2026-10-01: an unauthenticated anon-key RPC call returned real aggregated data
(`{"total_orders":14,"total_customers":6,"total_sales":6100,...}`) with HTTP 200, no session required.
Fix: `20261001020000_admin_dashboard_order_stats_require_auth.sql` converts the function to `plpgsql`
and adds the same `is_admin_authenticated()` guard its sibling functions already use; the aggregation
query itself is unchanged. Verified the only live caller, `admin/src/services/adminService.ts:1372`'s
`getAdminClient().rpc('get_admin_dashboard_order_stats')`, already sends the `x-admin-token` header this
check reads — no legitimate admin-panel usage regresses.

**`[APPLIED 2026-10-01]`** All three `20261001*` migrations were applied to the live database by the
user (outside the CLI, same channel as the Sept 30 batch). Verified directly via anon-key RPC calls
after applying:
- `finalize_order_if_ready` → `401 { code: '42501', message: 'permission denied for function
  finalize_order_if_ready' }` (was `200 false`) — V1 closed.
- `get_admin_dashboard_order_stats` → `400 { code: 'P0001', message: 'Not authorized' }` (was `200`
  with real revenue/order data) — V2 closed.
- `is_admin_authenticated_checks_status` (item 8 / A1) couldn't be tested directly without a live admin
  session, but since Postgres/Supabase migrations apply strictly in timestamp order and both later
  migrations above are confirmed live, this one — timestamped before both — must have applied
  successfully first; a failed migration would have stopped the batch before either later one ran.
- Ran `supabase migration repair --status applied` for all three afterward to sync the CLI's remote
  history bookkeeping (same reconciliation step as the Sept 30 batch) — no SQL re-executed, tracking
  only.

Regression checks: `npx tsc --noEmit` clean for `backend/`, `frontend/`, and `admin/`; `npx vitest run`
22/22 passing in `backend/` (none of this touches frontend/admin runtime code, only DB migrations).
