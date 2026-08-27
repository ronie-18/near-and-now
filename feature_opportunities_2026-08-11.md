# Near & Now — Feature Opportunities (2026-08-11, updated 2026-08-26)

Companion to `bug_fixes_2026-07-23.md` (which tracks defects) — this doc tracks **things that aren't broken, just not built yet**, or built inconsistently across the four surfaces (website, admin panel, and the store-owner/rider/customer mobile apps). Every entry below is grounded in an actual read of the code (file:line cited) — nothing here is speculative. Nothing in this doc has been built; it's a menu, not a plan.

**Reading this doc:** each entry has a "Built today" line (what genuinely exists, cited), a "Missing" line (the actual gap), and a **Tier** — Quick win (existing backend/schema, needs UI or small wiring), Medium (real feature, some scaffolding to build on), or Large (from-scratch, needs a product decision before any scoping).

---

## Fixed since 2026-08-11 (were gaps, now built — verified 2026-08-26)

- **Store-approval verification-document review UI.** Previously believed missing (riders had a review modal, stores supposedly didn't). Actually already built: `admin/src/pages/admin/StoresPage.tsx`'s `DocumentReviewModal` (~line 110) fetches `/api/admin/stores/:id/verification-documents` and lets admin approve/reject per document, same pattern as the rider side.
- **Store/rider approval notifications.** Previously believed missing. Actually already built: `backend/src/services/notification.service.ts:460` (`notifyStoreApproved`) and `:477` (`notifyRiderApproved`) both persist a notification row and send a push on approval.
- **Server-verified admin login.** Fixed 2026-07-16 (Jira SCRUM-69, see `bug_fixes_2026-07-23.md` line ~397) — `POST /api/admin/login` does the password check server-side with the service-role client; RLS locked down on `admins`/`admin_sessions`.
- **Rider app: push notification now deep-links to the specific order.** Fixed 2026-08-26 — `NAT_Near-Now_Rider-/app/_layout.tsx`'s notification-tap handler now checks `data.type === "new_order"` and routes to `/delivery/[orderId]` with the real order id, instead of always going to the home tab. Every other push type (`new_order_offer`, `profile_change_reviewed`, `document_rejected`, `rider_approved`) has no single order to deep-link to and is left a no-op on tap, same as before this fix — an earlier draft of this change forced *all* of those to navigate to home too, which would have yanked a rider off an active in-progress delivery screen when tapping an unrelated push; caught in regression review and reverted to the original no-op for non-`new_order` types before landing. Verified via `tsc --noEmit` clean.
- **Customer-app notification preferences.** Fixed 2026-08-26 — new `nearandnowcustomerapp/app/notification-preferences.tsx` screen calls the already-working `GET/PUT /api/notifications/users/:userId/preferences` endpoint to toggle the one server-gated category (`orderUpdates`), matching the store-owner/rider apps' existing preferences-screen pattern. Reachable via a new gear icon on the existing `app/notifications.tsx` header. Verified via `tsc --noEmit` clean.
- **Store-owner's 3 dead notification toggles.** Turned out not to be a gating bug at all — investigation on 2026-08-27 found zero backend push feature ever existed for `dailySummary`/`payments`/`systemAlerts` (grepped every `sendExpoPush` call site in `notification.service.ts`; only `new_order` exists for shopkeepers), so "wire them into the send-decision logic" wasn't actually possible. Per product decision, removed the 3 dead toggles instead — `near-now-store_owner/lib/notifications.ts`'s `NotificationPreferences` and `components/NotificationSettings.tsx`'s toggle list now only have `newOrders`, matching this codebase's own precedent of removing fully-decorative controls (dark mode, low-stock UI) rather than leaving them half-built. Backend `notification_preferences` column is untyped jsonb, so no migration needed. Verified via `tsc --noEmit` clean on both the store-owner app and backend.
- **Product reviews.** Built 2026-08-27 — backend + customer app + admin (website intentionally out of scope this pass, see below). Full writeup moved to its own section below since it's the largest item that's shipped so far.

---

## New gaps found 2026-08-26

### Real OS-level push delivery (FCM) on all 3 mobile apps
- **Built today:** In-app notifications persist and display correctly; Expo's push relay is called correctly from the backend.
- **Missing:** No Android app is actually registered with a real Firebase project (no `google-services.json`, no FCM V1 service-account credential in EAS), so `getExpoPushTokenAsync()` fails on every device and no push has ever actually reached a phone. Full root-cause and remaining manual steps (Firebase console + EAS access needed, can't be done by the assistant) are in memory: `fcm_push_notifications_gap.md`.
- **Tier:** Large-ish but not really an engineering gap — it's an infra/account-access blocker, not new code, since the app-side wiring is already done.

### Wishlist — built 2026-08-27

**Schema** (`20260930370000_wishlist_items.sql`, applied live): new `wishlist_items` table (`customer_id`/`product_id` FKs, unique constraint on the pair, `ON DELETE CASCADE` both ways). service_role-only, same reasoning as `product_reviews`/`customer_saved_addresses` — customer auth is a custom JWT, not Supabase Auth, so RLS can't gate it; all access goes through the backend.

**Backend**: `backend/src/controllers/wishlist.controller.ts` + `routes/wishlist.routes.ts`, mounted at `/api/wishlist` — `GET /` (list), `POST /` (add, idempotent via `upsert(..., { ignoreDuplicates: true })` so re-adding an already-saved product is a no-op success, not a 409), `GET /check/:productId` (lightweight membership check for the product-page heart's initial state), `DELETE /:productId`. Returns pre-tax `basePrice`/`discountedPrice` plus `gstRate`/`isLoose`/`category` — deliberately *not* pre-computing a GST-inclusive price server-side, matching how every other `master_products` read in this codebase works (each client applies GST itself via its own existing helper).

**Customer app**: heart toggle in `app/product/[id].tsx`'s header (checks membership on mount, optimistic toggle with revert-on-failure, prompts login for guests instead of silently failing); new `app/wishlist.tsx` list screen (image, GST-inclusive price, remove, quick add-to-cart), linked from `ProfileMenu.tsx`.

**Website**: heart toggle on `ProductDetailPage.tsx` (previously `showNotification('Wishlist is coming soon!')`) now does the real thing, including a filled/outlined heart icon and "Saved to Wishlist" label swap; new `WishlistPage.tsx` at `/wishlist`, linked from `ProfilePage.tsx`'s account nav.

**Bug caught and fixed before shipping**: the first draft of both list screens displayed and cart-added using the raw `discountedPrice`/`basePrice` fields with no GST applied, and the website version masked this with an `as any` cast on the object passed to `addToCart` — silently bypassing TypeScript's check that would have caught the mismatched field names (`Product.price`, not `discounted_price`/`base_price`) and produced a cart item with `price: undefined`. Fixed on both clients: added `gstRate`/`isLoose` to the API response, applied the same GST-inclusive pricing formula each client already uses elsewhere (`priceWithGst`/`parseGstRatePercent` on the website, matching inline logic on the customer app), and removed the `as any` cast in favor of a fully-typed `Product` object.

**Verification**: `tsc --noEmit` clean across backend/website/customer app; website does a full `vite build`. Migration dry-run tested (`BEGIN...ROLLBACK`) before applying live — confirmed the unique constraint fires on a duplicate insert. The full controller path (check → add → duplicate-add-is-idempotent → confirm exactly 1 row exists → check again → list (verified every field the GST calc needs is present) → remove → check again → remove-when-absent-is-a-no-op) was exercised end-to-end against production through the real `wishlistController` code on a real product (a non-loose, 5%-GST item — ₹77 pre-tax, confirming the GST fix computes correctly on real data) and a real customer, self-cleaning; production confirmed back at its prior state after.

---

## Quick wins (existing scaffolding, just needs wiring or UI)

### Store-owner low-stock tracking
- **Built today:** `products.quantity`/`in_stock` DB columns still exist (confirmed live, not dropped — see `bug_fixes_2026-07-23.md`'s 2026-08-11 entry on removing the *app-level* dead code, which deliberately left the columns in place). A now-orphaned backend endpoint (`PATCH /api/store-owner/products/:productId/quantity`, `backend/src/controllers/storeOwner.controller.ts:217-269`, route at `backend/src/routes/storeOwner.routes.ts:23`) still writes those columns — dead from the app's perspective, but functional.
- **Missing:** No UI anywhere lets a shopkeeper set or see a quantity; no low-stock alert/notification exists. A real feature needs a fresh product decision here — this was previously reviewed (2026-08-04/06) and the user chose "deprecated, remove the app-level code" over "build it out," so treat this as **closed unless revisited**, not an open opportunity, listed here only for completeness.
- **Tier:** N/A — deliberately declined, see `bug_fixes_2026-07-23.md`.

---

## Product reviews — built 2026-08-27, extended same day

Now covers all 4 surfaces: backend, customer app, admin, **and the website** (added same day per explicit ask — the website's "Rate Your Experience" button on `OrderTrackingPage.tsx` now opens a real submission flow instead of a "coming soon" toast; `QuickViewModal.tsx`'s "View All Reviews" was already removed earlier as dead-end UI, unrelated to this feature).

**Schema**: `20260930350000_product_reviews_purchase_linking.sql` — `product_reviews` gained `customer_id`/`order_id` FKs, a partial unique index on `(order_id, product_id)` (one review per product per order), and two triggers (`trg_recompute_master_product_rating_ins_upd`/`_del`) that recompute `master_products.rating`/`rating_count` from real approved reviews. `20260930360000_product_reviews_half_star_rating.sql` — widened `rating` from `integer` to `numeric(2,1)` with a CHECK constraint requiring exact 0.5-multiples in [1, 5] (`(rating * 2) = floor(rating * 2)`), per an explicit ask for a 1★–5★ scale in 0.5 increments (1, 1.5, 2, ..., 5) rather than whole stars only. Both applied live to production; both required dropping/recreating the two triggers around the `ALTER COLUMN TYPE` (Postgres refuses to alter a column type while a trigger's `UPDATE OF` clause references it).

**Backend**: `reviews.controller.ts` + `reviews.routes.ts` (`GET /api/reviews/orders/:orderId/reviewable`, `POST /api/reviews`, public `GET /api/reviews/product/:productId`) + `adminReviews.routes.ts` (`GET/PATCH/DELETE /api/admin/reviews*`, gated on `reviews.view`/`reviews.edit`, mirrored in both `backend/src/utils/adminPermissions.ts` and `admin/src/services/adminAuthService.ts`). Purchase verification resolves `order_items.product_id` (per-store `products.id`) → `products.master_product_id` + `products.store_id` → `stores.name`, and checks the order belongs to the caller and is `order_delivered` — a client can't review a product it didn't buy, before delivery, or off the 0.5 rating grid (`isValidHalfStarRating`, 400 on e.g. 3.2). The reviewable-items response now also carries `storeId`/`storeName` per item so a multi-store order can be grouped by store rather than shown as one flat list.

**Customer app**: `app/order/track/[id].tsx`'s "Rate your order" card (shown only once `status === "order_delivered"`) → `app/order/rate/[id].tsx`, now grouping items under a header per store, with a tap-half-vs-whole-star `StarPicker` (28px hit target, left half = `n - 0.5`, right half = `n`) instead of the original whole-star-only picker. Fixed a real bug caught in this same pass: the optimistic post-submit update was hardcoding the just-submitted rating to `0` instead of the actual value, so "You rated this 0 / 5" would have briefly flashed before the next full reload — now passes the real submitted rating through.

**Website**: new `frontend/src/pages/RateOrderPage.tsx` at `/track/:orderId/rate`, functionally mirroring the customer app screen — store-grouped items, the same half-star tap-position picker (mouse `clientX` instead of RN's `locationX`), loading/error/empty states matching `OrderTrackingPage.tsx`'s existing conventions. `OrderTrackingPage.tsx`'s "Rate Your Experience" button now navigates there instead of showing the toast.

**Admin**: `admin/src/pages/admin/ReviewsPage.tsx` (`/products/reviews`) — pending/approved/all tabs, approve or delete. Star display updated for half-star ratings (`StarRow`: a full gray Star icon with an amber Star clipped to 50%/100% width layered on top, since lucide-react has no half-star icon).

**Known consequence, not a bug:** `EditProductPage.tsx`/`AddProductPage.tsx` still let an admin manually set `rating`/`rating_count` as a marketing seed value — that stays in effect only until the product's first real review lands, after which the trigger takes over and overwrites those two fields on the next review event for that product. Intended effect of making ratings real, not a regression.

**Known edge case, not fixed:** if the exact same master product is purchased from two different stores within one order (rare — most orders have no product overlap across stores), the reviewable list dedupes to one entry (correctly — the DB only allows one review per product per order regardless of which store fulfilled it) but it's attributed to whichever store's order_item happened to be encountered first, not both. No crash or double-count risk, just an attribution nuance in an unlikely scenario.

**Verification**: typechecked clean across backend/admin/customer app/website; admin and website both do a full `vite build`. The half-star migration was dry-run tested (`BEGIN...ROLLBACK`) before being applied for real — confirmed 4.5 accepted, 3.2 and 0.5 correctly rejected by the CHECK constraint. The full controller path was then re-exercised end-to-end against production twice: once for the original build (submit → duplicate-rejected-409 → approve → public-list → rating trigger → admin-list → delete → count reverts), and again after adding store-grouping + half-star support (confirmed every reviewable item now carries `storeId`/`storeName` — one real order in production turned out to genuinely span 2 different stores, a good real-data check for the grouping logic — confirmed rating `4.5` is accepted, stored, and correctly reflected as `master_products.rating = 4.5`, and confirmed off-grid `3.2` is rejected with 400). Both test passes created and immediately deleted their own test review; production data was confirmed back at its prior state (`rating_count: 0`) after each.

### Shopkeeper-facing sales analytics
- **Built today:** Admin panel already has real analytics — `admin/src/pages/admin/ReportsPage.tsx` has category breakdowns, a revenue-trend chart, and top-product data (~lines 63, 132, 643).
- **Missing:** Shopkeepers see raw order lists only (`app/(tabs)/home.tsx`, `previous-orders.tsx`, `payments.tsx` in `near-now-store_owner`) — no best-sellers, no revenue trend, no comparison-to-last-week for their own store.
- **To build:** a per-store version of the same aggregation queries `ReportsPage.tsx` already does, scoped to `store_id` instead of platform-wide, surfaced as a new tab/screen.
- **Tier:** Medium — the query logic already exists as a reference implementation; mostly a scoping + new-screen job, not new math.

### Customer loyalty / rewards program
- **Built today:** A complete, production-grade coupon system already exists — `backend/src/controllers/coupons.controller.ts` (full CRUD), mounted at `/api/coupons` (`backend/src/server.ts:13,100`), with atomic usage-increment (`20260811000000_atomic_coupon_usage_increment.sql`) and usage-release-on-cancel (`20260930150000_release_coupon_usage_on_cancel.sql`) already handling the hard concurrency edge cases.
- **Missing:** No loyalty-points/tier concept, no "earn on every order," no referral mechanism (zero hits for "referral" anywhere in the codebase — code or SQL).
- **To build:** a points ledger (mirror the existing `wallet_transactions` ledger pattern — this codebase already has a working credit/debit ledger design to copy), a points-to-coupon redemption path reusing the existing coupon engine, and separately a referral table + signup-attribution flow if referrals are wanted too.
- **Tier:** Medium for a points program (real design work, but 2 strong existing patterns — coupons + wallet ledger — to build on). Large if a full referral system is bundled in, since that's genuinely unbuilt.

### Admin bulk actions (approve/export) — built 2026-08-27

**Shared utility**: `admin/src/utils/csvExport.ts` — generic `exportToCsv(filename, columns, rows)`, quotes cells containing commas/quotes/newlines, prepends a UTF-8 BOM so Excel doesn't mis-decode non-ASCII characters (store/customer names).

**Bulk-approve** (StoresPage, DeliveryPage — the two pages with a real per-row approve action): a checkbox column + "select all" + a bulk-action bar that appears once ≥1 row is selected. Reuses each page's existing `toggleApproval(row)` one row at a time (sequentially, not in parallel, to avoid racing the shared `approvingId`/notification state) — no new backend endpoint. Critical correctness point, verified in code: the bulk target list is filtered to `!row.is_approved && approvalReadiness(row).ready` before acting, so a mixed selection of approved + pending rows can never accidentally *revoke* an already-approved store/rider (since the underlying function toggles, it doesn't set-to-true) — only pending, document-ready rows are touched. Selection clears automatically on any search/filter change, so the "N selected" count can't overstate what a bulk action would actually touch after switching filters. Clicking with zero eligible rows selected surfaces an error instead of silently doing nothing.

**CSV export**: added to all 4 list pages. Stores/Riders are client-side-filtered (all matching rows already loaded), so their export is a complete, accurate "Export CSV" of the current filter. Orders/Customers are server-paginated — labeled honestly as "Export Page CSV" rather than a plain "Export", since it only covers the currently-loaded page, not every row matching the filter; a full-result export for these two would need a dedicated backend endpoint, not attempted here.

**Verification**: `tsc --noEmit` clean and a full `vite build` succeeds. No backend/schema changes — every action routes through the same single-row endpoints/writes that already worked, called in a loop, so no new database-level testing was needed beyond confirming the guard logic above by reading the code.

---

## Large (from-scratch, needs a product decision before scoping further)

### Scheduled / time-slot delivery
- **Built today:** Nothing. Confirmed zero delivery-window/slot column on `customer_orders` or `store_orders` (checked both full schemas), zero grep hits for `delivery_slot|scheduled|time_slot|requested_delivery|delivery_window` across every migration. Checkout UI (website and customer app) has no "now vs. later" choice.
- **What it would touch:** new column(s) on `customer_orders`, a checkout-time slot picker (needs a product decision: fixed slots? rolling windows? per-store cutoffs?), and — the hard part — dispatch logic would need to *withhold* broadcasting to riders until close to the requested window instead of immediately, which is a real change to the current instant-dispatch assumption baked into `shopkeeper.controller.ts`'s broadcast/allocation flow.
- **Tier:** Large — don't scope further until the actual UX (slot granularity, per-store vs. platform-wide cutoffs) is decided.

### Rider incentive tiers / surge pricing
- **Built today:** `earnings.tsx` (`NAT_Near-Now_Rider-/app/(tabs)/earnings.tsx:41-118`) shows only backward-looking totals (today/week/all-time, average per delivery). Payouts are flat fee + tip only — zero hits for "surge"/"bonus"/"incentive" anywhere in `backend/src`.
- **Missing:** No goals, no tiered bonuses (e.g. "10 deliveries this week = ₹200 bonus"), no demand-based surge pricing.
- **Tier:** Large — this is a pricing/incentive-economics decision first, engineering second.

### Admin real-time/live order map
- **Built today:** Everything in the admin panel is table/list-based — zero map/geo library usage anywhere in `admin/src` (checked for GoogleMap/MapView/Leaflet/Mapbox).
- **Missing:** No live view of active orders/riders on a map, despite `driver_locations` already being tracked live for the customer-facing tracking screens.
- **Tier:** Large-ish but cheaper than it sounds — the location data already exists and is already live (`driver_locations` table, already polled by customer tracking screens); this is mostly a new admin page pulling from data that's already flowing, not a new data pipeline.

### Public API / partner integration (e.g. store POS sync)
- **Built today:** Nothing outward-facing — all existing "webhook"/API-key code is inbound-only (payment-provider webhooks, Google Maps server keys).
- **Tier:** Large, and only worth scoping if there's an actual partner asking for it — pure infrastructure speculation otherwise.

---

## Confirmed non-gaps (checked, nothing to build)

- **Website wallet transaction history** — already fully built with pagination (`frontend/src/pages/WalletPage.tsx:92-134`), at full parity with the customer app's equivalent. Not a gap.
- **i18n / multi-language** — confirmed zero i18n library in any of the 4 repos' `package.json`s. Not started; would be a Large item if ever wanted, not scoped here since nothing suggested it's needed.
- **Dark mode / theming** — confirmed zero theming infrastructure remaining anywhere (the store-owner app's Appearance tab was removed as fully decorative in an earlier session — see `bug_fixes_2026-07-23.md`). Not a gap in the sense of "half-built and abandoned" — it was correctly and completely removed.
- **Admin audit log** — exists, but narrower than the name implies: `ActivityLogPage.tsx` covers exactly 5 review-workflow sources (store/rider profile changes, product submissions, store/rider verification docs). A separate, more general `auditLog.ts` service is called only for admin login events and has **zero UI surfacing it** (`getAuditLogs`/`getSecurityEvents` have no callers) — so login/security events are logged but invisible. Worth flagging as a small, cheap follow-up (surface existing data, no new logging) rather than a full new feature — not scoped in depth here since it's closer to a bug (write-only, never-read data) than a feature gap. **Built 2026-08-13** — see `bug_fixes_2026-07-23.md`'s same-day entry for the full build/verification writeup, including a second bug live click-testing uncovered: this entry's own "write-only" framing turned out to be wrong. `auditLog.ts`'s writes (`logAdminAction`/`logSecurityEvent`/`logFailedLogin`) were *also* silently failing (same anon-key/service-role-only-grant issue as the reads), so nothing was actually being logged at all — confirmed via a live click test showing empty tabs even after a deliberate failed-login attempt. Both sides are now fixed: reads via a new backend route (`adminSecurityLog.controller.ts`/`.routes.ts`, mirroring `adminActivityLog.controller.ts`), writes moved server-side into `AdminController.login()`/`logout()` (which also wired up `is_account_locked()`'s brute-force lockout — built in the original migration but never actually called by the real login flow either). New `SecurityLogPage.tsx` (Admin Actions / Security Events / Failed Logins tabs), gated on a new `security_log.view` permission — deliberately scoped to `admin`/`super_admin` only (not `manager`/`viewer`). The old `admin/src/services/auditLog.ts` was deleted outright (zero remaining callers once both sides moved server-side).

**Re-confirmed 2026-08-13** (full-ecosystem audit spot-check): the three items below were re-checked against current code and remain accurate — website wallet history, i18n, and dark mode are all still genuinely non-gaps, nothing to build.
