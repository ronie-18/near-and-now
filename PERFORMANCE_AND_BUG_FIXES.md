# Performance, reliability and error-message changes

**Date:** 2026-09-26 · Companion to `AWS_MIGRATION_PLAN.md`.

This documents what was changed in this pass, why each change matters for the
"delayed UI / slow to update / buggy / unreadable errors" complaints, and the
audit findings that are **not** fixed yet so they can be scheduled.

---

## 1. Root causes found

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Every page took seconds to show products | `getAllProducts`, `getProductsByCategory`, `searchProducts` and the product page all **downloaded the entire products table** (500-row pages, one after another, with `master_products(*)`) and filtered in the browser. The header search did this on every keystroke. | Category / name / id filters now run in Postgres (`master_products!inner` + `.eq` / `.ilike`), only needed columns are selected, remaining pages load 4 at a time, and results are cached in memory for 60 s with in-flight de-duplication (`frontend/src/utils/queryCache.ts`). |
| First paint waited on ~1.3 MB of JavaScript | All customer, admin, driver and shopkeeper pages were in one bundle; Google Maps SDK loaded on every page | Route-level `React.lazy` in `App.tsx` and `AdminRoutes.tsx`; Maps SDK loads only when a map component mounts. Main bundle: **798 KB → 126 KB** (172 KB → 33 KB gzip). |
| Searching or clicking a suggestion reloaded the whole app | `window.location.href = …` in `Header.tsx`; `pushState` + fake `popstate` in `SearchPage.tsx` | React Router `navigate` / `useSearchParams`. |
| Tracking page never updated / showed "Order not found" | `trackingApi.ts` sent **no Authorization header** to routes protected by `requireCustomer`, so every call was a 401 swallowed as `null` | Auth headers added; failures now surface with the endpoint name and request id. |
| Tracking page hammered the API and re-applied stale data | 3 s + 2 s polling with no in-flight guard, stale `order` closure, Directions API called on every 1 m GPS jitter, `fitBounds` fought the user's pan | Realtime channel is primary; fallback poll 10 s, driver poll 4 s (paused when tab hidden), functional `setOrder`, route recompute at ~11 m, bounds refit at ~100 m. |
| Location never affected the catalogue | Header stored `currentLocation`; `LocationContext`/catalogue read `userLocation`; nothing ever called `setUserLocation` | Header publishes picked/default addresses into `LocationContext`; Home page refetches when the location changes. |
| Whole UI re-rendered on every toast / cart change; category page refetched on every toast | Context provider values were new objects each render; `showNotification` identity changed constantly and was in effect deps | `useMemo`/`useCallback` in Auth, Cart, Location, Notification contexts; `ProductCard` is memoised; cart totals derived with `useMemo` instead of a second render. |
| Cart quantity doubled in dev / corrupted state | In-place mutation inside a `setState` updater | Immutable update. |
| Fonts flashed and blocked rendering on each page | 8 pages had `@import url(fonts.googleapis…)` inside inline `<style>`; unused Font Awesome CDN in `index.html` | Single non-blocking font stylesheet + preconnects in `index.html`; per-page imports removed. |
| Broken images could loop forever | `onError` reset `src` to the same external placeholder host | Inline SVG placeholder applied once (`utils/placeholderImage.ts`). |
| "Failed to …. Please try again." everywhere | Fixed strings with no context in ~120 backend catch blocks and ~60 frontend call sites | See §2. |

## 2. Error messages you can locate

**Backend** (`backend/src/utils/httpError.ts`): every error response is now

```json
{ "error": "Could not load the categories", "where": "ProductsController.getCategories",
  "requestId": "3f0c…", "code": "42501", "detail": "permission denied for table categories" }
```

- `where` = controller + method (or middleware) that failed.
- `requestId` = same id printed on the server log line (`X-Request-Id` response header too).
- `detail` = upstream reason; always for 4xx, only outside production for 5xx.
- Status is inferred from the upstream error (PostgREST `PGRST116` → 404, `23505` → 409, Twilio/Razorpay `status`, `42501` → 403) instead of always 500.
- New JSON 404 (`server.notFound`) and global error handler (`server.errorHandler`) replace Express's HTML pages; CORS rejections are 403 with a sentence naming `ALLOWED_ORIGINS`.
- Every request logs one JSON line `{requestId, method, route, status, durationMs}` for CloudWatch Logs Insights.

**Frontend** (`frontend/src/utils/apiErrors.ts`): `describeError(where, action, err)` renders

> Could not load the home page products and categories (HomePage.fetchData): permission denied for table products [ref 3f0c…]

`fetchJson()` wraps `fetch` and turns non-2xx bodies into `ApiError` carrying the backend's `where`/`requestId`, so the toast points at both the UI call site and the API handler.

## 3. Other bugs fixed in this pass

- Coupon lookups used `.single()` so an unknown code returned a PostgREST error instead of "not valid" (`database.service.validateCoupon`).
- `GET /api/products/products/:id` downloaded the whole view to find one row; `GET /api/products/nearby-stores` downloaded every store — both now use indexed lookups / the PostGIS RPC.
- `GET /api/products/master-products` without `isActive` filtered to inactive products only.
- `void supabaseAdmin.rpc('auto_offline_stale_drivers')` never executed (Supabase queries are lazy) — stale riders were never taken offline.
- OTP rate limiters keyed on the raw phone string, so re-formatting the number bypassed them.
- Tracking endpoints let any logged-in customer read any order; riders could overwrite other riders' locations — ownership checks added.
- `POST /api/payment/refund` was callable by anyone → admin only. Saved payment methods / payment details now require the customer session and only return the caller's own data.
- Customer invoice download sent the user id as the bearer token (always 401).
- Orders page showed raw statuses (`pending_at_store`) — mapped to labels.
- "Newest" sort on category pages was a random shuffle on every render.
- Thank-you page redirected after 3 s (comment said 7), even mid-cancel; cancel timer leaked.
- Customer tracking page triggered the delivery **simulation** in production → now dev-only (`VITE_ENABLE_DELIVERY_SIMULATION`).
- `requireCustomer`/`requireAdmin` had no try/catch (a DB hiccup hung the request); sessions are cached 30 s to absorb polling.
- Frontend `vitest` had no workspace config (`describe is not defined`); Supabase client crashed at import in tests when env vars were absent. All 17 backend and 17 frontend tests now pass.
- Removed the duplicate `Dockerfile copy`; `.env.example` files document the new variables.

## 4. Backlog — found by the audit, not fixed here

Ordered by risk. File references are to the current tree.

**Payments / orders (high)**
1. `/api/orders/place` and `/create` trust client-supplied totals, `unit_price` and `payment_status` (`database.service.ts` `placeCheckoutOrder`, `orders.controller.ts createOrder`). Recompute prices server-side and require `requireCustomer`.
2. Payment verification does not tie the Razorpay order to `internalOrderId` (`payment.controller.ts verifyPayment`); `createPaymentOrder` should persist `razorpay_order_id`.
3. Webhook ignores `split_upi_amount` and can downgrade a `paid` order on out-of-order events (`payment.service.ts processWebhookEvent`); payment status update is read-then-write.
4. `cancelOrder` does not check status and swallows refund failures.
5. Checkout is not transactional; a failure mid-way leaves a half-created order.

**Auth / access control (high)**
6. Rider signup (`/delivery-partner/signup/complete`) can take over an existing rider by phone/email; `requireRider` ignores `status`.
7. Shopkeeper signup (`storeOwner.controller.ts`) issues tokens without proving OTP; token lookups there have no TTL.
8. Notifications endpoints do not compare `:userId` with the session.
9. Saved-address resolution can return another customer's addresses when phone hints collide (`getCustomerSavedAddressesResolved`).
10. 4-digit email / delivery / pickup codes generated with `Math.random`, no attempt limits.

**Data / logic (medium)**
11. Multi-store orders: `.maybeSingle()` on multi-row results in invoice, rider and shopkeeper controllers; `assignDeliveryAgent` breaks on several store orders.
12. Invoice totals add 5 % GST + fixed fees on top of charged prices and can be generated twice concurrently.
13. Admin `CustomerDetailPage` filters orders by `customer_id` but the mapper emits `user_id` (always empty).
14. Admin list pages fetch whole tables and paginate client-side; `getDashboardStats` pages through all products and orders.
15. `DriverApp` collapses expanded stops every 6 s poll; `ShopkeeperApp` restarts polling when a modal opens.
16. `frontend/src/pages/admin/*` and the separate `admin/` app are duplicates — pick one.
17. ESLint config references `eslint-plugin-react`, which is not installed (lint cannot run).
18. Test coverage is thin (4 frontend files, 2 backend files). The previously failing suites (`payment.service.test.ts`, `Button.test.tsx`, `ProductCard.test.tsx`, `invoice.test.ts`) were repaired in this pass; add checkout, tracking and coupon flows next.

## 5. How to verify locally

```bash
npm ci
npx tsc --noEmit -p backend/tsconfig.json && npx tsc --noEmit -p frontend/tsconfig.json
npm run build --workspace=backend && (cd frontend && npx vite build)   # main chunk ≈ 126 KB
npm run dev                                                             # then open http://localhost:5173
curl -i localhost:3000/api/nope                                         # JSON 404 with requestId
```
