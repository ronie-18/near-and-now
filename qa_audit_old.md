# Near & Now — Enterprise QA Audit Report (Full Detail)
**Date:** 2026-05-26  
**Auditor Role:** Senior QA Engineer / Full-Stack Architect / Product Analyst  
**Scope:** All platforms — Backend API, Admin Web, Customer Web, Customer Mobile App, Shopkeeper Mobile App, Delivery Partner Mobile App  
**Total Issues Found:** 137 Tickets

> ## ⚠️ RE-AUDITED 2026-06-16 — see status index below and Part 9
> Every ticket in this document was re-verified against the current codebase on 2026-06-16 (7 parallel deep-dive agents: 4 covering `admin/`/`backend/`/`frontend/`/`supabase/` in this repo, 3 covering the sibling mobile repos `nearandnowcustomerapp/`, `near-now-store_owner/`, `NAT_Near-Now_Rider-/`). Static code analysis only — no live DB/Storage connection, so live-row-count claims (Part 6) remain ⚠️ unconfirmed by design.
> - The **Re-Audit Status Index** immediately below gives a one-line current verdict for every ticket ID in this file.
> - **`QA_AUDIT.md`** is the condensed, currently-maintained version of this report — read it first for the prioritized punch list. This file remains the canonical ticket-ID reference (AUTH-001, SECURITY-007, etc.) that `QA_AUDIT.md` and code comments cross-reference.
> - **Part 9** (new, appended below Part 8) contains every new defect found in the re-audit, ticketed in the same ID scheme as Parts 1–8.
> - Legend: ✅ FIXED · ❌ STILL BROKEN · 🟡 PARTIALLY FIXED · ⚠️ COULD NOT VERIFY (live DB/Storage/device needed) · ⬜ NOT RE-VERIFIED THIS ROUND

---

## Re-Audit Status Index (2026-06-16)

### Part 1 — Backend
| Ticket | Status | Note |
|---|---|---|
| AUTH-001 | ✅ FIXED (2026-06-16) | `session_token` persisted on customer OTP (`auth.controller.ts:320-336`) **and** enforced — new `requireCustomer` middleware (`middleware/customerAuth.middleware.ts`) checks it, wired into `customers.routes.ts` and the customer-scoped `orders.routes.ts` routes with ownership checks. Also fixed SECURITY-008/009 as a side effect by deleting the broken local auth helpers in `invoice.controller.ts`. `tracking`/`notifications`/`coupons`/`delivery` routers and checkout (`/place`,`/create`) remain unauthenticated — tracked separately under SECURITY-012/014/015 (still broken) and a new checkout-auth gap. |
| AUTH-002 | ✅ FIXED | `auth.routes.ts:22-42` now registers `express-rate-limit` (5/10min send, 10/15min verify), keyed by phone. |
| AUTH-003 | 🟡 PARTIALLY FIXED | Bug still literally present in `lib/authService.ts`, but that file is now dead code with zero importers — the live OTP screen sends the correct `role` field. |
| AUTH-004 | ❌ STILL BROKEN | `adminAuthService.ts:119` still unguarded; same pattern now also in `auditLog.ts:37,62,78`. |
| PAY-001 | 🟡 PARTIALLY FIXED | Body is now pre-parsed by `express.json()` and `payment.service.ts:393` still `JSON.stringify`s it — no raw-body capture exists anywhere. Same root cause, still broken in practice despite commit `a174547`'s message. |
| PAY-002 | ❌ STILL BROKEN | `orders.controller.ts:144-153` still returns 501. |
| PAY-003 | ❌ STILL BROKEN | `CheckoutPage.tsx:478` unchanged. |
| PAY-004 | ❌ STILL BROKEN | GSTIN/business name still excluded from `orderData` (`CheckoutPage.tsx:452-475`). |
| PAY-005 | ❌ STILL BROKEN | No idempotency key anywhere in `payment.service.ts`. |
| PAY-006 | ❌ STILL BROKEN | `payment.service.ts:389` unchanged fallback. |
| COUPON-001 | ❌ STILL BROKEN | `min_order_value` still never read. |
| COUPON-002 | ❌ STILL BROKEN, worse | No code anywhere increments `usage_count` at all — the limit can never be enforced regardless of concurrency. |
| COUPON-003 | ❌ STILL BROKEN | `GET /api/coupons/` still has no active/expiry filter. Also now confirmed on the customer mobile app, which bypasses the backend entirely for coupons (see MOBILE-CUST-001). |
| ORDER-001 | ❌ STILL BROKEN | `orders.controller.ts:74`, `database.service.ts:303-306` unchanged. |
| ORDER-002 | ❌ STILL BROKEN | `database.service.ts:cancelOrder` still only touches `store_orders`/`customer_orders`. |
| ORDER-003 | ❌ STILL BROKEN | `deliveryPartner.controller.ts:327` unchanged. |
| ORDER-004 | ❌ STILL BROKEN | `database.service.ts:1372-1379` unchanged. |
| ORDER-005 | ❌ STILL BROKEN | Same 4km cap, no notification, in `shopkeeper.controller.ts:reallocateMissingItems`. |
| ORDER-006 | ❌ STILL BROKEN | `deliveryPartner.controller.ts:639-678` unchanged. |
| ORDER-007 | ❌ STILL BROKEN | Still a 501 stub (`customers.controller.ts:55-63`). Also now confirmed the *route itself* has no auth either (see SECURITY-011). |
| ORDER-008 | ❌ STILL BROKEN | Still a 501 stub (`customers.controller.ts:65-73`). |
| NOTIF-001 | ❌ STILL BROKEN | All 5 methods still `{}`; `sendEmail`/`sendSMS` still `console.log`. |
| NOTIF-002 | ❌ STILL BROKEN | Still queries only `delivery_partners`. |
| NOTIF-003 | ❌ STILL BROKEN | Still returns `[]` unconditionally. |
| NOTIF-004 | ❌ STILL BROKEN | Still no DB write. |
| NOTIF-005 | ❌ STILL BROKEN | Still no DB write. |
| NOTIF-006 | ❌ STILL BROKEN | Still hardcoded `{ email: true, sms: true, push: true }`. |
| NOTIF-007 | ❌ STILL BROKEN | Still echoes input with no write. |
| DELIVERY-001 | ❌ STILL BROKEN | `delivery.controller.ts:startSimulation` still has no auth middleware. |
| DELIVERY-002 | ❌ STILL BROKEN | Both broadcast functions still use delivery address, not store location. |
| DELIVERY-003 | ❌ STILL BROKEN | Still no customer notification on reallocation failure. |
| DELIVERY-004 | ❌ STILL BROKEN | `getOrderTrackingFull` still writes to `stores` on every poll. |
| DELIVERY-005 | ❌ STILL BROKEN | `shopkeeper.controller.ts:broadcastToNearbyDrivers` still has no staleness filter (contrast the correct `delivery.controller.ts` version). |
| WEB-001 | ❌ STILL BROKEN | `CheckoutPage.tsx:803` still has `required` on the email field. |
| WEB-002 | 🟡 PARTIALLY FIXED | Still uses the anon client and still broken in isolation, but `AuthContext.tsx:44` now hydrates from `localStorage` on mount, masking the user-facing symptom for already-logged-in users. |
| WEB-003 | ✅ FIXED | `services/supabase.ts:34` now builds `supabaseAdmin` from the anon key — no service-role key anywhere in `frontend/src`. |
| WEB-004 | ❌ STILL BROKEN | `useOrderTrackingRealtime.ts:141` still runs both unconditionally. |
| WEB-005 | ❌ STILL BROKEN | Still no `AbortController`. |
| WEB-006 | 🟡 PARTIALLY FIXED | Array reference now replaced (top-level re-render fires), but the item object at that index is still mutated in place — latent bug for any future per-item `React.memo`. |
| WEB-007 | ❌ STILL BROKEN | Still runs in parallel; `shipping_address` can still omit lat/lng. |
| BACKEND-001 | ❌ STILL BROKEN | `server.ts` still has no 4-arg error middleware. |
| BACKEND-002 | ❌ STILL BROKEN | Still `express.json()` with no `limit`. |
| BACKEND-003 | ❌ STILL BROKEN | Now 3 confirmed independent copies within the backend alone (`database.service.ts`, `delivery.controller.ts`, `shopkeeper.controller.ts`) plus the rider app's own copy. |
| BACKEND-004 | ❌ STILL BROKEN | `database.service.ts:1406-1408` unchanged. |
| SECURITY-001 | ❌ STILL BROKEN | `hasPermission()` still UI-only; confirmed no RLS/middleware enforces it anywhere. |
| SECURITY-002 | ❌ STILL BROKEN | Still no server-side role check; confirmed zero RLS policy on `admins` table in any migration (see SECURITY-018). |
| SECURITY-003 | ❌ STILL BROKEN | `server.ts:42-45` unchanged. |
| SECURITY-004 | 🟡 PARTIALLY FIXED | `config/database.ts:18-48` now validates the service-role key's JWT role claim and logs loudly — diagnostics fixed, but the fallback to the anon client still happens and DB ops still silently degrade instead of failing closed. |
| SECURITY-005 | ❌ STILL BROKEN | `storeOwner.controller.ts:8-67` unchanged, "TEMPORARY... NOT secure" comment still present. |
| SECURITY-006 | ❌ STILL BROKEN | Still no ownership check on either handler. Also now confirmed on a third handler, `updateStore` (see SECURITY-013). |
| SECURITY-007 | ❌ STILL BROKEN | `invoice.routes.ts:44-47` still has no auth middleware. |
| SECURITY-008 | ✅ FIXED (2026-06-16) | Broken local `requireCustomer` deleted from `invoice.controller.ts`; `invoice.routes.ts` now imports the real, session-token-checking implementation from `middleware/customerAuth.middleware.ts`. |
| SECURITY-009 | ✅ FIXED (2026-06-16) | Broken local `requireShopkeeper` deleted from `invoice.controller.ts`; `invoice.routes.ts` now imports the correct one from `shopkeeper.controller.ts` (`.eq('session_token', token)`). |
| DB-001 | ❌ STILL BROKEN, worse | `database.types.ts:14` has `'completed'` (not a real enum value at all) and is still missing `'paid'`, `'authorized'`, `'cancelled'`, `'partially_refunded'`. |
| DB-002 | ❌ STILL BROKEN | `database.types.ts:3-12` still missing `'picking_up'`. |
| PERF-001 | ❌ STILL BROKEN | `getNearbyStores` unchanged. |
| PERF-002 | ❌ STILL BROKEN | `getProductsWithDetails` unchanged. |
| PERF-003 | ❌ STILL BROKEN | `getProductById` unchanged. |

### Part 2 — Admin Panel
| Ticket | Status | Note |
|---|---|---|
| ADMIN-001 | ❌ STILL BROKEN, worse | Confirmed two parallel auth systems: logout calls `secureAdminLogout()` against `admin_refresh_tokens`, a table the actual login flow (`adminAuthService.ts`) never wrote to — the real `admin_sessions` row from login is never touched at all (see ADMIN-012). |
| ADMIN-002 | ⚠️ NOT REPRODUCIBLE AS DESCRIBED | `auditLog.ts:25-45,50-67` now catch and swallow their own errors internally — cannot currently throw and mask the caller. |
| ADMIN-003 | ❌ STILL BROKEN | `StoresPage.tsx:17,40` still uses the anon client. |
| ADMIN-004 | ❌ STILL BROKEN | `mapDbStatusToFrontend` (447-454) unchanged. |
| ADMIN-005 | ❌ STILL BROKEN | `statusMap` (662-668) unchanged. |
| ADMIN-006 | ❌ STILL BROKEN | `getCustomers` (703-706) still no role filter. |
| ADMIN-007 | ❌ STILL BROKEN | `getOrders`/`getOrderById` still N+1. |
| ADMIN-008 | ❌ STILL BROKEN | `AdminLoginPage.tsx:46-48` still writes to `sessionStorage`. |
| ADMIN-009 | 🟡 PARTIALLY FIXED | Direct browser→Expo call is gone — but the replacement code is now a no-op that fabricates a "Notification sent" success message without sending anything. |
| ADMIN-010 | 🟡 PARTIALLY FIXED | Notification + Appearance prefs now persist to `localStorage`; password persists to DB. The "Payment settings" tab was removed entirely rather than fixed. |

### Part 3 — Customer Mobile App (`nearandnowcustomerapp/`)
| Ticket | Status | Note |
|---|---|---|
| MOBILE-SEC-001 | ❌ STILL BROKEN, worse | Key still bundleable via `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Worse: `lib/supabase.ts:62-69` (`assertSupabaseAdminConfigured`) now *throws* without it, gating `createOrder`, all address CRUD, and session restore — the key can't be safely removed until those flows move to the backend. |
| MOBILE-SEC-004 | ✅ FIXED (2026-06-16) | The app already sent a real persisted `session_token`; the backend's `requireCustomer` was fixed to actually check it (see SECURITY-008), so this is now enforced end-to-end with zero app-side change required. |
| MOBILE-AUTH-001 | 🟡 PARTIALLY FIXED | Still calls `supabaseAdmin` at `lib/authService.ts:135`; symptom now masked by `AuthContext.tsx:72-81` optimistic AsyncStorage hydration for already-logged-in users. Underlying dependency on the privileged key for any *fresh* lookup is unchanged, and is now confirmed load-bearing for purchase/address flows too (see MOBILE-SEC-001). |

### Part 3 — Delivery Partner App (`NAT_Near-Now_Rider-/`)
| Ticket | Status | Note |
|---|---|---|
| MOBILE-AUTH-002 | 🟡 PARTIALLY FIXED | Bug literal still in `lib/authService.ts` but the file has zero importers; live `app/otp.tsx:107` correctly sends `role: "delivery_partner"`. |
| MOBILE-SEC-002 | ❌ STILL BROKEN | Confirmed on customer + rider apps (shopkeeper not independently re-checked this round); no `expo-secure-store` anywhere. |
| MOBILE-SEC-003 | ❌ STILL BROKEN | Confirmed on **both** ends now: client `lib/session.ts` never sets `expiresAt`; server `deliveryPartner.controller.ts:requireRider` (24-43) has no TTL check either. |

### Part 3 — Shopkeeper App (`near-now-store_owner/`)
| Ticket | Status | Note |
|---|---|---|
| MOBILE-AUTH-003 | ❌ STILL BROKEN, worse | `stores[0]` hardcoding has spread from 1 file to 6 (`home.tsx`, `payments.tsx`, `previous-orders.tsx`, `stock.tsx`, `inventory.tsx`, `profile.tsx`) while a correct `hooks/useStore.ts` sits completely unused (zero importers). |
| MOBILE-ORDER-001 | ✅ FIXED | No module-level cache remains; `lib/useSmartPoll.ts` is now AppState-aware. |
| MOBILE-ORDER-002 | 🟡 PARTIALLY FIXED | The broken path (`services/orderService.ts`) still targets non-existent endpoints, but now has zero importers — dead code, not a live inconsistency. |
| MOBILE-ORDER-003 | ⬜ NOT RE-VERIFIED THIS ROUND | |
| MOBILE-ORDER-004 | 🟡 PARTIALLY FIXED (dead code) | Same 4 non-existent endpoints, but the class has zero importers now. |
| MOBILE-ORDER-005 | 🟡 PARTIALLY FIXED (dead code) | Stub unchanged, zero call sites. |
| MOBILE-ORDER-006 | 🟡 PARTIALLY FIXED (superseded) | QR flow replaced entirely by a working `pickup_code` text-display flow; the stub is vestigial. |
| MOBILE-ORDER-007 | 🟡 PARTIALLY FIXED (dead code) | Stub unchanged, zero call sites. |
| MOBILE-ORDER-008 | ❌ STILL BROKEN | `app/(tabs)/home.tsx:104` still hardcodes 0. |
| MOBILE-NOTIF-001 | ❌ STILL BROKEN | Still no `expo_push_token` column path, still no `/api/push-token` route (see MOBILE-NOTIF-003 below). |
| MOBILE-NOTIF-002 | ❌ STILL BROKEN | Still polling-only; push registration itself is also structurally broken (see FCM-001). |
| MOBILE-PAYMENT-001 | ❌ STILL BROKEN | `hooks/usePaymentFlow.ts:72-88` still polls the full window, only short-circuits on `'paid'`. |
| MOBILE-PAYMENT-002 | 🟡 PARTIALLY FIXED | `app/support/payment-options.tsx:131-137` now renders a proper empty state instead of a permanent skeleton; the underlying feature is still unimplemented. |
| MOBILE-BUG-001 | ❌ STILL BROKEN | `app/support/checkout.tsx:262-280`, `lib/orderService.ts:272-280,370` unchanged. |
| MOBILE-UX-001 | ❌ STILL BROKEN | `app/(tabs)/home.tsx:544` unchanged. |
| MOBILE-UX-002 | ❌ STILL BROKEN | `app/otp.tsx:54-59` unchanged race window. |
| MOBILE-UX-003 | ❌ STILL BROKEN | `app/wallet.tsx:37-45,79` unchanged. |
| MOBILE-UX-004 | ✅ FIXED | `app/(tabs)/payments.tsx` now computes real Today/Week/All-Time payout totals from delivered orders. |
| MOBILE-PERF-001 | 🟡 PARTIALLY FIXED | Still no shared singleton file, but now module-scope rather than per-render. |
| MOBILE-PERF-002 | ⬜ NOT RE-VERIFIED THIS ROUND | |
| MOBILE-PERF-003 | ❌ STILL BROKEN | `app/(tabs)/home.tsx:294-317` still polls every 6s regardless of online status (per the code's own comment). |
| MOBILE-PERF-004 | ❌ STILL BROKEN | `hooks/useOrderTracking.ts:78-153` still runs realtime + 5s fallback + separate 2s driver poll, all concurrently. |

### Part 4 — Cross-App & System
| Ticket | Status | Note |
|---|---|---|
| CROSS-001 | ❌ STILL BROKEN | Confirmed still nothing on either side; rider `earnings.tsx`/`profile.tsx` still hardcode `* 0.15`. |
| CROSS-002 | ❌ STILL BROKEN | Confirmed: `shopkeeper.controller.ts:36` uses `session_token`, `invoice.controller.ts:66` uses `id` for the same role — unchanged. |
| CROSS-003 | ❌ STILL BROKEN | Both code paths still diverge as described. |

### Part 5 — Shopkeeper & Rider Profile / Admin Access
| Ticket | Status | Note |
|---|---|---|
| SHOP-PROF-001 | ❌ STILL BROKEN | `app/profile.tsx:403` still passes literal `true`. |
| SHOP-PROF-002 | ❌ STILL BROKEN | `app/profile.tsx:394,415` still ungated. |
| SHOP-PROF-003 | ❌ STILL BROKEN | Zero matches anywhere for `approval_status`/`is_approved`. Contrast the rider app, which implements this correctly (see MOBILE-AUTH-003 area, rider home.tsx:365). |
| SHOP-PROF-004 | ❌ STILL BROKEN | Same — no polling/banner code exists. |
| SHOP-PROF-005 | ❌ STILL BROKEN | `app/profile.tsx:53`, `lib/storage.ts:75-78` still single-image only. |
| CROSS-PROF-001 | ❌ STILL BROKEN | No `profile_change_request` concept anywhere in either app's repo. |
| RIDER-PROF-001 | ❌ STILL BROKEN | `app/(tabs)/profile.tsx:353` still hardcoded `4.8`. |
| RIDER-PROF-002 | ❌ STILL BROKEN | Backend now returns `vehicle_number` (`deliveryPartner.controller.ts:81`) but the profile UI still never displays it; no `vehicle_type`/`vehicle_image_url` anywhere. |
| RIDER-PROF-003 | ❌ STILL BROKEN | Still read-only text only. |

### Part 6 — Live Database & API Audit
| Ticket | Status | Note |
|---|---|---|
| DB-003 | ⚠️ COULD NOT VERIFY | Live DB/PostgREST introspection needed; no backend code calls either spelling. |
| DB-004 | 🟡 PARTIALLY VERIFIED | `product_name` confirmed real via migration; `name`/`phone`/`deleted_at` unverifiable without live DB. |
| DB-005 | ⚠️ COULD NOT VERIFY, contradicted by static evidence | `admin_users` appears nowhere in any tracked migration or app code — if it exists live, it's entirely untracked. |
| DB-006 | ⚠️ COULD NOT VERIFY | Live Storage/schema state. |
| DB-007 | ⚠️ COULD NOT VERIFY (live row count) | The current new-customer signup code path (`auth.controller.ts:294-315`) does insert into `customers` and rolls back `app_users` on failure — looks correct for new signups; the historical gap may predate this code or affect only old rows. |
| DB-008 | ⚠️ COULD NOT VERIFY (live row count) | Mechanism plausible: `upsertCustomerPaymentSnapshot` is only called from `updateOrderPaymentStatus`, so COD orders that never reach that function would have no row. |
| ORDER-009 | 🟡 LIKELY STILL TRUE | Row count unverified, but the silent-swallow mechanism that would cause it is confirmed still present (`orders.controller.ts:97-107`, `console.error('...non-fatal...')`). |
| ORDER-010 | ✅ FIXED (code-level) | `invoice.service.ts:1084` now upserts on `(invoice_id, document_type)` with a check-before-generate at 1113-1120. Historical row counts can't be re-verified, but the bug causing them is closed. |
| DELIVERY-006 | 🟡 LIKELY STILL TRUE | Table and route both confirmed to exist; zero insert call-sites found anywhere in `backend/src`. |
| WEB-008 | ✅ FIXED | Both pages now call `/api/auth/send-otp` and `/api/auth/verify-otp` correctly. |
| MOBILE-ORDER-009 | 🟡 PARTIALLY FIXED (different mechanism) | The dead `services/storeService.ts` call still targets the missing route, but the *live* inventory path now bypasses the backend API entirely via direct Supabase queries (`lib/storeProducts.ts`) — same underlying route gap, no longer a live 404. |
| MOBILE-ORDER-010 | ✅ FIXED | `app/invoice/[orderId].tsx:135` now calls the real `GET /api/orders/:id`. |
| MOBILE-ORDER-011 | ✅ FIXED | Zero remaining `/api/store-owner` or `/api/shopkeeper` references anywhere in the shopkeeper app. |
| MOBILE-ORDER-012 | ✅ FIXED | `app/delivery/[orderId].tsx:96` now correctly sends `allocation_id`. |
| MOBILE-ORDER-013 | ✅ FIXED | `app/signup.tsx:58` now uses `PUT`. |
| MOBILE-ORDER-014 | ✅ FIXED | `hooks/useOrders.ts` and `previous-orders.tsx` all now use the correct bare `/shopkeeper` prefix. |
| ADMIN-011 | ❌ STILL BROKEN (but dead/unused) | `admin/src/services/supabase.ts:889-956` still queries the non-existent table, but no admin page currently calls it — latent, not live. |
| STORAGE-001 | ⚠️ COULD NOT VERIFY | Live Storage state. |
| MOBILE-NOTIF-003 | ❌ STILL BROKEN | `hooks/usePushNotifications.dev.ts:110` still calls the non-existent `/api/push-token`. |

### Part 7 — Email & Push Integration Gaps
| Ticket | Status | Note |
|---|---|---|
| RESEND-001 | ❌ STILL BROKEN | No email SDK installed, no key in `.env.example`, `sendEmail` still `console.log`. |
| FCM-001 | ❌ STILL BROKEN | `lib/notifications.ts:160-168,283-287` still call non-existent routes; 404s silently swallowed. |
| FCM-002 | ❌ STILL BROKEN | All three sub-parts confirmed still broken (route missing, send-path still `delivery_partners`-only; DB column unverifiable live but consistent with route gap). |

### Part 8 — Additional Findings
| Ticket | Status | Note |
|---|---|---|
| WEB-009 | ❌ STILL BROKEN | `CartContext.tsx:32` still hardcodes ₹30; `utils/deliveryFees.ts` calculator still unwired. Now also confirmed duplicated on the customer mobile app as a hardcoded ₹25 (see MOBILE-CUST-002). |

---

## Executive Summary

The Near & Now hyperlocal commerce platform is a monorepo (Express/TypeScript backend + React SPA frontend + React Native Expo mobile apps) backed by Supabase PostgreSQL with RLS. The codebase is under active development with 22+ recent migrations. This audit covers a deep dive of every controller, service, hook, screen, and context file across all six sub-applications.

**Codebase Health Assessment:**
- Architecture is conceptually sound — role-scoped auth, atomic offer acceptance via DB RPCs, realtime + polling hybrid tracking
- Core business logic has significant gaps: notification system entirely stubbed, payout system entirely absent, 8 endpoints return 501, invoice auth is completely broken
- Security posture has critical gaps: service-role key in APK, UUID used as Bearer token, store owner controller reads userId from query param, invoice endpoint has zero auth
- Admin panel has its own internal inconsistencies: mixes anon and admin Supabase clients, sends push directly to Expo from browser

**Release Readiness Verdict: BLOCKED — 17 launch blockers identified**

---

## Critical Production Risks Table

*Re-audit status column added 2026-06-16.*

| Risk | Affected Flow | Impact | Ticket | Re-Audit Status |
|------|--------------|--------|--------|--------|
| Invoice endpoint has no auth | Invoice generation | Full customer PII exposed to any caller | SECURITY-007 | ❌ STILL BROKEN |
| storeOwner.getStores reads userId from query param | Store owner API | Any caller can impersonate any store owner | SECURITY-005 | ❌ STILL BROKEN |
| Service-role key in APK | Customer mobile app | Full DB breach via decompiler | MOBILE-SEC-001 | ❌ STILL BROKEN, worse — now structurally load-bearing for core purchase flow, see Part 9 |
| Customer uses UUID as Bearer token | Customer API | Any observer can forge auth | MOBILE-SEC-004 | ✅ FIXED (2026-06-16) |
| Webhook HMAC always fails | Razorpay webhooks | Payment status never auto-updated | PAY-001 | 🟡 PARTIALLY FIXED — root cause unchanged despite commit `a174547` |
| Customer token never persisted | All customer APIs | Silent auth bypass | AUTH-001 | ✅ FIXED (2026-06-16) — token persisted and now enforced by `requireCustomer` on customers/orders/invoice routes |
| updateOrderStatus returns 501 | Order management | No REST-level status management | PAY-002 | ❌ STILL BROKEN |
| All notification methods empty | Entire order lifecycle | Zero customer/partner notifications | NOTIF-001 | ❌ STILL BROKEN |
| No payout system exists | Rider + shopkeeper financials | Platform cannot operate commercially | CROSS-001 | ❌ STILL BROKEN |
| supabaseAdmin silently falls back to anon key | All privileged DB ops | RLS blocks all backend-only operations in misconfigured env | SECURITY-004 | 🟡 PARTIALLY FIXED — diagnostics hardened, fallback behavior unchanged |
| cancelOrder does not cancel allocations | Order cancellation | Riders/shopkeepers process cancelled orders | ORDER-002 | ❌ STILL BROKEN |
| Delivery simulation endpoint unauthenticated | Delivery lifecycle | Anyone can corrupt any live order | DELIVERY-001 | ❌ STILL BROKEN — and now also true of `tracking.routes.ts` (SECURITY-012) |
| All in-app notification DB methods are stubs | Notification inbox | Notification inbox permanently empty | NOTIF-003/004/005 | ❌ STILL BROKEN |
| No rate limiting on OTP | Auth endpoints | Twilio draining + OTP brute-force | AUTH-002 | ✅ FIXED |
| CORS wildcard when ALLOWED_ORIGINS unset | Backend | Cross-origin attacks in prod | SECURITY-003 | ❌ STILL BROKEN |
| **NEW:** Half the backend's routers have zero auth at all | Orders, addresses, tracking, coupons, delivery partners | Anyone who knows/guesses a UUID reads/writes other users' data | SECURITY-010/011/012/015 | ❌ NEW, CRITICAL |
| **NEW:** Two parallel admin auth systems — logout doesn't invalidate the real session | Admin panel | Stolen admin token valid up to 12h after "logout" | ADMIN-012 | ❌ NEW, CRITICAL |
| **NEW:** Admin invoice endpoint has zero auth | Admin invoice download | Any customer's PII retrievable by guessing an order ID | SECURITY-016 | ❌ NEW, CRITICAL |

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

---

## JIRA TICKETS — PART 5: SHOPKEEPER & RIDER PROFILE / ADMIN ACCESS (Added 2026-05-26)

---

### SHOP-PROF-001 · HIGH · P1
**Summary:** Shopkeeper document number field is always editable — `editing` prop hardcoded to `true`  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/app/profile.tsx:403` — `<Field label="Document Number" ... editing />` passes the JSX boolean shorthand `editing` which evaluates to the literal `true`, not the component's `editing` state variable. The field is permanently an active `TextInput` regardless of whether the user has clicked the Edit button.  
**Current Behavior:** Document number can be changed at any time without clicking Edit.  
**Suggested Fix:** Change `editing` (boolean shorthand) to `editing={editing}` to pass the state variable.  
**Severity:** High | **Priority:** P1

---

### SHOP-PROF-002 · HIGH · P1
**Summary:** Shopkeeper document image upload and document type picker are not gated by edit mode  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/app/profile.tsx:415` — `onPress={pickDocImage}` has no `editing` check. `near-now-store_owner/app/profile.tsx:394` — the document type picker `onPress={() => setDocPickerVisible(true)}` likewise has no `editing` check. Compare with store image (line 295) and owner image (line 323) which correctly use `onPress={editing ? pickStoreImage : undefined}`.  
**Current Behavior:** Users can change their document type, upload a new document image, and save directly to the DB at any time — no Edit button required.  
**Suggested Fix:** Gate all three: `onPress={editing ? pickDocImage : undefined}`, `onPress={editing ? () => setDocPickerVisible(true) : undefined}`.  
**Severity:** High | **Priority:** P1

---

### SHOP-PROF-003 · HIGH · P1
**Summary:** No admin approval gate on online/offline toggle — stores can go live immediately after registration  
**Affected Apps:** Shopkeeper Mobile App, Backend  
**Root Cause:** `near-now-store_owner/app/(tabs)/home.tsx` — the online/offline toggle calls `PATCH /api/store-owner/stores/{id}/online` with no check on admin approval status. A newly registered store can toggle itself online with zero admin review. The delivery partner app gates the equivalent toggle behind `driverStatus !== "active"` with a 30-second polling loop to detect approval.  
**Suggested Fix:** Add an `approval_status` field to the stores record (e.g. `pending | approved | rejected`). Prevent the toggle when `approval_status !== 'approved'`. Poll or use realtime to detect when admin grants approval.  
**Severity:** High | **Priority:** P1

---

### SHOP-PROF-004 · MEDIUM · P2
**Summary:** No approval-status polling for shopkeeper — no feedback on when admin approves their store  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** The delivery partner app polls `GET /delivery-partner/profile` every 30 seconds while pending and shows a banner when status changes to `active`. The shopkeeper app has no equivalent polling and no UI showing approval state. After registering, the shopkeeper has no indication of their pending status or when they will be allowed to go online.  
**Suggested Fix:** Mirror the rider pattern: poll the store status every 30 seconds while `approval_status === 'pending'`; show an inline banner; enable the toggle only when approved.  
**Severity:** Medium | **Priority:** P2

---

### SHOP-PROF-005 · MEDIUM · P2
**Summary:** Store images support only a single image — multi-image upload and carousel/scroll are not implemented  
**Affected Apps:** Shopkeeper Mobile App  
**Root Cause:** `near-now-store_owner/app/profile.tsx:53` — `storeImageUri: string | null`. Single value, not an array. No gallery picker, no horizontal carousel, no scrollable image row. The Supabase bucket `store-images` and DB column `image_url` support one URL. Multiple store photos (interior, menu, signage) are a standard shopfront feature.  
**Suggested Fix:** Change state to `storeImageUris: string[]`, use `allowsMultipleSelection: true` in the image picker, upload each, store as an array column or a separate `store_images` table, render as a `FlatList` horizontal carousel.  
**Severity:** Medium | **Priority:** P2

---

### CROSS-PROF-001 · HIGH · P1
**Summary:** No admin notification when Edit button is clicked — 24-hour change-approval workflow missing in both apps  
**Affected Apps:** Shopkeeper Mobile App, Delivery Partner Mobile App, Backend, Admin Web  
**Root Cause:** Neither `near-now-store_owner/app/profile.tsx` nor `NAT_Near-Now_Rider-/app/(tabs)/profile.tsx` sends any event to the backend when the Edit button is pressed. Changes are saved directly to the DB via `PATCH /api/store-owner/stores/{id}` and `PATCH /delivery-partner/profile` with no admin awareness, no approval queue, and no audit trail. The intended design is: user clicks Edit → backend creates a `profile_change_request` record → admin is notified within 24 hours → admin approves/rejects → only then is the change committed.  
**Suggested Fix:** Create `profile_change_requests` table with `requester_id`, `requester_type`, `requested_changes` (JSONB), `status` (pending/approved/rejected), `created_at`, `reviewed_at`. Add backend endpoints to submit and review requests. Add admin panel UI. Send push notification to admin on new request. Block direct PATCH on sensitive fields until request is approved.  
**Severity:** High | **Priority:** P1

---

### RIDER-PROF-001 · HIGH · P1
**Summary:** Delivery partner rating is hardcoded at 4.8 — not sourced from actual user ratings  
**Affected Apps:** Delivery Partner Mobile App  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/profile.tsx:353` — `<Text style={styles.statValue}>4.8</Text>` is a hardcoded string literal. There is no `delivery_partner_ratings` table, no rating collection flow, and no `GET /delivery-partner/stats` endpoint that aggregates a real average. Every rider always shows 4.8 regardless of their actual performance.  
**Suggested Fix:** Create `delivery_partner_ratings` table. Allow customers to rate deliveries post-drop-off. Expose average via `/delivery-partner/stats`. Replace hardcoded `4.8` with the fetched value; display `--` when no ratings yet.  
**Severity:** High | **Priority:** P1

---

### RIDER-PROF-002 · HIGH · P1
**Summary:** Vehicle type selector and vehicle image upload are missing from the delivery partner profile  
**Affected Apps:** Delivery Partner Mobile App, Backend  
**Root Cause:** The backend `delivery_partners` table has only a `vehicle_number` column (populated at signup). There is no `vehicle_type` column (bike/scooter/cycle) and no `vehicle_image_url` column. `NAT_Near-Now_Rider-/app/(tabs)/profile.tsx` has no vehicle type picker, no vehicle photo upload, and does not even display the `vehicle_number` that was collected during signup. The intended design is one vehicle photo per partner.  
**Suggested Fix:** Add `vehicle_type` (enum: bike/scooter/cycle/other) and `vehicle_image_url` to `delivery_partners`. Add a vehicle section to the profile screen with a type selector and image upload (gated by edit mode). Upload image to a new `vehicle-images` Supabase Storage bucket.  
**Severity:** High | **Priority:** P1

---

### RIDER-PROF-003 · MEDIUM · P2
**Summary:** Document image upload missing from delivery partner profile — only text fields exist  
**Affected Apps:** Delivery Partner Mobile App, Backend  
**Root Cause:** `NAT_Near-Now_Rider-/app/(tabs)/profile.tsx` lines 369–403 render `verification_document` and `verification_number` as read-only `Text` components. There is no document image upload, no image preview, and no Supabase Storage bucket for rider documents. The shopkeeper app correctly uploads document images to the `store-documents` bucket. Delivery partners cannot submit scanned/photographed documents for admin verification.  
**Suggested Fix:** Add a `documents` section to the profile screen (gated by edit mode/admin approval flow). Create a `rider-documents` Supabase Storage bucket. Add a `verification_document_url` column to `delivery_partners`. Add `PATCH /delivery-partner/documents` backend endpoint.  
**Severity:** Medium | **Priority:** P2

---

## JIRA TICKETS — PART 6: LIVE DATABASE & API AUDIT (2026-05-26)

*Findings from direct Supabase REST API inspection and cross-app route analysis conducted May 2026. All bugs confirmed against the live database — not local SQL files.*

---

### DB-003 · HIGH · P1
**Summary:** Supabase RPC `alculate_customer_order_total` has a typo — missing leading `c`  
**Affected Apps:** Backend  
**Root Cause:** The function registered in Supabase is named `alculate_customer_order_total` (confirmed via OpenAPI introspection of the live DB). Any backend or client code calling `calculate_customer_order_total` (the correct spelling) receives a "function not found" error from PostgREST. The function is effectively unreachable under its intended name.  
**Suggested Fix:** Run `ALTER FUNCTION alculate_customer_order_total RENAME TO calculate_customer_order_total;` in the Supabase SQL editor. Update any call-sites to use the corrected name.  
**Severity:** High | **Priority:** P1

---

### DB-004 · MEDIUM · P2
**Summary:** `products` table has four spurious columns that do not belong — schema pollution from a bad migration  
**Affected Apps:** Backend  
**Root Cause:** The `products` table (which exists solely to join `stores` to `master_products`) contains four extra columns that should not be there: `name` (duplicates `master_products.name`), `phone` (a phone number on a product record — structurally wrong), `product_name` (further duplication of `master_products.name`), and `deleted_at` (soft-delete column with no application code using it). These were introduced via a migration that incorrectly targeted the `products` table. Any ORM or type-gen tool consuming this schema will expose these garbage columns in product-related TypeScript types.  
**Suggested Fix:** Create a migration to `ALTER TABLE products DROP COLUMN name, DROP COLUMN phone, DROP COLUMN product_name, DROP COLUMN deleted_at;` after verifying no code writes to these columns.  
**Severity:** Medium | **Priority:** P2

---

### DB-005 · HIGH · P1
**Summary:** Two separate admin identity tables exist with cross-wired foreign keys — admin auth is structurally split  
**Affected Apps:** Backend, Admin Web  
**Root Cause:** The database has both an `admins` table (3 rows, used by the current admin panel auth flow) and an `admin_users` table (separate set of records). Foreign keys are cross-wired: `admin_sessions` and `admin_activity_logs` reference `admin_users.id`, while `admin_refresh_tokens` and `audit_logs` reference `admins.id`. The two tables are not linked to each other. This means session records created in `admin_sessions` can never be joined to the `admins` table for validation, and audit records in `audit_logs` cannot be joined to `admin_sessions`. Any code path that tries to cross-reference these will silently return empty results.  
**Suggested Fix:** Decide on one canonical admin table (`admins` is preferred — it has role/permission columns). Migrate all FK references to point to `admins.id`. Drop `admin_users` after migration. Update `admin_sessions` and `admin_activity_logs` FK constraints accordingly.  
**Severity:** High | **Priority:** P1

---

### DB-006 · LOW · P3
**Summary:** `master_products_old` backup table is still publicly accessible via the REST API  
**Affected Apps:** Backend  
**Root Cause:** The `master_products_old` table (a pre-migration backup of the product catalog) is still present in the `public` schema and therefore exposed by PostgREST. It has no primary key constraint (no `id*` in the OpenAPI definition) and no RLS policies. Any caller with the anon key can read its full contents. The table serves no production purpose.  
**Suggested Fix:** Drop the table: `DROP TABLE master_products_old;`. If a backup is needed, move it to a non-public schema before dropping from `public`.  
**Severity:** Low | **Priority:** P3

---

### DB-007 · HIGH · P1
**Summary:** `customers` profile rows exist for only 5 of 18 `app_users` — profile creation is not firing for most users  
**Affected Apps:** Backend, Customer Web, Customer Mobile App  
**Root Cause:** Live DB shows 18 rows in `app_users` but only 5 rows in the `customers` table (which stores extended profile data: name, address, landmark, delivery instructions, etc.). This means 13 registered customers have no profile record. Any backend query that JOINs `app_users` to `customers` will return no data for 72% of users — address resolution, delivery instructions, and profile display will all silently fail for those accounts. The root cause is that the customer profile insert is not triggered consistently after OTP verification, likely because the new-user branch in `auth.controller.ts` omits or skips the `customers` table insert.  
**Suggested Fix:** Audit `auth.controller.ts` verify-OTP path for the customer role. Ensure that on first registration a `customers` row is created. Add a backfill migration for the 13 existing users.  
**Severity:** High | **Priority:** P1

---

### DB-008 · MEDIUM · P2
**Summary:** 15 `customer_orders` have no corresponding `customer_payments` row — payment records silently absent for 21% of orders  
**Affected Apps:** Backend  
**Root Cause:** Live DB shows 70 rows in `customer_orders` but only 55 in `customer_payments`. The 15 gap orders either went through the COD path (which may intentionally skip payment record creation) or the payment record insert failed silently. If these are all COD orders, the missing payment rows are expected but should have a COD record created for accounting. If any are online-payment orders, the payment record was lost — which would mean those payments cannot be refunded or reconciled. The backend does not distinguish these two cases in its current logging.  
**Suggested Fix:** Add a COD `customer_payments` row (with `status: 'pending'` and `payment_method: 'cod'`) for every COD order at placement time, matching the same accounting approach used for online orders. Log and alert on any online order missing a payment row.  
**Severity:** Medium | **Priority:** P2

---

### ORDER-009 · CRITICAL · P0
**Summary:** `order_store_allocations` rows exist for only 26 of 70 orders — multi-store dispatch is not running for 63% of orders  
**Affected Apps:** Backend, Shopkeeper Mobile App, Delivery Partner Mobile App  
**Root Cause:** Live DB shows only 26 rows in `order_store_allocations` against 70 rows in `customer_orders`. The allocation table is the backbone of the multi-store dispatch system — without a row here, shopkeepers never receive the order, no pickup code is generated, and driver dispatch cannot reference a store for pickup. The 44 unallocated orders are effectively invisible to the entire fulfillment chain. Root cause is likely that `orders.controller.ts:placeCheckout` creates the order but the allocation-row creation block fails silently (possibly due to the `alculate_customer_order_total` RPC typo or a null store resolution) and the error is swallowed without rolling back the order.  
**Suggested Fix:** Wrap the entire order placement flow in a transaction or Supabase RPC so that if allocation creation fails the order is also rolled back. Add explicit error logging on the allocation insert. Cross-reference with DB-003 (RPC typo) as a likely contributing cause.  
**Severity:** Critical | **Priority:** P0

---

### ORDER-010 · MEDIUM · P2
**Summary:** `invoice_documents` has 87 rows for only 29 invoices — duplicate PDFs being generated per order  
**Affected Apps:** Backend  
**Root Cause:** Live DB shows 87 rows in `invoice_documents` against 29 rows in `invoices` — an average of ~3 PDF documents per invoice. The `POST /api/invoices/generate/:orderId` endpoint has no auth middleware (see SECURITY-007) and no idempotency guard. Each time a page loads or a customer retries the download, a new PDF record is inserted rather than returning the existing one. This wastes Supabase Storage space and creates confusion about which document is canonical.  
**Suggested Fix:** Before inserting a new `invoice_documents` row, check if one already exists for the given `invoice_id` and `document_type`. Return the existing document URL if found. This requires fixing SECURITY-007 first so the endpoint is gated.  
**Severity:** Medium | **Priority:** P2

---

### DELIVERY-006 · HIGH · P1
**Summary:** `tracking_events` table is permanently empty — the POST endpoint exists but no code ever calls it  
**Affected Apps:** Backend, Customer Web, Customer Mobile App  
**Root Cause:** Live DB shows 0 rows in `tracking_events` despite the table being created in migration `20260427000001_tracking_enhancements.sql`. The backend has a `POST /api/tracking/orders/:orderId/updates` endpoint (`tracking.controller.ts`) that is designed to write to this table, but no part of the backend order lifecycle (order placement, shopkeeper acceptance, driver assignment, pickup, delivery) ever calls this endpoint or writes to `tracking_events` directly. All tracking state visible to customers is derived exclusively from `order_status_history`. The `tracking_events` table and its endpoint are entirely dead.  
**Suggested Fix:** In each status transition (accept allocation, assign driver, pick up, deliver), insert a corresponding `tracking_events` row with `event_type`, `title`, `description`, and `icon`. This enables the rich timeline UI the table was designed to power. Alternatively, create a DB trigger on `order_status_history` that auto-populates `tracking_events`.  
**Severity:** High | **Priority:** P1

---

### WEB-008 · MEDIUM · P2
**Summary:** Website's internal DriverApp.tsx and ShopkeeperApp.tsx call wrong auth endpoint paths — both test flows are broken  
**Affected Apps:** Customer Web  
**Root Cause:** `frontend/src/pages/DriverApp.tsx` and `frontend/src/pages/ShopkeeperApp.tsx` (internal web-based test interfaces for the driver and shopkeeper flows) make auth calls to `POST /api/auth/otp` and `POST /api/auth/verify`. Neither endpoint exists — the correct paths are `POST /api/auth/send-otp` and `POST /api/auth/verify-otp`. Both test apps fail at the login step with a 404 and cannot be used for any manual QA of the delivery or shopkeeper flow from the web.  
**Suggested Fix:** In both files, replace `/api/auth/otp` with `/api/auth/send-otp` and `/api/auth/verify` with `/api/auth/verify-otp`.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-009 · HIGH · P1
**Summary:** Shopkeeper inventory screen calls `GET /store-owner/stores/:storeId/products` — this route does not exist in the backend  
**Affected Apps:** Shopkeeper Mobile App, Backend  
**Root Cause:** `near-now-store_owner/services/storeService.ts` and `near-now-store_owner/app/(tabs)/inventory.tsx` make a request to `GET /store-owner/stores/:storeId/products` to load the store's product list. This route is not registered anywhere in `storeOwner.routes.ts` or any other route file. The inventory screen returns a 404 on every load, making inventory management completely non-functional. The backend only has `PATCH /store-owner/products/:productId/quantity` and `DELETE /store-owner/products/:productId` — no GET for listing a store's products.  
**Suggested Fix:** Add `GET /store-owner/stores/:storeId/products` to `storeOwner.routes.ts` and implement the controller handler to query `products` JOIN `master_products` WHERE `store_id = :storeId`.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-010 · HIGH · P1
**Summary:** Shopkeeper invoice screen calls `GET /api/store-owner/orders/:id` — this route does not exist  
**Affected Apps:** Shopkeeper Mobile App, Backend  
**Root Cause:** The shopkeeper app's invoice screen makes a `GET /api/store-owner/orders/:id` request to fetch order details for invoice display. No such route exists in `storeOwner.routes.ts`. The `/store-owner` router has no GET order endpoints at all. The invoice screen will always 404, making invoice viewing on the shopkeeper side non-functional. (Note: `/api/invoices/order/:orderId/store` does exist and is the correct invoice download endpoint, but this screen appears to be trying to fetch raw order data separately.)  
**Suggested Fix:** Either add `GET /store-owner/orders/:orderId` to `storeOwner.routes.ts` returning order+items data, or update the invoice screen to use the existing `/api/invoices/order/:orderId/store` endpoint and remove the separate order fetch.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-011 · MEDIUM · P2
**Summary:** Shopkeeper app calls `/api/store-owner/*` but backend router is mounted at `/store-owner/*` — requests 404 in production  
**Affected Apps:** Shopkeeper Mobile App, Backend  
**Root Cause:** Several screens in `near-now-store_owner` construct API URLs with the `/api/store-owner/` prefix (e.g. `store-owner-signup.tsx`, `inventory.tsx`). The backend `server.ts` mounts the store owner router at `/store-owner` (no `/api` prefix). In development this may be masked by a proxy rewrite, but in production all these requests will 404. The shopkeeper router is intentionally outside the `/api` namespace (same as `/shopkeeper` and `/delivery-partner`), so the clients need to remove the `/api` prefix from their `store-owner` calls.  
**Suggested Fix:** Audit all API calls in the shopkeeper app and strip the `/api` prefix from any URL targeting `store-owner/*`. Alternatively, re-mount the backend router under `/api/store-owner` for consistency — but this requires coordinating the change with all callers.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-012 · HIGH · P1
**Summary:** Delivery partner app calls pickup code verification with `:storeId` param but backend expects `:allocationId`  
**Affected Apps:** Delivery Partner Mobile App, Backend  
**Root Cause:** `NAT_Near-Now_Rider-/app/delivery/[orderId].tsx` constructs the verify-code URL as `POST /delivery-partner/orders/:orderId/stores/:storeId/verify-code`, passing the `store_id` from the pickup sequence. The backend route in `deliveryPartner.routes.ts` is `POST /delivery-partner/orders/:orderId/stores/:allocationId/verify-code` — it expects the `order_store_allocations.id` (UUID), not the `store_id`. The handler looks up the allocation by its primary key, so passing a `store_id` will always return "allocation not found" and the pickup code verification step will never succeed for any delivery.  
**Suggested Fix:** Update `delivery/[orderId].tsx` to pass `stop.allocation_id` (not `stop.store_id`) in the URL. Verify that the pickup sequence endpoint (`GET /delivery-partner/orders/:orderId/pickup-sequence`) returns the `allocation_id` field; add it if missing.  
**Severity:** High | **Priority:** P1

---

### MOBILE-ORDER-013 · MEDIUM · P2
**Summary:** Delivery partner signup.tsx sends PATCH to `/api/delivery/partners/:partnerId` but the backend expects PUT  
**Affected Apps:** Delivery Partner Mobile App, Backend  
**Root Cause:** `NAT_Near-Now_Rider-/app/signup.tsx` submits the new rider's registration details using `PATCH /api/delivery/partners/:partnerId`. The backend `delivery.routes.ts` registers this as `PUT /api/delivery/partners/:partnerId`. Express does not treat PUT and PATCH as interchangeable — a PATCH request to this path returns 404. New rider profile saves (vehicle number, address, verification document) after OTP verification are silently dropped.  
**Suggested Fix:** Either change `signup.tsx` to use `PUT` instead of `PATCH`, or add a `PATCH` alias on the backend route. `PUT` is semantically more correct here since the call replaces the full partner profile.  
**Severity:** Medium | **Priority:** P2

---

### MOBILE-ORDER-014 · CRITICAL · P0
**Summary:** Shopkeeper `hooks/useOrders.ts` calls `/api/shopkeeper/*` — wrong prefix, all order operations in the hook are broken  
**Affected Apps:** Shopkeeper Mobile App, Backend  
**Root Cause:** `near-now-store_owner/hooks/useOrders.ts` constructs URLs with an `/api/shopkeeper/` prefix:  
- `GET ${API_BASE}/api/shopkeeper/orders` (line 117)  
- `POST ${API_BASE}/api/shopkeeper/allocations/:id/accept` (line 160)  
- `POST ${API_BASE}/api/shopkeeper/allocations/:id/reject` (line 71)  

The backend mounts the shopkeeper router at `/shopkeeper` with **no `/api/` prefix** (confirmed in `server.ts`). All three calls return 404 in production. `useOrders.ts` is the primary hook driving the order accept/reject flow — it is distinct from and not the same as the app-screen-level calls already documented in MOBILE-ORDER-011 (which covers the `/api/store-owner/` prefix on store management screens). This means the **core order management functionality of the shopkeeper app is completely broken** via this hook.  

Note: `near-now-store_owner/app/(tabs)/previous-orders.tsx` (lines 273, 297, 387, 420) makes the same mistake independently, calling `/api/shopkeeper/orders` and `/api/shopkeeper/allocations/*` directly. The broken calls span both the hook layer and the screen layer.  
**Suggested Fix:** In `hooks/useOrders.ts` and `app/(tabs)/previous-orders.tsx`, change all `${API_BASE}/api/shopkeeper/*` URLs to `${API_BASE}/shopkeeper/*`. Cross-reference with MOBILE-ORDER-011 (same pattern for `/store-owner/`).  
**Severity:** Critical | **Priority:** P0

---

### ADMIN-011 · HIGH · P1
**Summary:** Admin panel queries `newsletter_subscriptions` table which does not exist in Supabase — admin will crash on affected pages  
**Affected Apps:** Admin Web  
**Root Cause:** `admin/src/services/adminService.ts` (or a related admin service file) calls `supabase.from('newsletter_subscriptions')`. Live DB inspection confirms this table is **not present** in the Supabase public schema — it does not appear in the PostgREST OpenAPI spec or any migration file. Any admin page that triggers this query will throw a PostgREST 404/error, crashing the component or returning empty data without surfacing the missing table as a visible error. The table was likely planned but never created.  
**Suggested Fix:** Either create the `newsletter_subscriptions` table (with `id`, `email`, `name`, `subscribed_at`, `is_active` columns and appropriate RLS) if newsletters are a planned feature, or remove the `from('newsletter_subscriptions')` calls from the admin service until the feature is built.  
**Severity:** High | **Priority:** P1

---

### STORAGE-001 · LOW · P3
**Summary:** Two product image storage buckets exist (`product-image` and `product-images`) — one is empty and unused, causing confusion  
**Affected Apps:** Backend, Admin Web  
**Root Cause:** Live Supabase Storage has both `product-image` (0 files, created 2026-01-18T12:36) and `product-images` (1 file, created 2026-01-18T13:13). The second was likely created to correct a naming mistake and the first was never deleted. Any code that uploads to `product-image` stores files in a bucket nothing reads from, and vice versa — the inconsistency means a product image upload could go to either bucket depending on which client code is running. With 44,562 master products and only 1 file in the active bucket, most products rely on external image URLs or have none at all.  
**Suggested Fix:** Delete the empty `product-image` bucket. Confirm all upload code references `product-images`. Consider auditing why only 1 of 44,562 products has a file in Storage (most likely using external URLs stored in `master_products.image_url` — verify this is intentional).  
**Severity:** Low | **Priority:** P3

---

### MOBILE-NOTIF-003 · MEDIUM · P2
**Summary:** Customer app push token registration calls `POST /api/push-token` — this route does not exist in the backend  
**Affected Apps:** Customer Mobile App, Backend  
**Root Cause:** `nearandnowcustomerapp/hooks/usePushNotifications.dev.ts:110` calls `apiFetch('/api/push-token', { method: 'POST', body: { token } })`. No such route is registered in `server.ts` or any route file — the backend has no `/api/push-token` endpoint. The Expo push token is captured from the device but the HTTP call to persist it returns 404. This is distinct from (but compounds) MOBILE-NOTIF-001 (no `expo_push_token` column in `app_users`) and NOTIF-002 (backend `sendPushNotification` only queries `delivery_partners`): even if the column and query were fixed, the token would still never be saved because the API route is missing.  
**Suggested Fix:** Add `PATCH /api/auth/push-token` (or `PATCH /delivery-partner/push-token` pattern) to the backend, guarded by customer auth middleware, that writes the token to `app_users.expo_push_token`. This must be implemented alongside MOBILE-NOTIF-001 (add column) and NOTIF-002 (update query) for push to work end-to-end.  
**Severity:** Medium | **Priority:** P2

---

## JIRA TICKETS — PART 9: NEW FINDINGS FROM THE 2026-06-16 RE-AUDIT

*All tickets below are new defects found during the 2026-06-16 re-audit that were not in the original 2026-05-26 report. Numbered as a continuation of the existing ID scheme.*

---

### SECURITY-010 · CRITICAL · P0 · ✅ FIXED 2026-06-16
**Summary:** `orders.routes.ts` has no authentication or ownership checks on any route
**Affected Apps:** Backend
**Root Cause:** `GET /:orderId`, `GET /customer/:customerId`, `POST /:orderId/cancel` (`orders.routes.ts:61-66`) register zero auth middleware. `getOrderById`/`cancelOrder` never verify the caller owns the order.
**Fix applied:** All three routes now require the new `requireCustomer` middleware (`middleware/customerAuth.middleware.ts`); `orders.controller.ts` adds an explicit `order.customer_id !== req.customerId` → 403 check in `getCustomerOrders`, `getOrderById`, and `cancelOrder`. `POST /place`/`POST /create` (checkout) remain unauthenticated — out of this ticket's original scope, tracked as a follow-up.
**Severity:** Critical | **Priority:** P0

---

### SECURITY-011 · CRITICAL · P0 · ✅ FIXED 2026-06-16
**Summary:** `customers.routes.ts` has no authentication on any address route
**Affected Apps:** Backend
**Root Cause:** `customers.routes.ts:7-11` — `GET/POST /:customerId/addresses`, `PATCH/DELETE /addresses/:addressId` have zero auth middleware. Separate from the already-known 501-stub issue (ORDER-007/008) — even once implemented, these routes would still have no caller verification.
**Fix applied:** All 5 routes now require `requireCustomer`; `getAddresses`/`createAddress` add ownership checks (`customerId !== req.customerId` → 403). `getResolvedAddresses` now derives the user id from the authenticated token instead of a client-supplied query param (see new ticket SECURITY-018 for a related disclosure bug found and fixed in the same pass). `updateAddress`/`deleteAddress` are gated too but remain 501 stubs — ORDER-007/008 unchanged.
**Severity:** Critical | **Priority:** P0

---

### SECURITY-012 · CRITICAL · P0
**Summary:** `tracking.routes.ts` has no authentication — anyone can forge order status updates
**Affected Apps:** Backend
**Root Cause:** `POST /orders/:orderId/updates` (`tracking.routes.ts:18`) has no auth middleware. The handler writes arbitrary status/location/notes and overwrites `customer_orders`/`store_orders` status for the given order — same severity class as DELIVERY-001 but on a different router.
**Severity:** Critical | **Priority:** P0

---

### SECURITY-013 · HIGH · P1
**Summary:** `storeOwner.controller.ts updateStore` has no ownership verification
**Affected Apps:** Backend
**Root Cause:** `updateStore` (353-393) only checks that *a* Bearer header is present — never validates it or checks store ownership. Any caller can PATCH any store's name/address/phone/images/verification document. Third handler in this controller with this exact gap (alongside SECURITY-005, SECURITY-006).
**Severity:** High | **Priority:** P1

---

### SECURITY-014 · MEDIUM · P2
**Summary:** `notifications.routes.ts` has no authentication on any route
**Affected Apps:** Backend
**Root Cause:** `GET /users/:userId`, `PUT /:notificationId/read`, `PUT /users/:userId/read-all`, `POST /send`, `GET/PUT /users/:userId/preferences` (`notifications.routes.ts:8-23`) have zero auth middleware. Currently low-impact since the backing functions are stubs (NOTIF-003 through NOTIF-007), but `POST /send` already triggers a real notification call — becomes a spam/exposure vector once those stubs are implemented.
**Severity:** Medium | **Priority:** P2

---

### SECURITY-015 · HIGH · P1
**Summary:** `coupons.routes.ts` and `delivery.routes.ts` have zero authentication — full CRUD on coupons and delivery partners is open to anyone
**Affected Apps:** Backend, Admin Web
**Root Cause:** `coupons.routes.ts:8-16` and `delivery.routes.ts:8-30` register GET/POST/PUT/DELETE with no auth middleware at all. `admin/src/pages/admin/OffersPage.tsx` and `DeliveryPage.tsx` call these endpoints directly. Any unauthenticated caller who finds the API base URL can create/delete coupons or delivery partner records, bypassing Supabase RLS entirely via the backend's own service-role client — worse than the anon-client issues elsewhere because there's no RLS backstop at all.
**Severity:** High | **Priority:** P1

---

### SECURITY-016 · CRITICAL · P0
**Summary:** `getAdminInvoice` has zero authentication — full customer invoice data exposed to anyone who guesses an order ID
**Affected Apps:** Backend, Admin Web
**Root Cause:** `invoice.controller.ts:getAdminInvoice` (255-285) has no auth check whatsoever. Compounded by the admin UI's own Bearer token for this route being permanently empty — `OrderDetailPage.tsx:120` reads `localStorage.getItem('admin_id')`, a key nothing in the admin app ever writes (admin identity actually lives in `sessionStorage['adminData']`). Even if that were fixed, the backend route still has no check.
**Severity:** Critical | **Priority:** P0

---

### SECURITY-017 · HIGH · P1
**Summary:** No RLS policy on the `admins` table exists in any tracked migration
**Affected Apps:** Backend, Admin Web, Supabase
**Root Cause:** Neither `20260515000000_admin_tables_and_seed.sql`, `20260515000002_admin_data_access_rls.sql`, nor any other migration contains `ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY` or any `CREATE POLICY` referencing `admins`. The single most sensitive table in the system (password hashes) has its actual live RLS state entirely outside version control.
**Severity:** High | **Priority:** P1

---

### SECURITY-018 · HIGH · P1 · ✅ FOUND AND FIXED 2026-06-16 (not in the original audit)
**Summary:** `getResolvedAddresses` let any caller pull in another account's saved addresses by passing their phone number as a query param
**Affected Apps:** Backend
**Root Cause:** `customers.controller.ts:getResolvedAddresses` (now fixed) forwarded client-supplied `phone`/`customerPhone` query params straight into `database.service.ts:getCustomerSavedAddressesResolved`, which merges in *every* `app_users`/`customers`/`customer_saved_addresses` row matching those phone numbers — independent of the `userId` param and independent of the (separately tracked, also-fixed) total lack of auth on this route. An attacker who knew or guessed a target's phone number could retrieve their full name, saved addresses, and delivery instructions. Discovered while implementing the AUTH-001/SECURITY-011 fix, not in the original 2026-05-26 audit.
**Fix applied:** The controller now derives the user id from `req.customerId` (the authenticated session) only, and calls the service with an empty phone-hints array — the service already independently looks up the authenticated user's own phone from `app_users`/`customers` server-side, so no client-supplied hint is needed for the legitimate "merge my own accounts across phone formats" use case.
**Severity:** High | **Priority:** P1

---

### ADMIN-012 · CRITICAL · P0
**Summary:** Two parallel, inconsistently-wired admin auth systems — logout never invalidates the real session
**Affected Apps:** Admin Web, Supabase
**Root Cause:** `adminAuthService.ts` (direct-DB login, writes `admin_sessions`) and `secureAdminAuth.ts`/the `admin-auth` edge function (JWT-based, reads/writes `admin_refresh_tokens`) coexist. `AdminLoginPage.tsx:33` logs in via the former exclusively. Route guards (`AdminRoutes.tsx:25,32`) and logout buttons (`AdminHeader.tsx:4`, `AdminSidebar.tsx:24`) use the latter. Net effect: clicking Logout clears `sessionStorage` locally but never touches the real `admin_sessions` row created at login — a stolen/leaked `x-admin-token` stays valid for its full 12-hour TTL regardless of logout. This is the precise mechanism behind the already-known ADMIN-001.
**Severity:** Critical | **Priority:** P0

---

### ADMIN-013 · HIGH · P1
**Summary:** `CustomerDetailPage` order-history filter compares the wrong field — always empty
**Affected Apps:** Admin Web
**Root Cause:** `CustomerDetailPage.tsx:27` filters `o.customer_id === id`, but `getOrders()` maps the field as `user_id` (`adminService.ts:529`). The filter always evaluates `undefined === id` → false. Every customer's order history table renders empty regardless of actual order count.
**Severity:** High | **Priority:** P1

---

### ADMIN-014 · MEDIUM · P2
**Summary:** Admin login rate limiting is in-memory/client-side only — trivially bypassed
**Affected Apps:** Admin Web
**Root Cause:** `utils/rateLimit.ts` is a singleton in-memory `Map` that resets on every page refresh. The DB-backed `is_account_locked()` RPC (5 attempts/15min) is a real backstop, but the advertised client-side throttle is cosmetic and doesn't apply to anyone scripting the Supabase REST API directly.
**Severity:** Medium | **Priority:** P2

---

### ADMIN-015 · MEDIUM · P2
**Summary:** Password-strength schemas defined but never used — weak passwords accepted
**Affected Apps:** Admin Web
**Root Cause:** `admin/src/schemas/admin.schema.ts:11-39,41-68` enforce upper/lower/digit/special-char requirements but are never imported anywhere. The actually-used `CreateAdminPage.tsx:65-68`/`EditAdminPage.tsx:110-113` only check `length < 8` — an 8-character password like `aaaaaaaa` is accepted in practice.
**Severity:** Medium | **Priority:** P2

---

### ADMIN-016 · LOW · P3
**Summary:** Several admin pages parse `sessionStorage['adminData']` directly instead of using the shared `getCurrentAdmin()` helper
**Affected Apps:** Admin Web
**Root Cause:** `AdminManagementPage.tsx:125-126`, `CreateAdminPage.tsx:33-34`, `EditAdminPage.tsx:38-39` each independently `JSON.parse(sessionStorage.getItem('adminData'))` with no try/catch, duplicating logic that already exists in `secureAdminAuth.ts:getCurrentAdmin()` (211-223).
**Severity:** Low | **Priority:** P3

---

### ADMIN-017 · LOW · P3
**Summary:** `admin/vercel.json` has no backend rewrite — relies entirely on `VITE_API_URL` being set correctly
**Affected Apps:** Admin Web
**Root Cause:** Unlike the root `vercel.json` (which the `45db3e4` commit updated with explicit `/store-owner/(.*)`, `/shopkeeper/(.*)`, `/delivery-partner/(.*)` rewrites), `admin/vercel.json` has only an SPA fallback (`/(.*) → /index.html`). If `VITE_API_URL` is ever unset on the admin's own Vercel project, every `fetch()` call silently becomes a same-origin request to the admin's static site. Currently low-impact since no admin page calls the bare-prefix routers — a configuration risk, not a live bug.
**Severity:** Low | **Priority:** P3

---

### PAY-007 · MEDIUM · P2
**Summary:** Payment flow throws a hard error on legacy zero-total orders instead of charging ₹0 silently
**Affected Apps:** Backend
**Root Cause:** `payment.service.ts:createPaymentOrder` (118-125) throws "Invalid order amount in database" when `total_amount <= 0`. Since `database.service.ts:createCustomerOrder` (the legacy `POST /api/orders` path, ORDER-001) always writes `total_amount: 0`, any payment attempt against an order created via that path now hard-fails with an explicit exception rather than silently creating a ₹0 Razorpay charge. Surfacing-wise this is an improvement (visible failure vs. silent ₹0 charge), but it means the legacy order-creation path is now fully blocking, not just incorrect.
**Severity:** Medium | **Priority:** P2

---

### ENV-001 · MEDIUM · P2
**Summary:** `RAZORPAY_WEBHOOK_SECRET` and email-provider keys are referenced in code but absent from both `.env.example` files
**Affected Apps:** Backend
**Root Cause:** `payment.service.ts:7,389` reads `process.env.RAZORPAY_WEBHOOK_SECRET` (present in the real `.env`, but no template entry exists in `/.env.example` or `backend/.env.example`), making PAY-006 more likely in real deployments since operators have no prompt to set it. Likewise no `RESEND_API_KEY` (or any provider key) appears in either example file, consistent with RESEND-001 never being wired up.
**Severity:** Medium | **Priority:** P2

---

### ENV-002 · LOW · P3
**Summary:** Stale and undocumented frontend Vite env vars
**Affected Apps:** Customer Web
**Root Cause:** `.env.example` documents `VITE_SUPABASE_SERVICE_ROLE_KEY`, which nothing in `frontend/src` reads anymore (since WEB-003 was fixed). Conversely `VITE_ENCRYPTION_KEY` is read by `frontend/src/utils/encryption.ts:5` (itself dead/unused code) but is undocumented anywhere and silently falls back to the hardcoded literal `'default-key-change-in-production'`.
**Severity:** Low | **Priority:** P3

---

### ENV-003 · LOW · P3
**Summary:** `backend/.env.example` documents non-`VITE_`-prefixed Supabase vars that don't exist in the real root `.env`
**Affected Apps:** Backend
**Root Cause:** `backend/.env.example:6,9,15` documents `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (no prefix), but the actual root `.env` only has the `VITE_`/`EXPO_PUBLIC_`-prefixed variants. Functional today only because `database.ts:15-16,32-33` falls back across both naming schemes — exactly the kind of documentation drift that has caused real service-role-key incidents before in this codebase (see SECURITY-004's history).
**Severity:** Low | **Priority:** P3

---

### WEB-010 · MEDIUM · P2
**Summary:** `OrderTrackingPage` "Invoice" link points to a non-existent backend route
**Affected Apps:** Customer Web
**Root Cause:** `OrderTrackingPage.tsx:738` links to `/api/invoices/${orderId}`. No such route exists — the real routes are `/api/invoices/order/:orderId/{customer,store,delivery}`. Always 404s. Contrast `OrdersPage.tsx:252`, which calls the correct path.
**Severity:** Medium | **Priority:** P2

---

### WEB-011 · HIGH · P1
**Summary:** Address update/delete/set-default bypass the backend entirely, hitting Supabase directly with the anon client
**Affected Apps:** Customer Web
**Root Cause:** `frontend/src/services/supabase.ts:1188` (`updateAddress`), `:1246` (`deleteAddress`), `:1269` (`setDefaultAddress`) always call `supabaseAdmin.from('customer_saved_addresses')` directly — unlike `getUserAddresses`/`createAddress`, which correctly route through `/api/customers/...`. This depends entirely on RLS permitting anon writes, a separate, undocumented failure mode on top of the backend's own 501 stubs (ORDER-007/008).
**Severity:** High | **Priority:** P1

---

### WEB-012 · LOW · P3
**Summary:** `ProtectedRoute` component defined but never used — every protected page reimplements its own guard
**Affected Apps:** Customer Web
**Root Cause:** `frontend/src/components/ProtectedRoute.tsx` is a fully-built auth guard never wrapped around any route in `App.tsx`. `CheckoutPage`, `ProfilePage`, `OrdersPage`, `AddressesPage` each duplicate their own inline redirect guard instead — works today, but is drift risk for any future page author.
**Severity:** Low | **Priority:** P3

---

### WEB-013 · LOW · P3
**Summary:** "Claim GST credit" checkout copy is misleading given PAY-004
**Affected Apps:** Customer Web
**Root Cause:** `CheckoutPage.tsx:1090` — "Claim GST credit up to 18% on the order" is shown next to the GSTIN toggle, but since GSTIN/business name are never sent to the backend (PAY-004), no GST credit or invoice line is ever actually generated.
**Severity:** Low | **Priority:** P3

---

### MOBILE-CUST-001 · MEDIUM · P2
**Summary:** Customer app coupons screen bypasses the backend entirely, never filters expired coupons
**Affected Apps:** Customer Mobile App
**Root Cause:** `app/product/coupons.tsx:38-46` queries `supabaseAdmin.from('coupons')` directly, filters only `is_active`, never checks `expires_at`. The customer-app-side instance of COUPON-003, but worse — it doesn't even reach the backend's partially-filtered `/active` endpoint.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-CUST-002 · MEDIUM · P2
**Summary:** Customer app hardcodes a flat ₹25 delivery fee, ignoring distance — duplicate of WEB-009 in a second codebase
**Affected Apps:** Customer Mobile App
**Root Cause:** `constants/fees.ts:3,7-9` — `DELIVERY_FEE = 25`, used unconditionally in `calcOrderTotal`. Real per-item distance is computed (`lib/distanceUtils.ts`) but only used for a UI warning, never for pricing. Fixing WEB-009 on the web does not fix this — it's a separate codebase with its own hardcoded value.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-CUST-003 · MEDIUM · P2
**Summary:** Customer app calls the Google Maps API directly from the device instead of through the backend's existing proxy
**Affected Apps:** Customer Mobile App, Backend
**Root Cause:** `app/location/add.tsx`, `edit.tsx`, `select-map.tsx`, `app/profile-setup.tsx` all call `maps.googleapis.com` directly using a bundled `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. The backend already has `backend/src/routes/places.routes.ts` providing exactly this proxy (`/autocomplete`, `/details`, `/geocode`, `/reverse-geocode`, `/directions`, `/road-route`) — zero references to it anywhere in the customer app. The Maps key is extractable from the APK and usable against the project's billing quota by anyone who decompiles it.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-CUST-004 · MEDIUM · P2
**Summary:** Customer app invoice screen is entirely fabricated client-side, never calls the real backend invoice endpoint
**Affected Apps:** Customer Mobile App
**Root Cause:** `app/order/invoice/[id].tsx:38-54` builds a fake invoice from cached order data via `lib/invoiceService.ts:orderToInvoice`, which hardcodes a placeholder GSTIN (`'29XXXXXXXXXXXXX'`, line 108) instead of calling the working `GET /api/invoices/order/:orderId/customer`. "Download PDF" shows a "coming in next update" alert; Share assembles a manually-formatted plaintext string, not a real document.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-CUST-005 · HIGH · P1 · ✅ FIXED 2026-06-16
**Summary:** `requireCustomer` backend middleware doesn't validate the real session token the customer app now sends
**Affected Apps:** Customer Mobile App, Backend
**Root Cause:** `lib/apiClient.ts:38,52` sends the real persisted `session_token` (from the AUTH-001 fix), but `invoice.controller.ts:requireCustomer` (26-49) looked up `app_users` by `.eq('id', userId)` — a bare customer UUID (trivially obtainable from any API response) passed this check exactly as well as the real token.
**Fix applied:** Same fix as SECURITY-008 — the broken local `requireCustomer` was deleted from `invoice.controller.ts`; `invoice.routes.ts` now imports the real, session-token-checking implementation. No customer-app-side change was needed since it already sent the correct token.
**Severity:** High | **Priority:** P1

---

### MOBILE-RIDER-001 · LOW · P3
**Summary:** `lib/authService.ts` is fully dead code that still contains the original AUTH-003/MOBILE-AUTH-002 bug
**Affected Apps:** Delivery Partner Mobile App
**Root Cause:** `lib/authService.ts:61-101` (`verifyOTP`) still sends no `role` field; confirmed zero importers anywhere in the repo. Recommend deleting the file — leaving it risks a future regression if someone reconnects it.
**Severity:** Low | **Priority:** P3

---

### MOBILE-RIDER-002 · LOW · P3
**Summary:** Orders screen status badge config references a status the backend never produces
**Affected Apps:** Delivery Partner Mobile App
**Root Cause:** `app/(tabs)/orders.tsx:30-34` defines a badge for `en_route_delivery`, but `deliveryPartner.controller.ts:55-65` (`mapDbStatusToRider`) only ever emits `rider_assigned`, `picking_up`, `picked_up`, `completed`. Live `picking_up`/`picked_up` orders fall through to a generic unstyled fallback badge.
**Severity:** Low | **Priority:** P3

---

### MOBILE-RIDER-003 · LOW · P3
**Summary:** Service-role key is still plumbed into the rider app's client bundle via `app.config.js`, even though unused today
**Affected Apps:** Delivery Partner Mobile App
**Root Cause:** `constants/config.ts:33-37` defines `SUPABASE_CONFIG.SERVICE_ROLE_KEY`, and `app.config.js:83-84` forwards it into Expo's `extra` config (embedded in the build). No live code reads it today (only `.URL`/`.ANON_KEY` are used) — latent rather than active, but the var is pre-filled as a template in `.env.example:17`, so it ships the moment a build pipeline sets it.
**Severity:** Low | **Priority:** P3

---

### MOBILE-SHOP-001 · MEDIUM · P2
**Summary:** Two complete dead duplicate service classes target non-existent endpoints with near-identical names to the real ones
**Affected Apps:** Shopkeeper Mobile App
**Root Cause:** `services/orderService.ts` and `services/storeService.ts` (both class-based, both hitting non-existent `/store-owner/*` endpoints — same bugs as MOBILE-ORDER-004/009) have zero importers; confirmed real, used equivalents are `lib/order-service.ts` and `lib/store-service.ts`. The near-identical class names (`OrderService`/`StoreService` in both) create a real risk of editing the wrong file — the commit that fixed `toggleStoreStatus` correctly targeted `lib/store-service.ts`, but a less careful future change could easily target the dead file instead.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-SHOP-002 · MEDIUM · P2
**Summary:** `toggleStoreStatus` is implemented three separate times; only one is actually wired to the UI
**Affected Apps:** Shopkeeper Mobile App
**Root Cause:** `lib/store-service.ts:146-172`, `hooks/useStore.ts:75-107`, and an inline copy in `app/(tabs)/home.tsx:203-225` all independently implement the online/offline PATCH call. Only the inline `home.tsx` copy is live — the other two have zero callers. A fix applied to either of the unused two would silently never take effect.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-SHOP-003 · MEDIUM · P2
**Summary:** `setAllProductsOffline`/`restoreActiveProductsOnline` are silent no-ops called from the online-toggle critical path
**Affected Apps:** Shopkeeper Mobile App
**Root Cause:** `lib/storeProducts.ts:436-446` — both are `async (_storeId): Promise<boolean> { return true; }` with a comment "no-op now that quantity/in_stock are removed," but are still called unconditionally from `app/(tabs)/home.tsx:210,217` on every toggle, falsely implying that going offline affects product visibility.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-SHOP-004 · MEDIUM · P2
**Summary:** `lib/orders-db.ts` has a silent 4-strategy fallback chain with no error surfaced to the UI
**Affected Apps:** Shopkeeper Mobile App
**Root Cause:** `getOrdersFromDb` (166-296) tries an RPC (`get_orders_for_store`), then a direct table query, then a join fallback, then a 90-day full-scan fallback — all swallow failures into an indistinguishable "no orders" empty state, masking potential RLS misconfiguration as normal emptiness.
**Severity:** Medium | **Priority:** P2

---

### MOBILE-SHOP-005 · LOW · P3
**Summary:** The shopkeeper app's own `supabase/` folder is untracked, manually-run ad-hoc SQL, not migrations
**Affected Apps:** Shopkeeper Mobile App, Supabase
**Root Cause:** `near-now-store_owner/supabase/` contains `custom-master-products-rls.sql`, `orders-rpc-and-rls.sql`, and four other ad-hoc scripts — none timestamped, none corresponding to anything in the main backend's `supabase/migrations/`. Several live code paths (`lib/orders-db.ts`'s RPC call, `lib/storeProducts.ts`'s direct table writes) depend on these having been run manually against the live DB, with no way to verify from static analysis whether they were applied or will survive a future schema change.
**Severity:** Low | **Priority:** P3

---

### MOBILE-SHOP-006 · LOW · P3
**Summary:** `storeProducts.ts` fallback path calls a route missing the `/quantity` suffix
**Affected Apps:** Shopkeeper Mobile App, Backend
**Root Cause:** `lib/storeProducts.ts:414` (inside `updateProductActiveState`, only reached if the primary direct-Supabase update fails) calls `PATCH /store-owner/products/:id`, but the only registered route is `PATCH /store-owner/products/:productId/quantity`. Would 404 if ever reached — low-impact since the Supabase-first path succeeds in the common case.
**Severity:** Low | **Priority:** P3

---

## Severity Summary

**Original audit (2026-05-26):**

| Severity | Count |
|----------|-------|
| Critical | 17 |
| High | 63 |
| Medium | 43 |
| Low | 10 |
| **Total** | **133** |

**New tickets added in the 2026-06-16 re-audit (Part 9), including SECURITY-018 found mid-fix the same day:**

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 7 |
| Medium | 13 |
| Low | 11 |
| **Total** | **35** |

**Grand total tracked: 168 tickets.**

Of the **original 133**: confirmed **✅ fully fixed: 15** (AUTH-001, AUTH-002, SECURITY-008, SECURITY-009, WEB-003, WEB-008, MOBILE-SEC-004, MOBILE-ORDER-001, MOBILE-ORDER-010/011/012/013/014, MOBILE-UX-004, ORDER-010), **🟡 partially fixed: 18**, **⚠️ unverifiable without live DB/device: 9**, **⬜ not re-checked this round: 2**, and **❌ still fully broken: 89** (down from 92 after the 2026-06-16 auth-chain fix; see updated verdict below).

Of the **35 new (Part 9) tickets**: **✅ fully fixed: 4** (SECURITY-010, SECURITY-011, SECURITY-018, MOBILE-CUST-005 — all closed in the same 2026-06-16 session that found them), **❌ open: 31**.

---

## Team Assignment (4 Developers)

### Dev 1 — Backend Core (Auth, Payments, Security)
AUTH-001, AUTH-002, PAY-001, PAY-002, PAY-003, PAY-005, PAY-006, BACKEND-001, BACKEND-002, SECURITY-001, SECURITY-002, SECURITY-003, SECURITY-004, SECURITY-005, SECURITY-006, SECURITY-007, SECURITY-008, SECURITY-009, DB-003, DB-005, MOBILE-NOTIF-003

### Dev 2 — Order Lifecycle, Delivery & Notifications
ORDER-001, ORDER-002, ORDER-003, ORDER-005, ORDER-006, ORDER-007, ORDER-008, ORDER-009, ORDER-010, DELIVERY-001, DELIVERY-002, DELIVERY-003, DELIVERY-004, DELIVERY-005, DELIVERY-006, NOTIF-001, NOTIF-002, NOTIF-003, NOTIF-004, NOTIF-005, NOTIF-006, NOTIF-007, COUPON-001, COUPON-002, BACKEND-004, PERF-001, PERF-002, PERF-003, CROSS-001, CROSS-003, DB-007, DB-008

### Dev 3 — Mobile Apps (Customer + Rider)
MOBILE-SEC-001, MOBILE-SEC-002, MOBILE-SEC-003, MOBILE-SEC-004, MOBILE-AUTH-001, MOBILE-AUTH-002, MOBILE-BUG-001, MOBILE-NOTIF-001, MOBILE-NOTIF-002, MOBILE-PAYMENT-001, MOBILE-PAYMENT-002, MOBILE-UX-001, MOBILE-UX-002, MOBILE-UX-003, MOBILE-PERF-001, MOBILE-PERF-003, MOBILE-PERF-004, WEB-002, WEB-003, RIDER-PROF-001, RIDER-PROF-002, RIDER-PROF-003, MOBILE-ORDER-012, MOBILE-ORDER-013

### Dev 4 — Frontend Web, Admin & Shopkeeper App
WEB-001, WEB-004, WEB-005, WEB-006, WEB-007, WEB-008, ADMIN-001, ADMIN-002, ADMIN-003, ADMIN-004, ADMIN-005, ADMIN-006, ADMIN-007, ADMIN-008, ADMIN-009, ADMIN-010, ADMIN-011, MOBILE-AUTH-003, MOBILE-ORDER-001, MOBILE-ORDER-002, MOBILE-ORDER-003, MOBILE-ORDER-004, MOBILE-ORDER-005, MOBILE-ORDER-006, MOBILE-ORDER-007, MOBILE-ORDER-008, MOBILE-ORDER-009, MOBILE-ORDER-010, MOBILE-ORDER-011, MOBILE-ORDER-014, MOBILE-UX-004, MOBILE-PERF-002, CROSS-002, DB-001, DB-002, DB-004, DB-006, SHOP-PROF-001, SHOP-PROF-002, SHOP-PROF-003, SHOP-PROF-004, SHOP-PROF-005, CROSS-PROF-001, STORAGE-001

---

## Release Readiness Verdict

**STATUS (re-verified 2026-06-16): STILL BLOCKED — DO NOT RELEASE**

### Launch Blockers (must fix before any production traffic) — original 17, with current status:
1. **SECURITY-007** — Invoice endpoint has zero auth (any caller gets customer PII) — ❌ STILL BROKEN
2. **SECURITY-005** — storeOwner.getStores reads userId from query param (impersonation) — ❌ STILL BROKEN
3. **MOBILE-SEC-001** — Service-role key in APK (full DB breach via decompiler) — ❌ STILL BROKEN, worse
4. **MOBILE-SEC-004** — Customer UUID used as Bearer token (trivially forgeable) — ✅ FIXED (2026-06-16)
5. **SECURITY-004** — supabaseAdmin silently falls back to anon key in misconfigured env — 🟡 PARTIALLY FIXED
6. **AUTH-001** — Customer token never persisted (auth bypass on all customer routes) — ✅ FIXED (2026-06-16)
7. **PAY-001** — Webhook HMAC always fails (payment status never auto-confirmed) — 🟡 PARTIALLY FIXED (root cause unchanged)
8. **PAY-002** — updateOrderStatus returns 501 (no order status management) — ❌ STILL BROKEN
9. **NOTIF-001** — All notification methods empty (zero customer communication) — ❌ STILL BROKEN
10. **ADMIN-009** — Push notifications sent directly from browser to Expo (no backend oversight) — 🟡 PARTIALLY FIXED (direct call removed; feature is now a no-op)
11. **CROSS-001** — No payout system exists (platform cannot operate commercially) — ❌ STILL BROKEN
12. **DELIVERY-001** — Simulation endpoint unauthenticated in production — ❌ STILL BROKEN
13. **MOBILE-AUTH-001** — Session restore fails without service-role key — 🟡 PARTIALLY FIXED (symptom masked, dependency confirmed worse — see MOBILE-SEC-001)
14. **WEB-001** — Checkout email required blocks OTP-only users — ❌ STILL BROKEN
15. **SECURITY-003** — CORS wildcard accepts all origins — ❌ STILL BROKEN
16. **ORDER-009** — `order_store_allocations` missing for 63% of orders (shopkeepers never see them) — 🟡 LIKELY STILL TRUE (mechanism confirmed, live count unverified)
17. **MOBILE-ORDER-014** — Shopkeeper `useOrders.ts` uses `/api/shopkeeper/` prefix — all accept/reject calls 404 — ✅ FIXED

**Score: 3 of 17 original launch blockers fully resolved** — #17 (MOBILE-ORDER-014) was already fixed before this re-audit; #4 (MOBILE-SEC-004) and #6 (AUTH-001) were fixed in the 2026-06-16 in-session auth-chain work. 3 more new launch-blocker-grade issues were found this round (SECURITY-010/011/012/014/015 — several backend routers had no auth at all; SECURITY-010/011 are now fixed alongside AUTH-001, SECURITY-012/014/015 remain open; ADMIN-012 — admin logout doesn't invalidate sessions; SECURITY-016 — admin invoice endpoint has zero auth). **Net launch-blocker count is still higher than the original audit's 17, even after this fix.**

### Recommended Sprint Plan:
- **Sprint 1 (Critical Security + Auth):** SECURITY-004, SECURITY-005, SECURITY-007, MOBILE-SEC-001, MOBILE-SEC-004, AUTH-001, AUTH-002, ADMIN-009
- **Sprint 2 (Core Flows):** PAY-001, PAY-002, NOTIF-001 skeleton, DELIVERY-001, MOBILE-AUTH-001, WEB-001, WEB-002, ORDER-002
- **Sprint 3 (Stability + Stubs):** ORDER-007, ORDER-008, NOTIF-002 through NOTIF-007, SECURITY-006, SECURITY-008, SECURITY-009, ADMIN-003, ADMIN-006, MOBILE-ORDER-004 through MOBILE-ORDER-008
- **Sprint 4 (Commercial Viability):** CROSS-001 (payout system), MOBILE-UX-003, MOBILE-UX-004, MOBILE-BUG-001
- **Sprint 5 (Polish):** All remaining P2 and P3 items, performance optimizations

---

## JIRA TICKETS — PART 7: EMAIL (RESEND) & PUSH (FCM / EXPO) INTEGRATION GAPS

These tickets capture the third-party notification provider integrations that are entirely absent. The underlying stub code exists but the actual SDKs, API keys, and backend routes are not configured. All tickets in this section block real user communication and must be resolved before any production traffic.

---

### RESEND-001 · HIGH · P1
**Summary:** Email delivery provider (Resend / SendGrid / SES) not configured — all transactional emails silently dropped  
**Affected Apps:** Backend (all apps indirectly)  
**Root Cause:** `backend/src/services/notification.service.ts:53-56` — `sendEmail(to, subject, body)` contains a `// TODO: SendGrid / AWS SES` comment and only calls `console.log`. No email SDK (Resend, `@sendgrid/mail`, `@aws-sdk/client-ses`, `nodemailer`) is installed in `backend/package.json`. No `RESEND_API_KEY`, `SENDGRID_API_KEY`, or SES credentials are present in the `.env` file. Every call to `sendEmail` across the order lifecycle (order confirmation, refund notification, invoice delivery) writes a log line and returns `{ success: true }` — the customer never receives an email.  
**Impact:** Order confirmation emails, refund notifications, invoice delivery emails, and any OTP fallback emails are permanently lost. Customers have no paper trail for their orders.  
**Suggested Fix:** (1) Choose a provider — Resend is recommended for transactional email; (2) `npm install resend` in backend; (3) add `RESEND_API_KEY` to `.env` and Vercel environment; (4) replace the stub body in `sendEmail` with `new Resend(process.env.RESEND_API_KEY).emails.send({ from, to, subject, html: body })`; (5) wire `sendOrderPlacedNotification` (currently empty) to call `sendEmail` with an order confirmation template.  
**Severity:** High | **Priority:** P1

---

### FCM-001 · HIGH · P1
**Summary:** Shopkeeper app registers Expo push token at `POST /store-owner/notifications/register` — this backend route does not exist  
**Affected Apps:** Shopkeeper Mobile App, Backend  
**Root Cause:** `near-now-store_owner/lib/notifications.ts:155-172` — `registerTokenWithBackend(token)` calls `apiClient.post('/store-owner/notifications/register', { pushToken, platform, deviceId })`. The backend mounts `storeOwnerRoutes` at `/store-owner` (server.ts:59), and `storeOwner.routes.ts` registers only: `POST /signup/complete`, `GET /stores`, `PATCH /stores/:id`, `PATCH /stores/:id/online`, `PATCH /products/:productId/quantity`, `DELETE /products/:productId`. There is no `/store-owner/notifications/register` route. The `apiClient.post` call returns 404, the catch block silently swallows the error (line 169: `console.error` only), and the shopkeeper's push token is never persisted in the database. The `delivery_partners` table has an `expo_push_token` column and a working `PUT /delivery-partner/push-token` endpoint — no equivalent exists for shopkeepers. As a result, the backend can never send a new-order push notification to a shopkeeper device even though the Expo send infrastructure in `shopkeeper.controller.ts:broadcastToNearbyDrivers` expects tokens from `delivery_partners`, not shopkeepers. Shopkeeper notification preference updates (`POST /store-owner/notifications/preferences`, line 283) also call a non-existent endpoint.  
**Impact:** Shopkeepers only learn of new orders by opening the app and waiting for the 10–30s poll cycle (MOBILE-NOTIF-002). Push-based new-order alerts are structurally impossible until this is fixed.  
**Suggested Fix:** (1) Add a `shopkeeper_push_tokens` table (or `expo_push_token` column on `stores` or a junction table keyed by `user_id`); (2) register `POST /store-owner/notifications/register` in `storeOwner.routes.ts` with shopkeeper auth middleware that writes the token; (3) register `POST /store-owner/notifications/preferences` similarly; (4) update `broadcastToNearbyDrivers` (or add a parallel `broadcastToShopkeeper`) to look up the shopkeeper's token and send via Expo Push API.  
**Severity:** High | **Priority:** P1

---

### FCM-002 · HIGH · P1
**Summary:** Customer Expo push integration has three coordinated gaps — end-to-end push delivery is structurally impossible  
**Affected Apps:** Customer Mobile App, Backend  
**Root Cause:** Three independent defects must all be fixed together for customers to receive push notifications:  
1. **Missing DB column** (MOBILE-NOTIF-001): `app_users` has no `expo_push_token` column — there is nowhere in the database to store a customer's push token.  
2. **Missing backend API route** (MOBILE-NOTIF-003): `usePushNotifications.dev.ts:110` calls `POST /api/push-token` to save the token after registration. No such route is registered in `server.ts` or any route file — the HTTP call always returns 404.  
3. **Wrong table in send path** (NOTIF-002): `notification.service.ts:sendPushNotification` queries only `delivery_partners` for `expo_push_token`. Even if steps 1 and 2 were fixed, the notification send would still fail because it never looks in `app_users`.  
**Impact:** Customers never receive order status push notifications (placed, confirmed, out-for-delivery, delivered, cancelled). The `usePushNotifications` hook registers and requests the device token successfully, but it is immediately discarded.  
**Suggested Fix:** Fix all three in a single sprint: (a) migration to add `expo_push_token TEXT` to `app_users`; (b) add `POST /api/auth/push-token` endpoint guarded by customer auth middleware; (c) update `sendPushNotification` to check both `delivery_partners` (for riders) and `app_users` (for customers), using the `role` column to route correctly. Reference the working rider implementation in `deliveryPartner.controller.ts:549-553` as the pattern.  
**Severity:** High | **Priority:** P1

---

## JIRA TICKETS — PART 8: ADDITIONAL FINDINGS

---

### WEB-009 · MEDIUM · P2
**Summary:** `CheckoutPage.tsx` uses hardcoded ₹30 delivery fee — dynamic fee calculator is bypassed  
**Affected Apps:** Customer Web  
**Root Cause:** `frontend/src/context/CartContext.tsx:31-32` exports `getDeliveryFeeForSubtotal = (_cartSubtotal: number): number => 30` — a function that ignores its argument and always returns ₹30. `frontend/src/pages/CheckoutPage.tsx` imports and calls this function on lines 426, 538, 553, 563, and 592 for every payment path (Razorpay, COD, split). A fully-functional dynamic calculator already exists in `frontend/src/utils/deliveryFees.ts` — `calculateFeeBreakdown(distanceKm, cartSubtotal)` applies distance tiers, minimum fees, and a free-delivery threshold. The checkout never calls it. Customers are charged ₹30 regardless of distance (1 km or 15 km), and orders placed with the correct multi-store routing via `placeCheckoutOrder` receive the client-calculated ₹30 as `delivery_fee` — not a server-calculated value.  
**Impact:** Customers within walking distance pay the same as those far away. No revenue-optimised delivery pricing. Cannot offer free delivery above a cart threshold without changing a hardcoded constant.  
**Suggested Fix:** Replace `getDeliveryFeeForSubtotal(cartTotal)` calls in `CheckoutPage.tsx` with `getCompleteFeeBreakdown(distanceKm, cartTotal).deliveryFee` (already exported from `CartContext.tsx:34`). Ensure `distanceKm` is sourced from `LocationContext` (which already computes distance to the nearest store via `calculateDistance`).  
**Severity:** Medium | **Priority:** P2

---

*Audit generated by Claude Code — Near & Now QA Report v2.0 — 2026-05-26*
*Re-audited and Part 9 appended by Claude Code — v3.0 — 2026-06-16. See `QA_AUDIT.md` for the condensed, currently-maintained punch list.*
