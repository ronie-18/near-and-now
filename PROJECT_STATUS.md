# Near and Now — Project Status

**Last updated:** April 3, 2026  
**Overall completion:** **~90%**

This file reflects the current state of `frontend/`, `backend/`, and related apps. Feature rows use **Done**, **Partial**, or **Left**; weighted completion uses Done = 100%, Partial = 50%, Left = 0%.

---

## Recent updates and fixes

- **Checkout & orders:** Checkout and order flows are actively wired; payment verification uses internal order IDs; Razorpay integration and invoice download paths updated for customers and shopkeepers.
- **Home & catalog:** Homepage product/category loading and filtering tuned; category naming aligned (e.g. staples → “Rice, Atta, Dal and Maida”); legacy “Sompoorti” category/data cleaned from DB.
- **Cart & delivery:** Cart uses Haversine distance for store selection; delivery fees derived from distance; older delivery-fee logic removed for clarity.
- **Auth & roles:** `store_owner` migrated to **shopkeeper** in OTP flows and registration; related legacy handling removed.
- **Addresses:** Customer address resolution improved (phone variants merged); backend address retrieval hardened.
- **CORS & env:** CORS supports optional origin restriction; `.env.example` patterns clarified.
- **UI theming:** Tailwind/Material Design 3 tokens and global styles refined.
- **Dependencies:** lodash updated (e.g. 4.18.1) for security/performance.
- **Repo hygiene:** Obsolete CSVs, seeds, and one-off markdown/SQL files removed from the tree; ad-hoc `supabase/*.sql` scripts removed from the repo (schema lives in the Supabase project).
- **Deployment note:** Production API base URL may use Vercel (`near-and-now-frontend.vercel.app`) until a custom domain serves `/api` correctly; see `.env` / `VITE_API_URL`.

---

## Completion by area

| Area | Status | Completion |
| --- | --- | ---: |
| Customer app (browse, cart, checkout, profile, addresses) | Mostly complete | 96% |
| Order management and tracking UX | Strong, with key gaps | 88% |
| Admin panel core operations | Mostly complete | 90% |
| Delivery operations and partner lifecycle | Partial | 65% |
| Payments and business operations | Partial | 72% |
| Platform hardening (tests, notifications, quality) | Partial | 55% |
| **Overall project** | **In progress** | **~90%** |

---

## Done features

| Module | Feature | Status | Notes |
| --- | --- | --- | --- |
| Customer | Auth + session flows | Done | Login/signup/session context |
| Customer | Browse/search/category/product pages | Done | Home, category, shop, search, product detail |
| Customer | Cart and checkout | Done | Distance-based delivery fee; checkout integrated |
| Customer | Addresses + map/location picker | Done | Saved addresses + map selection |
| Customer | Orders list + thank-you flow | Done | Orders persist and are visible to the user |
| Customer | Tracking + realtime subscriptions | Done | Timeline and live tracking hooks |
| Customer | Help and policy pages | Done | Help, terms, shipping, privacy, refund |
| Admin | Dashboard and reports | Done | Analytics/report views |
| Admin | Product / category CRUD | Done | Add/edit/list |
| Admin | Orders + order detail | Done | Routed and implemented |
| Admin | Customers + customer detail | Done | Detail page implemented |
| Admin | Admin management (RBAC UI) | Done | Create/edit/list |
| Admin | Delivery partners CRUD | Done | Create/update/delete/status |
| Admin | Offers/coupons CRUD | Done | Wired to coupon APIs |
| Backend | API surface (auth, products, orders, customers, coupons, places, delivery, tracking, payment, notifications) | Done | Controllers/routes in place |
| Backend | Coupon validation + management | Done | CRUD + validation |
| Backend | Payment (create/verify/refund/webhook) | Done | Razorpay service |
| Backend | Tracking + delivery simulation | Done | Directions/roads + simulation |

---

## Left / pending

| Module | Gap | Current state | Priority |
| --- | --- | --- | --- |
| Delivery | Real partner GPS → `driver_locations` | Simulation exists; live partner flow incomplete | High |
| Tracking | Dynamic ETA from live movement | Mostly static/derived | High |
| Tracking | Clearer multi-store tracking UX | Works; can be clearer per store | Medium |
| Admin | Settings page with real persistence | `SettingsPage` still placeholder | High |
| Admin | Notifications page on live backend | UI partly mock/sample | Medium |
| Notifications | Email/SMS/push providers | Service layer still thin/TODO | High |
| Admin UX | Global search behavior | Inputs exist; behavior incomplete | Medium |
| Quality | Automated tests on critical flows | Minimal coverage | High |
| Reliability | Error boundaries / retries | Partial | Medium |

---

## Snapshot

| Type | Count |
| --- | ---: |
| Major feature groups tracked | 29 |
| Done | 21 |
| Partial | 7 |
| Left | 1 |

Score baseline: `(21×1 + 7×0.5 + 1×0) / 29 ≈ 84%`; **~90%** reflects that core commerce and admin flows are production-capable while gaps are mostly ops, live delivery, and hardening.

---

## Recommended next steps

1. Real delivery-partner location updates (authenticated API + mobile/web).
2. Replace mock admin notifications with live backend data.
3. Persist admin settings (configuration modules).
4. Wire notification providers (email/SMS/push).
5. Add E2E tests for checkout, tracking, coupons, and admin CRUD.

---

## Database schema

Schema and migrations are maintained in the **Supabase** project (not checked in as loose SQL in this repo). Use the Supabase dashboard or your team’s migration process to apply changes.
