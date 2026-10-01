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
1. `[FIXED 2026-10-01]` Webhooks could downgrade a `paid` order (`payment.service.ts` `payment.authorized` / `payment.failed` had no status guard); `refund.processed` marked partial refunds as full.
   Fix: `payment.authorized`/`payment.failed` now use the same atomic-guard pattern as `cancelOrder`/
   `acceptOrder` — `.not('payment_status', 'in', '(paid,refunded,partially_refunded)')` on the update,
   so a late/retried webhook (Razorpay retries deliveries with no ordering guarantee) can no longer
   downgrade an already-settled order; a zero-row match is logged and treated as a legitimate no-op
   (the webhook handler acks 2xx either way, matching `payment.captured`'s existing idempotent-skip
   convention, so Razorpay doesn't retry something that was correctly skipped). `refund.processed` now
   looks up the order's `total_amount`/`refunded_amount`, accumulates the webhook's refund amount into
   `refunded_amount` (capped at the order total), and classifies `payment_status` as `'refunded'` only
   once that reaches the total — `'partially_refunded'` otherwise — mirroring `resolveItemRefund`'s own
   full-vs-partial logic instead of always setting `'refunded'`.
   Known residual gap, not fixed here: there's no webhook-event ledger in this codebase (`payment.captured`'s
   idempotency is also business-state-only, not event-id-based), so a redelivered `refund.processed` for
   the *same* Razorpay refund could still double-count `refunded_amount` — narrower than the bug fixed
   here, which was wrong on every single partial refund, not just on a redelivery.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing — no existing test
   covered `processWebhookEvent`, so this is verified by code review and type-checking, not new
   automated coverage). Confirmed via grep that `payment.controller.ts`'s webhook handler is the only
   caller and treats a normal return as success/no-retry, consistent with the new skip paths.
   **Now covered by automated tests** (`bugfixes.regression.test.ts`, "Item 1") — see section 8.
2. `[FIXED 2026-10-01]` Payment was captured before amount/notes validation (`payment.controller.ts:84`, `orderAdditions.controller.ts:298`, `wallet.controller.ts:104` — `ensurePaymentCaptured` ran before the cross-check that followed); a customer could pay for an order that `cancelIfPaymentAbandoned` already cancelled, or capture real money for a payment that turned out not to actually belong to the thing it was being verified for.
   Fix, same reordering across all three files — fetch payment details read-only first, run every
   validation check (amount, notes-based ownership, and a new order-not-already-cancelled check) against
   that pre-capture snapshot, and only call `ensurePaymentCaptured` once everything passes:
   - `payment.controller.ts`'s `verifyPayment`: added an `orderCtx.status === 'order_cancelled'` guard
     (new `status` field added to `getOrderPaymentContext`'s return) before the first Razorpay call, and
     moved the amount/`notes.internal_order_id` strict checks to run against a pre-capture
     `getPaymentDetails` fetch (accepting `'authorized'` or `'captured'`, since the payment is normally
     still only authorized at this point) instead of after `ensurePaymentCaptured`. Re-fetches payment
     details once more after a successful capture so the persisted gateway response reflects the final
     captured state, matching the original behavior.
   - `orderAdditions.controller.ts`'s `verifyAdditionPayment`: same reordering for its amount/
     `order_id` check (this endpoint already had a `request.status !== 'pending'` guard before capture,
     unaffected).
   - `wallet.controller.ts`'s `verifyTopup`: same reordering for its `notes.wallet_topup`/`notes.user_id`
     ownership check — previously a payment that turned out not to be a genuine top-up for that user
     still got captured even though the request was rejected and no wallet credit was given.
   Verified with `npx tsc --noEmit` (clean — also updated `payment.service.test.ts`'s
   `getOrderPaymentContext` mock to include the new `status` field) and `npx vitest run` (22/22
   passing). Confirmed via grep that `getOrderPaymentContext`'s other 5 callers only destructure
   specific fields, so the additive `status` field doesn't affect them.
3. `[FIXED 2026-10-01]` The generic `POST /refund` (`payment.controller.ts:199-217`) never updated
   `refunded_amount`/`payment_status`, so a later cancel refunded twice, and `amount: 0` triggered a
   full refund (`payment.service.ts:509`'s `if (data.amount)` is falsy for 0). A new, correctly-built
   `resolveItemRefund` endpoint (`payment.controller.ts:223-318`) was added since this item was first
   found — it updates both fields, caps at the paid total, and rejects `amount<=0` — but the original
   `/refund` endpoint itself was untouched.
   Fix: rebuilt `processRefund` to match `resolveItemRefund`'s own safety pattern. Rejects
   `amount <= 0`/non-numeric outright (closing the `amount: 0` → full-refund fallthrough). Looks up the
   order by `razorpay_payment_id` *before* calling Razorpay (this endpoint previously had zero order
   linkage at all) and rejects with 404/409 if no order is found or the requested amount would exceed
   what's actually been paid. After a successful Razorpay refund, accumulates into `refunded_amount`
   (capped at the order total) and classifies `payment_status` as `'refunded'`/`'partially_refunded'` —
   so a later `cancelOrder` now sees accurate state instead of refunding the same order a second time.
   Confirmed via grep this endpoint (`POST /api/payment/refund`, admin-only) has zero live callers in
   the admin panel or website today — hardened as a matter of principle (same "dead but reachable,
   still worth closing" reasoning as earlier fixes this session), not because real traffic was hitting
   it, but it does handle real money if called directly by anyone holding an admin session.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing).
   **Follow-up edge case, fixed later the same day:** an omitted `amount` on an order that was already
   fully refunded computed `requestedAmount = total − refunded = 0`, passed the overshoot check, and
   reached `paymentService.processRefund`, whose `if (data.amount)` again treats 0 as "no amount" (=
   full refund at Razorpay). The controller now returns 409 "already fully refunded" when the amount to
   refund is ≤ 0, before calling Razorpay. Covered by `bugfixes.regression.test.ts` ("Item 3").
4. `[MITIGATED 2026-10-01]` `cancelOrder` (`database.service.ts:360-461`) still cancels allocations/offers/store_orders (398-438) before its own atomic status-guarded `customer_orders` update (447-456) — internally still a multi-step, non-transactional sequence. The exploitable consequence (a rider's `acceptOrder` winning a race landing between those steps) is now closed from the other side instead — see item 7's fix. A future caller that reads/writes `store_orders`/`customer_orders` state without the same defensive status guard `acceptOrder` now has could still hit a similar race; `cancelOrder` itself would ideally become one atomic Postgres function (matching `finalize_order_if_ready`'s pattern) rather than relying on every consumer to defend against its non-atomicity individually.
5. `[FIXED]` `acceptAllocation` (`shopkeeper.controller.ts`) now has a read-check (238) and an atomic `.eq('status','pending_acceptance')` write guard (317-325) against double-submit; migration `20260930340000_finalize_order_if_ready_require_accepted.sql` closed the related "all-rejected still marked ready" gap.

**Access control (high)**
6. `[FIXED 2026-10-01]` Saved-address resolution (`database.service.ts` `getCustomerSavedAddressesResolved`)
   did `ilike '%tendigits%'` substring matching (plus an exact-match variant) on `contact_phone` across
   *all* customers and merged in their addresses.
   Root cause: `customer_saved_addresses.contact_phone` is a per-address delivery-contact field ("who to
   call for this delivery"), not an account-identity field — a customer can legitimately save an address
   with someone else's number as the contact (sending a gift, delivering to a relative). Matching on it
   meant that if *anyone*, ever, entered your phone number as the delivery contact on their own saved
   address, your account would merge in their `customer_id` and this function would return their entire
   saved-address book to you; the substring variant made it worse by also matching unrelated numbers
   sharing a 10-digit run.
   Fix: removed both the exact and substring `contact_phone` matches entirely. Only the account-level
   identity fields (`app_users.phone` / `customers.phone`, exact-variant matching) remain — which is what
   actually serves this function's documented purpose (merging duplicate accounts for the *same* real
   person), without matching on a field that's explicitly meant to differ from the account owner. Also
   removed the now-dead `lastTenIndianMobileDigits()` helper, which existed solely to feed the removed
   substring match.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing). Confirmed via grep that
   `getCustomerSavedAddressesResolved` has exactly one caller (`customers.controller.ts`'s
   `getResolvedAddresses`, "get my own addresses" with no client-supplied phone hints — already hardened
   against the unauthenticated-query-param version of this same bug class) with no dependency on the
   over-broad merge.
7. `[FIXED 2026-10-01]` `acceptOrder` (`deliveryPartner.controller.ts:816-845`) claimed via `.is('delivery_partner_id', null)` with no `store_orders.status` filter; `addTrackingUpdate` (`tracking.controller.ts:107-134`, `database.service.ts:2406-2446`) let any assigned rider set any `VALID_ORDER_STATUSES` value directly, with no forward-only/OTP guard; and riders could read customer name/phone before accepting.
   Third sub-issue, fixed separately: `getAvailableOrders` (`deliveryPartner.controller.ts`) returned
   `customer_name`/`customer_phone` (from `receiver_name`/`receiver_phone` or an `app_users` lookup)
   directly in every offer payload sent to any online rider browsing available orders — and the rider
   app's `home.tsx` actively displayed it, including a tap-to-call button, before the rider had accepted
   anything. This was a live product behavior, not just a background data leak, so the fix direction was
   confirmed with the user first (hide until accepted, matching how most delivery platforms handle this,
   rather than leaving it or showing a partial field) before changing it.
   Fix: removed `customer_name`/`customer_phone` (and the now-unused `app_users` lookup and
   `customer_id`/`receiver_name`/`receiver_phone` select columns that only fed them) from
   `getAvailableOrders`'s response. Removed the matching pre-accept display (name + call button) from
   the rider app's offer card, along with the now-dead `customer_name`/`customer_phone` type fields and
   two now-unused styles. Confirmed customer contact info remains available immediately after
   acceptance via `getPickupSequence` (the active-delivery screen's endpoint, already
   `assigned_driver_id`-gated and already including `receiver_name`/`receiver_phone`), which the rider
   app's active-delivery screen (`app/delivery/[orderId].tsx`) already displays — so riders don't lose
   the ability to see/call the customer, it's just correctly gated to after they've committed to the
   delivery. Confirmed via grep that `getAvailableOrders` has exactly one route and the rider app is its
   only consumer; the website's driver screens don't reference these fields at all.
   Verified with `npx tsc --noEmit` (clean for both the backend and the rider app) and `npx vitest run`
   (22/22 passing).
   Fix, two parts:
   - `acceptOrder`'s `store_orders` claim now also requires `.not('status', 'in', '(order_cancelled,order_delivered)')`, closing the race where `cancelOrder`'s non-atomic multi-step sequence (item 4) could let a claim land between steps and succeed on an order actually being cancelled. A second, narrower-window guard was added on the follow-up `customer_orders` update too (same status exclusion); if that one loses the race instead, the `store_orders` claim is rolled back (`delivery_partner_id: null`, `status: 'ready_for_pickup'` — the same reset `rejectOrder` already uses) rather than leaving the rider holding a live claim on a cancelled order. Note: confirmed via grep that `POST /delivery-partner/orders/:orderId/accept` (`acceptOrder`) has zero live callers today — every app (rider app, website's `DriverApp.tsx`, legacy `DeliveryPartnerPage.tsx`) only ever calls the offer-based `/delivery-partner/offers/:offerId/accept` (`acceptOffer`), whose underlying `accept_driver_offer()` Postgres function was already fully atomic and correctly order-status-gated (checked during this same audit). So the day-to-day accept flow was never actually exposed to this race — `acceptOrder` is hardened as a matter of principle (same "dead but reachable, still worth closing" reasoning as `addTrackingUpdate` below), not because real traffic was hitting it.
   - `addTrackingUpdate` (`database.service.ts`) now enforces a forward-only `ORDER_STATUS_SEQUENCE` (rejects any transition that isn't strictly forward, `order_cancelled` excepted as a separate terminal branch reachable from anywhere) and requires `customer_orders.delivery_otp_verified_at` to already be set before accepting a transition to `order_delivered` — closing the second, unguarded path to a status the dedicated `markDelivered` endpoint otherwise gates properly on OTP verification. Confirmed via grep that this route (`POST /api/tracking/orders/:orderId/updates`) has zero live callers in either the rider app or the website today — hardened rather than removed, since it's still a registered, `requireRider`-gated endpoint reachable directly.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing).
8. `[MOSTLY FIXED 2026-10-01]` `requireAdmin` (`adminAuth.middleware.ts:17-63`) only checked session validity, never `admins.status`; `requireRider` (`deliveryPartner.controller.ts:247-285`) never checks `is_approved`; `resolveShopkeeperFromToken` (`storeOwner.controller.ts:65-96`) never checked store approval at all. Contrast: `customerAuth.middleware.ts:65-67` *does* check `is_suspended` — the gap was specific to admin/shopkeeper/rider gates. The admin panel had the same gap independently — see section 6.1, finding A1.
   Fix: `requireAdmin` now does a second lookup on `admins.status` and rejects with 401 unless `'active'`. The Supabase migration `20261001000000_is_admin_authenticated_checks_status.sql` adds the same `admins.status = 'active'` join to the `is_admin_authenticated()` SECURITY DEFINER function that gates the `admin_full_access` RLS policy on 9 tables (including `admin_sessions` itself) — this closes the admin-panel side (finding A1) for free, since `secureAdminAuth.ts`'s own session-validity check already treats "no row returned" as "session invalid" and logs out, and that query is itself RLS-gated by this same function. **`[APPLIED 2026-10-01]`** — see section 7 for verification.
   For shopkeepers, `resolveShopkeeperFromToken` deliberately stays approval-agnostic (many callers — document upload/delete, billing info, support messages, profile-change requests — must keep working for a pending/suspended shopkeeper so they can act on admin's feedback); instead, the two customer-facing storefront-gallery mutations that were missing the check pending stores already had elsewhere (`deleteStoreProduct`, `updateProductQuantity`, `updateProductActiveState`) — `addStoreImage` and `deleteStoreImage` — now go through a new `assertOwnsApprovedStore()` helper instead of the approval-agnostic `assertOwnsStore()`.
   For riders, `requireRider` is intentionally left unchanged: it's documented in-code (deliveryPartner.controller.ts:311-317) as deliberately approval-agnostic so a pending rider can still view their own profile/status, and every actual order-mutating action (`acceptOrder`, `acceptOffer`, going online) already re-checks `is_approved` fresh from the DB on every call via `getRiderApprovalState()`/inline checks — confirmed this isn't a stale-session gap like the admin case, since there's no "checked once at login" pattern here to begin with.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing, unaffected).
9. `[FIXED 2026-10-01]` `getDriverLocationsForOrder` (`database.service.ts` ~2490) had no filter
   excluding `order_delivered`/`order_cancelled` — a customer could keep polling a rider's live GPS
   position indefinitely after their own order finished.
   Fix: now fetches the order's `status` after the ownership check and returns `{}` (the same shape
   already used for "no rider assigned yet") once it's `order_delivered`/`order_cancelled`. Found and
   fixed the identical gap in the sibling `isAgentAssignedToCustomer`/`getAgentLocation` path too — its
   own comment explicitly says it "scopes the raw live-location read ... the same way
   `isOrderOwnedByCustomer` scopes order-keyed tracking reads," but had no status filter either, and
   `assigned_driver_id` is never cleared after delivery (kept as history), so a customer could pull a
   past rider's location by id alone the same way. Added
   `.not('status', 'in', '(order_delivered,order_cancelled)')` to its query.
   **Follow-up, fixed later the same day:** `isAgentAssignedToCustomer` also used `.maybeSingle()`, so a
   customer with two active orders on the same rider got a multi-row error, swallowed as "not assigned",
   and was denied the location (same bug class as item 12). Now `.limit(1)` + an array-length check,
   and a real DB error throws instead of reading as "not yours". Covered by `bugfixes.regression.test.ts`
   ("Item 9").
   Confirmed both controllers already treat the resulting empty `{}`/`null` as valid, pre-existing
   states (`getDriverLocations` already returns `{}` for "no rider assigned yet";
   `getAgentLocation` already 404s on `null`), so no frontend changes were needed.
   Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing).
10. `[FIXED 2026-10-01]` `customers.controller.ts` `createAddress` spread `...req.body` into the
    insert; `updateAddress` right below it already correctly used an allowlist — the fix had been
    applied inconsistently between the two.
    Fix: hoisted `updateAddress`'s allowlist into a shared `ALLOWED_ADDRESS_FIELDS` constant and switched
    `createAddress` to build its insert payload from it the same way, rather than duplicating the list a
    second time (duplication is exactly what let the two drift apart in the first place). `customer_id`
    is still always set explicitly from the URL param, never from the allowlist/body.
    Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing). Confirmed every field
    the customer mobile app's `lib/addressService.ts` and the website's `supabase.ts` `createAddress`
    send is a strict subset of the allowlist — including a client-supplied `customer_id` in the website's
    payload, which was already overridden and is now also simply not copied by the allowlist loop.
11. `[FIXED 2026-10-01]` `storeOwner.routes.ts` wired `docUpload.single('file')` ahead of the
    controller on both upload routes; the auth check in `resolveShopkeeperFromToken` ran as the first
    line *inside* the handler, after multer already parsed the upload — an unauthenticated request
    still got its multipart body fully parsed into memory (up to `MAX_DOC_SIZE_BYTES`) before being
    rejected.
    Fix: extracted a new exported `requireStoreOwnerAuth` Express middleware (wrapping
    `resolveShopkeeperFromToken`, which already sends the 401 response on failure) and wired it
    *before* `docUpload.single('file')` on both routes, so an unauthenticated upload is rejected before
    multer does any work. Stashes the resolved id on a new `req.storeOwnerId` (deliberately named
    distinctly from `shopkeeper.controller.ts`'s own unrelated `req.shopkeeperId`, a different route
    family's session check) so `saveVerificationDocument`/`saveBillingInfo` reuse it instead of
    re-resolving the same token a second time. The other 22 call sites of
    `resolveShopkeeperFromToken` are untouched — this only applies to the two routes that also run
    multer.
    Verified with `npx tsc --noEmit` (clean) and `npx vitest run` (22/22 passing). The failure-response
    shape for an unauthenticated request is unchanged (same function, same status/body), so no client
    changes were needed.

**Data / multi-store (medium)**
12. `[FIXED 2026-10-01]` `invoice.controller.ts` `verifyOrderBelongsToShopkeeper` used `.maybeSingle()` on a join; a shopkeeper whose two stores are both allocated on one order got a silently-swallowed multi-row error → 403.
    The sibling `verifyOrderBelongsToRider` had the same bug and a more common trigger. On a multi-store
    pickup, one rider is set on *every* `store_orders` row, so every multi-store delivery slip 403'd for
    its own rider.
    Fix: both now use `.limit(1)` + `data.length > 0` ("is there at least one matching row?"), and a real
    DB error now throws (500 with a located error) instead of reading as "not yours" (403).
    `verifyOrderBelongsToCustomer` matches on the `customer_orders` primary key, so it can only ever
    return one row and was left unchanged.
13. `[FIXED 2026-10-01]` `assignDeliveryAgent` (`database.service.ts`, admin `POST /api/delivery/orders/:orderId/assign`) only wrote `store_orders`, never `customer_orders.assigned_driver_id`.
    That meant every `assigned_driver_id`-gated path ignored an admin-assigned rider: the rider app's
    `getPickupSequence`, `addTrackingUpdate`, and customer live-location reads. The customer's tracking
    also stayed on the old status. The audit turned up three more problems in the same function:
    - no order-status check, so a cancelled or delivered order could be assigned;
    - no rider approval check;
    - `.select().single()` on the `store_orders` update threw on any multi-store order *after* the
      update had already been applied. The admin got a 500, the DB had changed anyway, and no
      history row was written.
    Fix: now mirrors `accept_driver_offer()` (`20260721000000`), the canonical rider-accept path:
    - the rider must be `is_approved` and `status='active'`. `is_online` is deliberately not
      required, because an admin may assign a rider who is about to come online;
    - `customer_orders` gets `assigned_driver_id` + `delivery_partner_assigned` under an atomic
      `.in('status', [pending_at_store, store_accepted, preparing_order, ready_for_pickup])` guard.
      A zero-row match returns 404/409 naming the current status, before `store_orders` is touched;
    - every `store_orders` row is updated (no `.single()`);
    - pending `driver_order_offers` for the order are expired so no other rider can still accept it;
    - the history row is written.

    The response body is now the array of updated `store_orders` rows instead of one row. Grep
    confirms the endpoint has zero callers in the admin panel, website, or any mobile app, so nothing
    reads the old shape.
14. `[FIXED 2026-10-01]` Every `GET /api/invoices/order/:id/*` route (customer, store, delivery, admin) auto-generated via `generateForOrder` with zero order/payment-status check, and `invoice.service.ts` defaulted a missing `payment_status` to `'paid'`. A customer could get a tax invoice for an online order they never paid for, or for a cancelled COD order, and the PDF could read "PAID".
    Fix: new exported `assertOrderInvoiceable()`, called inside `fetchOrderData`, so it covers both
    `generateForOrder` and `regenerateForOrder`. The rules:
    - **COD** orders are invoiceable unless `order_cancelled`. COD orders stay at `payment_status='pending'`
      by design; the shopkeeper gates already treat `payment_method === 'cod'` as payment-ready, so a
      blanket "must be paid" rule would have broken every COD invoice.
    - **Every other method** (razorpay / wallet / split) is invoiceable only once `payment_status` is
      `paid`, `partially_refunded` or `refunded`. A paid-then-refunded order keeps its invoice, since real
      money moved; its PDF shows the refunded status.

    A refused generation returns 409 with a readable message. The `'paid'` fallback is now `'pending'`.
    Invoices that already exist are unaffected, because `getSignedUrl()` serves them before generation is
    attempted. All three automatic generation triggers write `payment_status='paid'` *before*
    generating, so the new guard doesn't race them: `verifyPayment` (`payment.controller.ts`),
    the `payment.captured` webhook, and `payOrderWithWallet` (via the `pay_order_with_wallet` RPC,
    which sets `paid` in the same transaction).
    **UI follow-up (2026-10-01): invoice buttons are now hidden where the backend would refuse.**
    After the fix above, the website (Orders page, Tracking page), the customer app (order detail,
    confirmation screen) and the admin panel all still showed an Invoice button on every order. Tapping
    it on an unpaid or cancelled-COD order produced an error instead of the old wrong invoice. Each app
    now uses a small `isInvoiceAvailable()` helper with the same rule as `assertOrderInvoiceable()`.
    Section 9 has the details.
15. `[FIXED 2026-10-01]` The delivery simulation wrote `order_delivered` unconditionally, after one status read at the start of the run.
    The problem was wider than the final write. The simulation runs for about 5 minutes and writes
    `customer_orders.status` at six points, so a cancellation at *any* point was walked back
    forward: by the customer, a store rejection, or the payment-abandon sweep. During the 2-minute
    shopkeeper wait, its timeout fallback also auto-accepted allocations on an order that had since
    been cancelled.
    Fix (`deliverySimulation.service.ts`):
    - every `customer_orders` status write goes through a new `guardedOrderUpdate()`, which only
      matches rows not in `(order_cancelled, order_delivered)` and aborts the run on a zero-row match;
    - every `store_orders` write carries the same guard;
    - a cheap `assertStillActive()` read runs on each shopkeeper-wait poll, before the timeout
      auto-accept, and before each pickup stop;
    - the history row is now written only after the guarded update matched. It was previously
      `Promise.all`'d alongside the update, so it was written even when the update did nothing;
    - the run ends quietly through a `SimulationAborted` sentinel caught in `runDeliverySimulation`.

    Also removed a dead try/catch fallback on the driver-assignment write. Supabase reports failures in
    `error` and never throws, so the catch branch could never run.

**Performance (medium)**
16. `[PARTIALLY MITIGATED]` The 3 tracking watchdogs are now fire-and-forget (no longer blocking the response), but they still run every poll, and `reBroadcastIfStuck` (`shopkeeper.controller.ts:887-897`) still does a DB read before its in-memory throttle check.
17. `[STILL OPEN]` `assignCandidatesInRadius` (580-589) and the driver-online catch-up path (757-788) still pull all active/approved stores or all `ready_for_pickup` orders and filter by `haversineKm` in JS. `adminActivityLog.controller.ts`'s six queries are `[FIXED 2026-10-01]` — see section 6.1, finding A3.
18. `[PARTIALLY MITIGATED]` Rider `getOrders` gained an opt-in `?limit=` (capped 200) but defaults to unbounded by design (documented); `coupons.controller.ts` → `database.service.ts:1420-1432` `getCoupons()` is still fully unbounded. `adminRiderPayouts.controller.ts`'s `listRiderPayouts` is `[FIXED 2026-10-01]` — see section 6.1, finding A3.
19. `[STILL OPEN]` No `AbortController`/`signal` on any fetch in `directions.service.ts`, `geocoding.service.ts`, `notification.service.ts`, `payment.service.ts`, `roads.service.ts`.
20. `[PARTIALLY MITIGATED]` `customerAuth.middleware.ts:91-101` still writes `session_token_issued_at` every request, but it's now fire-and-forget (`void (async...)`), so it no longer blocks the response.

**Frontend (medium/low)**
21. `[FIXED 2026-10-02]` `DeliveryPartnerPage.tsx:380-382` still sends no `Authorization` header.
    The page (route `/driver-legacy`, linked from nowhere) asked a rider to type their partner ID and
    pushed browser GPS to `PUT /api/tracking/agents/:id/location`. That route is behind `requireRider`
    and also rejects any id other than the logged-in rider's own. The page could never work: every
    update was a 401, logged only to the browser console. Adding a header wouldn't have been enough,
    because the manual-ID design itself conflicts with the backend's own-id check.
    `/driver` (`DriverApp.tsx`) already does the same job properly. The rider logs in, and the location
    is pushed via `/delivery-partner/location` while they're online.
    Fix: deleted `DeliveryPartnerPage.tsx`. `/driver-legacy` now redirects to `/driver`, so an old
    bookmark still lands somewhere that works. Grep confirmed no other references in the website,
    admin panel or backend.
22. `[FIXED]` `ShopPage.tsx` was rewritten around server-side `get_nearby_products_page`/`getNearbyProductsMeta`/`hasNearbyStores`; the old triple-RPC-call pattern is gone.
23. `[PARTIALLY MITIGATED]` `DeliveryMap.tsx` now has real cleanup (`cancelled` flags, `zoomListenerRef.current?.remove()`); `MapLocationPicker.tsx` still has zero `useEffect`/cleanup for its `idle` listener or debounce timeouts.
24. `[FIXED 2026-10-02]` `WishlistPage.tsx:77-92` `remove()` still captures a stale `previous` snapshot vulnerable to concurrent-remove races; `DriverApp.tsx:577-587` `toggleOnline` still has no rollback; `fetchSequence` (295-313) still force-collapses `expandedStops` every 6s.
    - **Wishlist.** Remove A, then remove B before A's request finishes. If A then failed, the whole
      pre-A snapshot was restored, so B came back on screen although the server had deleted it. Now
      only the failed item is re-inserted, at its original position. The single `removingId` is only
      cleared by the removal that set it.
    - **`toggleOnline`.** It flipped the switch optimistically and never flipped it back. A network
      error was swallowed, and a refusal (e.g. the backend's 403 "not yet approved") doesn't throw from
      `fetch` at all. The screen then said "online" and polled for offers while the server still had
      the rider offline. Now it checks `res.ok`, rolls back on any failure, and shows the server's
      reason under the button ("Could not go online: …"). A ref guard plus a disabled button stop a
      double click from sending two requests.
    - **`fetchSequence`.** It ran every 6 s and reset the expanded stops to "first pending stop only",
      collapsing whatever the rider had opened, e.g. a stop where they were typing a pickup code. It now
      auto-expands only on first load or when the next pending stop changes (after a pickup).
25. `[FIXED 2026-10-02]` `CheckoutPage.tsx:182` still reads raw `localStorage.getItem('currentLocation')`, never `LocationContext`.
    The "Delivering to" location lives in two places: `LocationContext.userLocation` (persisted under
    `userLocation`) and a second copy under `currentLocation` that only `Header.tsx` writes. The
    nearby-store filter, and so the stores the cart was built from, reads the context. Checkout read the
    second copy to decide which saved address to preselect, so any path that updated the context
    without that key, or a stale key from another tab, made checkout preselect an address for a
    different location than the cart's.
    Fix: checkout now reads `userLocation` from `LocationContext` (imported as `useDeliveryLocation` to
    avoid clashing with react-router's `useLocation`). It runs at the same point in the address-loading
    effect as before, so preselection behaviour is otherwise unchanged. `Header.tsx` still writes
    `currentLocation` for its own restore-on-reload and is untouched.
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

*(Items 6–8 were re-assessed on 2026-10-02 as **latent**: correct in the code, but no current user can
hit them. See the note after item 8.)*

6. **(High → latent) No store-switcher; `selected_store_id` is set once at first login and never updated.**
   `lib/useSelectedStore.ts:37-40`, seeded only in `app/(tabs)/home.tsx:160-165` (`if (!id)`). A
   shopkeeper with 2+ stores is permanently locked to whichever store the backend returned first —
   inventory, add-products, profile and billing for any other store are silently inaccessible.
7. **(High → latent) Store approval/suspension gate always checks `stores[0]`, not the store actually in
   use.** `lib/storeApproval.ts` (`getPrimaryStore`, `checkStoreApproval`) never honors
   `selected_store_id`, unlike `useSelectedStore`. For a multi-store account this can either lock the
   shopkeeper out of the whole app (store[0] suspended, real store approved) or let them keep
   managing/accepting orders on a store an admin already suspended (store[0] approved, real store
   suspended) — the client-side mirror of backend backlog item 8.
8. **(Medium → latent) Inconsistent multi-store scoping.** Order badges (`incomingOrdersContext.tsx`) and
   invoices (`app/invoice/[orderId].tsx`) correctly aggregate across every store the account owns;
   inventory, profile, billing and the approval gate do not.

   **Re-assessment (2026-10-02): latent, not fixed.** All three items need one account that owns 2+
   stores, and nothing in the product can create one:
   - shopkeeper signup (`storeOwner.controller.ts`) always inserts a *new* `app_users` row with
     exactly one store;
   - neither the admin panel nor the backend has any "add another store" path (grep found no other
     `stores` insert anywhere).

   A read-only check of the live `stores` table (2026-10-02, public anon key) found 9 owners: 8 with
   exactly one store, and one holding 29 seeded demo stores ("Near & Now Store #1–#29", created
   2026-02-24 to 02-28, none approved, none active). No real shopkeeper can reach these bugs today.
   They become real only if multi-store ownership is ever built. At that point #6 (a store switcher —
   a product/UI decision), #7 (make the approval gate read the selected store) and #8 should be done
   together.
   Separately, the 29 demo stores could be cleaned up. That's a product-data decision and was
   deliberately not touched.

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

**B1. (Re-assessed 2026-10-01 → Low, deliberately not changed) `createWalletTopupOrder` sends no idempotency key.**
`payment.service.ts` (~line 285) calls `razorpayRequest('POST','/orders', orderBody)` with no
idempotency key, unlike its two siblings `createPaymentOrder` (168) and
`createAdditionPaymentOrder` (234), which both set one. A retried/double-tapped wallet top-up can
create two separate Razorpay orders for the same intent.
Why this wasn't changed:
- **The siblings key off a persistent row; a top-up has none.** The other two flows use
  `customer_orders.id` / `order_addition_requests.id`. A real key for a top-up would have to come from
  the client, which means changes in three repos (backend, website `walletService.ts`, customer app
  `lib/walletService.ts`).
- **Double taps are already blocked.** Both clients' `handleAddMoney` take a synchronous
  `inFlight` ref guard before the create call (`WalletPage.tsx:146`, `app/wallet.tsx`).
- **The worst case moves no money.** A network-level retry can leave a second Razorpay order in the
  `created` state. Nothing is charged unless the customer pays through that specific checkout sheet,
  and an unpaid order expires on its own.
- **Double-crediting is already impossible.** Wallet credit is idempotent on `razorpay_payment_id`
  (`credit_wallet` RPC, `20260910000000`).

The remaining effect is cosmetic (an extra unpaid order in the Razorpay dashboard). Worth doing only
alongside some other change to the top-up flow.

**B2. (Medium, FIXED 2026-10-01) Admin-only `updateDeliveryStatus` has no status validation.**
`delivery.controller.ts:304-323` only checks `if (!status)` — never validates against the
`VALID_ORDER_STATUSES` enum the rider-facing equivalent (`tracking.controller.ts`) enforces, and has
no forward-only guard. A malformed status value from the admin panel can write straight into
`customer_orders.status`.
Fix: `databaseService.updateDeliveryStatus` now applies the same rules as the admin panel's real
status endpoint (`orders.controller.ts` `updateOrderStatus`):
- an unknown status → 400, before any DB call;
- an already delivered or cancelled order → 409;
- a backward move → 409;
- skip-ahead and cancel-from-anywhere stay allowed, matching the admin data-correction escape hatch
  there.

Errors are `AppError`s, so `sendError` returns the right status with a readable message, not a 500.
Also switched the existence read from the anon `supabase` client + `.single()` to `supabaseAdmin` +
`.maybeSingle()`, so a missing order is a clean 404. Grep confirms
`PUT /api/delivery/orders/:orderId/status` has zero live callers in the admin panel, website, or
apps; it was hardened because the route is registered and reachable.

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
   race conditions, including item 7's third sub-issue (riders reading customer name/phone before
   accepting, fixed in a later pass the same day with the user's product-decision sign-off — see
   item 7's own note). `acceptOrder`'s claim now excludes cancelled/delivered orders (with a rollback
   if the narrower `customer_orders` update loses the race instead); `addTrackingUpdate` now enforces
   forward-only transitions and requires OTP verification before `order_delivered`. `cancelOrder`
   itself is still internally non-atomic (see item 4's updated note) — the exploitable consequence is
   closed, but a fully atomic rewrite (matching `finalize_order_if_ready`'s pattern) remains a
   worthwhile follow-up, not done here.
3. **`[DONE + APPLIED 2026-10-01]` Admin panel A2** — closed the store-approval RLS gap so the UI check
   can't be bypassed; migration applied and verified live (section 7).
4. `[DONE 2026-10-01]` Mobile-app mediums (S1, D1, D2, C1) — all fixed.
5. `[DONE 2026-10-01]` Admin panel A3 — pagination added to activity log and rider payouts.
   A4 deliberately left as-is — see its own note (lowest severity, high regression risk to
   "fix properly" across ~30 routes without miscategorizing one).
6. `[DONE 2026-10-01]` **Every remaining backend High item** (1, 2, 3, 6, 9, 10, 11) — webhook status
   guards and accurate partial/full refund accounting (1, 3); capture-before-validation reordering
   across checkout/add-items/wallet top-up, plus a new order-not-cancelled guard (2); removed the
   over-broad `contact_phone` cross-customer address merge (6); closed the matching live-location leak
   in both `getDriverLocationsForOrder` and the sibling `isAgentAssignedToCustomer` path (9); shared
   allowlist so `createAddress` can no longer be mass-assigned (10); auth-before-multer on both
   document-upload routes (11). Every fix verified with `npx tsc --noEmit` + `npx vitest run` (22/22)
   per-change, plus grep-confirmed caller/consumer checks — see each item's own note in section 4 for
   details. This closes every High-severity item in the `near-and-now` repo that didn't require a
   product decision beyond the one already made (item 7's sub-issue).
7. `[DONE 2026-10-01]` **Backend Mediums 12–15 and B2**, plus two follow-up edge cases found while
   writing tests (item 3's fully-refunded path, item 9's sibling `maybeSingle`). B1 was re-assessed as
   Low and deliberately left alone (see its note). All of them, and the earlier High fixes that
   previously had no automated coverage, are now pinned by a regression suite (section 8).
8. `[DONE 2026-10-02]` Shopkeeper-app 6/7/8 re-assessed as latent (no path creates a multi-store
   account; see the note under section 5 #8). Website 21, 24 and 25 fixed; see section 10.
9. **Next up:** backend reliability — #19 (no timeout/`AbortController` on any Google, Razorpay or
   Expo push call, so a hung upstream hangs the request), then #17/#16/#18 (performance
   leftovers), then #23 (`MapLocationPicker` listener cleanup), then the mobile-app lows (D3, D4, D5,
   C2, rider #10/#11, customer #13).

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

## 8. 2026-10-01 — regression suite and full verification run

Until now, most backlog fixes were verified by `tsc` + the pre-existing 22 tests + code review. None of
those tests touched the changed code (item 1's note said so explicitly). This pass added automated
regression coverage for every backend fix made on 2026-10-01 and re-ran the full check across all six
projects.

**New files**
- `backend/src/test/fakeSupabase.ts` is a recording fake of the Supabase query builder. Each awaited
  chain is recorded with its table, operation, payload, filters and terminal (`single`/`maybeSingle`),
  and returns programmable results. It reproduces PostgREST's row-count rules for
  `.single()`/`.maybeSingle()`, including the multi-row `PGRST116` error, because several of these bugs
  were "maybeSingle errored on 2 rows and the error was ignored". Tests can therefore assert *which
  writes happened and with which guard filter*, not just the return value. Every original bug in
  this list was "the write happened anyway".
- `backend/src/services/bugfixes.regression.test.ts` has 47 tests, grouped by backlog item:

| Backlog item | What the tests pin down |
| --- | --- |
| 1 — webhook guards / refund accounting | `payment.authorized`/`payment.failed` updates carry the `not in (paid,refunded,partially_refunded)` guard, and a zero-row match is a no-op, not an error. `refund.processed` accumulates partial refunds, caps at the order total, and classifies `partially_refunded` vs `refunded`. |
| 3 — `POST /refund` | `amount: 0` → 400; omitted amount on a fully refunded order → 409; overshoot → 409. Razorpay is never called in any of these. A partial refund is recorded on the order. |
| 7 — `addTrackingUpdate` | Backward move → 409; `order_delivered` without a verified OTP → 403. No write in either case. Delivered-with-OTP is allowed. |
| 9 — rider location | Delivered or cancelled order → `{}` without reading `driver_locations`. `getAgentLocation` has the status filter and works with two active orders on one rider. |
| 10 — `createAddress` | Non-allowlisted fields (`id`, `created_at`, a forged `customer_id`) are dropped; the URL customer id always wins. |
| 12 — invoice ownership | A shopkeeper with two stores on one order, and a multi-store-pickup rider, both get their document. No match → 403. A DB error → 500, not 403. |
| 13 — `assignDeliveryAgent` | An unapproved rider, or a non-dispatchable order, → 409 with no writes to `store_orders`. Success sets `customer_orders.assigned_driver_id` under the status guard, updates every `store_orders` row without `.single()`, expires pending offers, and writes history. |
| 14 — invoice eligibility | A 9-case matrix covering COD / online × paid / refunded / pending / failed / cancelled. `generateForOrder` refuses an unpaid online order before creating any `invoices`/`invoice_documents` row. |
| 15 — delivery simulation | Cancelled during the shopkeeper wait → stops with zero writes. A guarded write matching no row → stops with no history row and no `store_orders` write. |
| B2 — admin `updateDeliveryStatus` | Unknown status → 400 with no DB call. Missing → 404. Delivered/cancelled → 409. Backward → 409. Forward writes `customer_orders`, `store_orders` and history. Cancel from mid-flight is allowed. |
| §5 #5 — request ids | A well-formed id is echoed. CRLF, over-length, non-ASCII and empty ids are each replaced with a fresh UUID in both `req.requestId` and the header. |

**Proving the tests can fail (mutation check).** Passing tests only count if they would have caught the bug:
- *Today's fixes:* the suite was run against the pre-fix source (fix files stashed, tests kept).
  **27 of 47 tests failed**, covering every test for items 12, 13, 14, 15, B2, the item-3
  fully-refunded case, and the item-9 `getAgentLocation` case. The first run exposed a gap: the item-12
  "multi-store owner can download" tests passed against the buggy code, because the fake didn't yet
  reproduce `maybeSingle`'s multi-row error. The fake was fixed and those tests now fail on the old
  code as they should.
- *Fixes already committed earlier today:* each guard was knocked out one at a time (authorized-webhook
  status guard, partial-refund classification, `amount <= 0` check, forward-only check, OTP check,
  delivered/cancelled location check, address allowlist, request-id allowlist). **Every mutation
  turned at least one test red**, and each file was restored afterwards (`git status` unchanged).

**Full verification run (2026-10-01, after all fixes in this document)**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` — `near-and-now/backend`, `frontend`, `admin` | clean ×3 |
| `npx tsc --noEmit` — `near-now-store_owner`, `NAT_Near-Now_Rider-`, `nearandnowcustomerapp` | clean ×3 |
| `npx vitest run` — backend | **69/69** (22 pre-existing + 47 new) |
| `npx vitest run` — frontend | 26/26 |
| `npm run build` (backend `tsc`) | succeeds |
| `npx vite build` — frontend, admin | both succeed |

Not covered by automated tests, and still verified only by type-checking and review:
- the mobile-app fixes (S1, D1, D2, C1, section 5 #9/#12). None of the three apps has a test runner
  configured;
- the Supabase migrations (A1/A2/V1/V2). These were verified live against the database, per section 7.

`tsc` also emits the test files into `backend/dist/`. That was already true of the existing
`*.test.ts` files, and `dist/` is gitignored, so it was left as-is.

## 9. 2026-10-01 — invoice buttons follow the backend's invoice rule (follow-up to item 14)

**Why:** item 14 made the backend refuse invoices for unpaid online orders and cancelled COD orders
(409 with a readable message). The apps kept offering an Invoice button on those orders, so a customer
could tap it and get an error. The backend stays the authority; this change only stops offering
something that can only fail.

**The rule.** Each app gets a copy of `isInvoiceAvailable()`, with the same rule as the backend's
`assertOrderInvoiceable()`:
- COD orders → available unless the order is cancelled;
- every other payment method → available only once `payment_status` is `paid`,
  `partially_refunded` or `refunded`.

| App | File(s) | Change |
| --- | --- | --- |
| Website | `frontend/src/utils/invoiceEligibility.ts` (new) | The helper. |
| Website | `pages/OrdersPage.tsx` | The Invoice button on each expanded order is hidden when the order isn't invoiceable. |
| Website | `pages/OrderTrackingPage.tsx`, `hooks/useOrderTrackingRealtime.ts`, `services/trackingApi.ts` | Same for the Tracking page's Invoice tile. The tracking API already returned `payment_status` (it selects `*`) but the page never kept it. It's now typed and carried through, including on the realtime refresh, so the tile appears as soon as a payment lands without a reload. |
| Customer app | `lib/invoiceEligibility.ts` (new) | The helper. |
| Customer app | `app/order/[id].tsx` | "View Tax Invoice" on the delivered-order card is hidden when the order isn't invoiceable. |
| Customer app | `app/order/confirmation/[id].tsx` | The "View Invoice" button is shown only once the order is loaded and invoiceable. "Track Order" (`flex: 1`) fills the row when it's hidden. |
| Customer app | `app/orders.tsx` | A delivered order shows "View Invoice" only if invoiceable; otherwise "View Details". Before, a delivered order that wasn't invoiceable would have fallen through to "Track Order". |
| Admin panel | `admin/src/utils/invoiceEligibility.ts` (new) | The helper. It also accepts the admin panel's mapped `cancelled` label, because `adminService.ts` shows `order_cancelled` as `cancelled`. |
| Admin panel | `admin/src/pages/admin/OrderDetailPage.tsx` | The three download buttons (merchant invoice, customer invoice, delivery slip) are replaced by a one-line reason when the order isn't invoiceable: "available once the payment has been received" or "not issued for a cancelled COD order". Staff see *why*, instead of a missing button or the generic "download failed" alert. |

Not changed:
- The customer app's invoice screen (`app/order/invoice/[id].tsx`). Opened directly (e.g. via deep
  link), it still shows the backend's 409 message, which is the correct fallback.
- Shopkeeper and rider invoice screens. They don't call the invoice API from the mobile apps.

**Keeping the copies in sync.** The rule now exists in four places: the backend, website, admin panel
and customer app. There's no shared package across the Vite apps and the separate mobile repo.
`frontend/src/utils/invoiceEligibility.test.ts` runs the backend's 9-case matrix (from
`bugfixes.regression.test.ts`, "Item 14") through both the website copy and the admin copy, plus the
admin `cancelled` label case: 19 tests. The customer-app copy is in a separate repo with no test
runner, so it isn't covered. Any change to the backend rule must be repeated in
`nearandnowcustomerapp/lib/invoiceEligibility.ts` by hand.

**Regression checks (all run after the change):**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` — backend, frontend, admin, shopkeeper app, rider app, customer app | clean ×6 |
| `npx vitest run` — backend | 69/69 |
| `npx vitest run` — frontend | **45/45** (26 pre-existing + 19 new) |
| `npm run build` (backend), `npx vite build` (frontend, admin) | all succeed |
| ESLint on every touched website file | 13 warnings before, the same 13 after; 0 in the new files |
| Mutation check | Adding `'pending'` to the settled set in the website copy, then separately in the admin copy, makes the parity test fail each time. Both files were restored afterwards. |

Not covered by automated tests: the button visibility itself (no render tests exist for these
pages), and the customer-app screens. Those were checked by type-checking and by reading each
condition against the order fields each screen actually loads.

## 10. 2026-10-02 — website batch (items 21, 24, 25) and shopkeeper re-assessment

The fix details are inline under items 21, 24 and 25 in section 4. The shopkeeper re-assessment is
under section 5 #8.

**New tests (frontend)**

| Test file | Pins down |
| --- | --- |
| `src/pages/WishlistPage.test.tsx` (new) | Remove A, remove B; B's delete succeeds, then A's fails. The list ends as A, C, not A, B, C as before. |
| `src/pages/DriverApp.test.tsx` (new) | (1) A 403 from `PATCH /delivery-partner/status` flips the toggle back and shows the server's reason. (2) A network error flips it back. (3) Success stays online, and a double click sends exactly one request. |
| `src/pages/CheckoutPage.test.tsx` (extended) | With `LocationContext` at the work address and a stale `currentLocation` key pointing at the home (default) address, checkout preselects the **work** address. The test file now mocks `LocationContext`, `walletService` and an authenticated user; the 3 existing tests are unchanged and still pass. |

**Mutation check.** Each fixed file was swapped back to its `HEAD` (pre-fix) version, its test run,
and the file restored and confirmed byte-identical. Copies were used, not `git stash`.
- Wishlist: 1 of 1 failed.
- DriverApp: 3 of 3 failed.
- Checkout: the new test failed, the 3 existing ones passed.

Not covered by an automated test:
- the `fetchSequence` re-collapse fix, which needs a 6-second polling cycle with a pickup in between.
  Verified by reading the new condition;
- the `/driver-legacy` → `/driver` redirect, a one-line `<Navigate>`.

**Full verification run (2026-10-02)**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` — backend, frontend, admin, shopkeeper app, rider app, customer app | clean ×6 |
| `npx vitest run` — backend | 69/69 |
| `npx vitest run` — frontend | **50/50** (45 before + 5 new) |
| `npm run build` (backend), `npx vite build` (frontend, admin) | all succeed |
| ESLint on the four touched pages | 15 problems before, 15 after |

On the ESLint row: one existing `exhaustive-deps` warning in `CheckoutPage` now also names
`getStoredDeliveryLocation`. The effect deliberately runs once per user, and it read the stored
location on that same schedule before this change, so behaviour is unchanged. An `any` this pass first
introduced in `DriverApp` was removed, and `DriverApp` is back at its original 10 warnings. The new
test files have 0 warnings.
