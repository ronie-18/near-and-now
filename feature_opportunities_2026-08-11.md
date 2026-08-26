# Near & Now — Feature Opportunities (2026-08-11, updated 2026-08-26)

Companion to `bug_fixes_2026-07-23.md` (which tracks defects) — this doc tracks **things that aren't broken, just not built yet**, or built inconsistently across the four surfaces (website, admin panel, and the store-owner/rider/customer mobile apps). Every entry below is grounded in an actual read of the code (file:line cited) — nothing here is speculative. Nothing in this doc has been built; it's a menu, not a plan.

**Reading this doc:** each entry has a "Built today" line (what genuinely exists, cited), a "Missing" line (the actual gap), and a **Tier** — Quick win (existing backend/schema, needs UI or small wiring), Medium (real feature, some scaffolding to build on), or Large (from-scratch, needs a product decision before any scoping).

---

## Fixed since 2026-08-11 (were gaps, now built — verified 2026-08-26)

- **Store-approval verification-document review UI.** Previously believed missing (riders had a review modal, stores supposedly didn't). Actually already built: `admin/src/pages/admin/StoresPage.tsx`'s `DocumentReviewModal` (~line 110) fetches `/api/admin/stores/:id/verification-documents` and lets admin approve/reject per document, same pattern as the rider side.
- **Store/rider approval notifications.** Previously believed missing. Actually already built: `backend/src/services/notification.service.ts:460` (`notifyStoreApproved`) and `:477` (`notifyRiderApproved`) both persist a notification row and send a push on approval.
- **Server-verified admin login.** Fixed 2026-07-16 (Jira SCRUM-69, see `bug_fixes_2026-07-23.md` line ~397) — `POST /api/admin/login` does the password check server-side with the service-role client; RLS locked down on `admins`/`admin_sessions`.
- **Rider app: push notification now deep-links to the specific order.** Fixed 2026-08-26 — `NAT_Near-Now_Rider-/app/_layout.tsx`'s notification-tap handler now checks `data.type === "new_order"` and routes to `/delivery/[orderId]` with the real order id, instead of always going to the home tab. `new_order_offer` pushes (multiple candidate orders, none yet accepted) still correctly go to home/the offers list since there's no single order to open. Verified via `tsc --noEmit` clean.

---

## New gaps found 2026-08-26

### Real OS-level push delivery (FCM) on all 3 mobile apps
- **Built today:** In-app notifications persist and display correctly; Expo's push relay is called correctly from the backend.
- **Missing:** No Android app is actually registered with a real Firebase project (no `google-services.json`, no FCM V1 service-account credential in EAS), so `getExpoPushTokenAsync()` fails on every device and no push has ever actually reached a phone. Full root-cause and remaining manual steps (Firebase console + EAS access needed, can't be done by the assistant) are in memory: `fcm_push_notifications_gap.md`.
- **Tier:** Large-ish but not really an engineering gap — it's an infra/account-access blocker, not new code, since the app-side wiring is already done.

### Wishlist
- **Built today:** Nothing — the button on product pages shows a "coming soon" toast (`frontend/src/pages/ProductDetailPage.tsx:416-421`); no table, no endpoints, no persistence anywhere.
- **Missing:** Everything — a `wishlist_items` table, `POST/GET/DELETE` endpoints, and UI in both the website and customer app (product-page toggle + a "My Wishlist" list view).
- **Tier:** Medium — straightforward CRUD feature, but touches 2 client surfaces plus new schema.

---

## Quick wins (existing scaffolding, just needs wiring or UI)

### Customer-app notification preferences
- **Built today:** Backend is fully built and secured but has zero callers — `GET/PUT /users/:userId/preferences` (`backend/src/routes/notifications.routes.ts:14-15`), enforcement logic already live in `notification.service.ts:142-161` (`isCustomerNotificationEnabled`, category `orderUpdates`). The store-owner and rider apps both have a real preferences screen; the customer app has none.
- **Missing:** A toggle screen in `nearandnowcustomerapp` calling the already-working endpoint. Zero backend work needed.
- **Tier:** Quick win — almost pure frontend against a working, secured API.

### Store-owner's 3 dead notification toggles
- **Built today:** `near-now-store_owner/lib/notifications.ts:43-48` shows shopkeepers 4 toggles (`newOrders`, `dailySummary`, `payments`, `systemAlerts`). Preferences persist correctly (AsyncStorage + `PATCH /store-owner/notifications/preferences`, `backend/src/controllers/storeOwner.controller.ts:1413-1433`).
- **Missing:** Only `newOrders` is actually consulted when deciding whether to send a push (`notification.service.ts:135-141,163-175`). Turning off "Payment Updates" or "System Alerts" does nothing — the shopkeeper is shown a control that doesn't work. This is really a bug wearing a feature-gap costume.
- **Tier:** Quick win — wire the existing 3 unused categories into the existing send-decision logic. Small backend change, no new schema/UI.

### Store-owner low-stock tracking
- **Built today:** `products.quantity`/`in_stock` DB columns still exist (confirmed live, not dropped — see `bug_fixes_2026-07-23.md`'s 2026-08-11 entry on removing the *app-level* dead code, which deliberately left the columns in place). A now-orphaned backend endpoint (`PATCH /api/store-owner/products/:productId/quantity`, `backend/src/controllers/storeOwner.controller.ts:217-269`, route at `backend/src/routes/storeOwner.routes.ts:23`) still writes those columns — dead from the app's perspective, but functional.
- **Missing:** No UI anywhere lets a shopkeeper set or see a quantity; no low-stock alert/notification exists. A real feature needs a fresh product decision here — this was previously reviewed (2026-08-04/06) and the user chose "deprecated, remove the app-level code" over "build it out," so treat this as **closed unless revisited**, not an open opportunity, listed here only for completeness.
- **Tier:** N/A — deliberately declined, see `bug_fixes_2026-07-23.md`.

---

## Medium (real feature, meaningful scaffolding already exists)

### Product reviews
- **Built today:** `product_reviews` table exists (`supabase/migrations/20260813000000_baseline_missing_tables_and_types.sql:897-912` — rating 1-5, title, review_text, images, `is_approved`/`is_verified` flags). `master_products.rating`/`rating_count` columns exist and are displayed (`StarRating.tsx` in both the website and customer app). `product_reviews` is `service_role`-only (not even anon-readable) per `20260718000002_fix_missing_table_grants.sql:20-35`.
- **Missing:** No `order_id`/`customer_id` FK on the table (can't verify a review came from a real purchase). Zero backend endpoints — no create, no list, no moderation. Zero submission UI in any of the 4 clients. `rating`/`rating_count` are static seed values (`rating` defaults to `4`) — nothing has ever recomputed them; every rating shown today is fake.
- **To build:** add purchase-linking FK, `POST /reviews` (gated on a delivered order) + `GET /products/:id/reviews`, admin moderation view (reuse the `is_approved` flag the table already has), a rating-recompute step (trigger or on-write), and a "rate your order" prompt post-delivery.
- **Tier:** Medium — most valuable item on this list, but genuinely multi-piece (schema link, API, moderation, recompute, 2+ UI surfaces).

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

### Admin bulk actions (approve/export)
- **Built today:** Every admin list page (stores, riders, orders, customers) is single-row-action only — confirmed zero multi-select/checkbox/bulk-approve UI anywhere in `admin/src/pages/admin/*.tsx`.
- **Missing:** No bulk-approve, no CSV export, on any list.
- **To build:** a shared multi-select table pattern + a generic CSV-export utility; bulk-approve reuses each page's existing single-approve endpoint in a loop (careful: needs the same idempotency/atomic-guard discipline the codebase already applies elsewhere, e.g. `.eq('status', 'pending')` guards).
- **Tier:** Medium — not conceptually hard, but touches many pages if done consistently rather than one-off.

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
