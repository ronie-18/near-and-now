# Near & Now — Business Algorithms

A verified reference for every implemented business algorithm across the backend, frontend, and customer app. Each entry documents the exact function name, file, logic steps, inputs, outputs, and edge cases as read from the actual code.

---

## Table of Contents

1. [Distance & Geo](#1-distance--geo)
2. [Store Discovery](#2-store-discovery)
3. [Pricing & Fees](#3-pricing--fees)
4. [Tax (GST)](#4-tax-gst)
5. [Coupon Validation](#5-coupon-validation)
6. [Order Allocation](#6-order-allocation)
7. [Shopkeeper Acceptance & Reallocation](#7-shopkeeper-acceptance--reallocation)
8. [Driver Dispatch & Offer Acceptance](#8-driver-dispatch--offer-acceptance)
9. [Pickup Verification & Sequencing](#9-pickup-verification--sequencing)
10. [Road Routing & Path Utilities](#10-road-routing--path-utilities)
11. [Delivery Simulation](#11-delivery-simulation)
12. [Customer App (Mobile)](#12-customer-app-mobile)
13. [Known Discrepancies](#13-known-discrepancies)
14. [Quick-Reference Table](#14-quick-reference-table)

---

## 1. Distance & Geo

### 1.1 Haversine Distance — `calculateDistance`

**File:** `backend/src/services/database.service.ts` ~line 1144  
**Also duplicated as:** `haversineKm` in `backend/src/controllers/shopkeeper.controller.ts` ~line 19

```
R = 6371 km
dLat = toRad(lat2 - lat1)
dLon = toRad(lon2 - lon1)
a = sin²(dLat/2) + cos(lat1_rad) × cos(lat2_rad) × sin²(dLon/2)
c = 2 × atan2(√a, √(1-a))
distance = R × c
```

- **Inputs:** `lat1, lon1, lat2, lon2` (decimal degrees)
- **Output:** Distance in km (±0.5% accuracy)
- **Used by:** all distance filters, store ranking, driver radius checks

---

### 1.2 Geocoding — `geocoding.service.ts`

**File:** `backend/src/services/geocoding.service.ts`

- **Forward** (~line 43): address string → `{lat, lng}` via Google Geocoding API
- **Reverse** (~line 17): `{lat, lng}` → formatted address string
- Returns `null` on API failure (graceful degradation, no throw)

---

## 2. Store Discovery

### 2.1 Nearby Stores (Fixed Radius) — `getNearbyStores`

**File:** `backend/src/services/database.service.ts` ~line 261

1. Fetch all active stores from DB.
2. For each store, compute `calculateDistance()` to customer coordinates.
3. Keep stores where `distance ≤ radiusKm` (default **5 km**).

- **Output:** Unordered array of stores within radius

---

### 2.2 Candidate Stores for Allocation — `fetchCandidateStores`

**File:** `backend/src/services/storeAllocation.service.ts`

1. Bounding-box pre-filter in SQL on `stores` (active, approved, `deleted_at IS NULL`, coordinates present).
2. Exact `haversineKm()`; keep `minKm < distance ≤ maxKm`; drop excluded store ids (stores already on the order).
3. Sort nearest first, store id as tiebreak.

- **Placement radius:** `PLACEMENT_RADIUS_KM = 4` — the whole ring, matching the storefront catalogue. (The former `getNearbyStoreIdsExpanding` stopped at the first 1/2/3/4 km ring containing any store, hiding better stores further out; removed 2026-10-04.)
- **Reallocation radius:** `REALLOCATION_MAX_RADIUS_KM = 8`.

---

## 3. Pricing & Fees

### 3.1 Tiered Delivery Fee — `deliveryChargeForDistanceKm`

**File:** `frontend/src/utils/deliveryFees.ts` ~line 30

| Distance | Fee |
|---|---|
| ≤ 1 km | ₹15 |
| ≤ 2 km | ₹20 |
| ≤ 3 km | ₹25 |
| > 3 km (any distance) | ₹40 |

- Distance ≤ 0 is treated identically to ≤ 1 km (returns ₹15)
- No upper limit enforced here; service area cap is applied separately (see §2.2)

---

### 3.2 Full Fee Breakdown — `calculateFeeBreakdown`

**File:** `frontend/src/utils/deliveryFees.ts` ~line 44

| Component | Value |
|---|---|
| Delivery fee | from §3.1 |
| Platform fee | ₹9.50 (constant) |
| Handling fee | ₹5.50 (constant) |

Free delivery threshold: **cart subtotal ≥ ₹300** → delivery fee becomes ₹0 (platform + handling still charged).

- **Output:** `{ deliveryFee, rawDeliveryFee, platformFee, handlingFee, totalFees, distanceKm, deliveryFreeBySubtotal }`

---

### 3.3 Order Totals — `getCheckoutOrderTotals`

**File:** `frontend/src/utils/deliveryFees.ts` ~line 64

1. Use `resolvedDistanceKm` if provided, else default **2 km** (quote distance).
2. Call `calculateFeeBreakdown(effectiveKm, cartSubtotal)`.
3. `orderTotal = cartSubtotal + totalFees - discount`

- **Output:** Full breakdown including subtotal, discount, individual fees, and final order total

---

## 4. Tax (GST)

### 4.1 GST Split — `calcGstSplit` (Backend)

**File:** `backend/src/services/invoice.service.ts` ~line 80

```
half = gstPercent / 2

Intra-state (default, isInterState = false):
  CGST = round2(taxableValue × half / 100)
  SGST = round2(taxableValue × half / 100)
  IGST = 0

Inter-state:
  IGST = round2(taxableValue × gstPercent / 100)
  CGST = SGST = 0
```

- **Default GST rate:** 5% (food items, HSN 2106)
- **`isInterState` is hardcoded `false`** — always intra-state (West Bengal); IGST path exists but is never triggered
- **Rounding:** `Math.round((n + Number.EPSILON) * 100) / 100` (banker-safe 2dp)

---

### 4.2 Full Invoice GST Calculation — `buildInvoiceData`

**File:** `backend/src/services/invoice.service.ts` ~line 226

**Line items:**
- `taxableValue = unitPrice × quantity`
- `gst = calcGstSplit(taxableValue, 5%, false)` → CGST + SGST
- `lineTotal = taxableValue + CGST + SGST`

**Platform + Handling fees (embedded GST, reverse-extracted):**
- Platform ₹9.50 → base = `9.50 / 1.05 = ₹9.05`, GST = ₹0.45
- Handling ₹5.50 → base = `5.50 / 1.05 = ₹5.24`, GST = ₹0.26
- Fee GST split 50/50: CGST = GST / 2, SGST = GST / 2

**Delivery fee: no GST applied.**

**Grand total:**
- `subtotal = Σ(lineTotal) + ₹9.50 + ₹5.50 + deliveryFee − discount`
- `taxableAmount = Σ(taxableValue) + ₹9.05 + ₹5.24`
- `cgstTotal = Σ(item CGST) + feeCGST`
- `sgstTotal = Σ(item SGST) + feeSGST`

---

### 4.3 Frontend GST Mirror — `calculateCheckoutTotals`

**File:** `frontend/src/utils/checkoutCalculations.ts` ~line 76

Implements the same logic as §4.2 for real-time display at checkout — ensures the number shown to the customer always matches the invoice generated server-side.

---

## 5. Coupon Validation

### 5.1 `validateCoupon`

**File:** `backend/src/services/database.service.ts` ~line 1065

Checks in order:

1. **Existence + active:** Fetch coupon by code where `is_active = true`.
2. **Time window:** `now ≥ valid_from` AND (`valid_until IS NULL` OR `now ≤ valid_until`).
3. **Global usage cap:** `usage_count < usage_limit` (if limit is set).
4. **Per-user limit:** Count this customer's past redemptions; reject if `count ≥ per_user_limit` (default **1**).
5. **First-order restriction:** If `applies_to_first_n_orders` is set, count customer's delivered orders; reject if `≥ applies_to_first_n_orders`.

- **Inputs:** `code` (string), `customerId` (UUID)
- **Output:** Coupon object if valid; throws `Error` with reason if not
- **Note:** `min_order_value` and `max_discount_amount` enforcement is handled by the caller, not this function

---

## 6. Order Allocation

### 6.1 Allocation Planner — `planAllocation` (shared)

**File:** `backend/src/services/allocationPlanner.ts`  
**Used by:** order placement (§6.2) and reallocation (§7.2)

**Inputs:** items (`key`, `masterProductId`), candidate stores with distance (nearest first), `stock: store → Set<master_product_id>`.

**Objective, in priority order:**
1. **Fewest stores.** A single store that stocks every item takes the whole order — the nearest such store ("if store Y has all of those items, redirect to store Y").
2. **Shortest total distance** among plans with the same number of stores.
3. Deterministic store-id tiebreak.

**Method:** items no candidate stocks are set aside as `unplaced`. Exact search over store combinations of size 1, 2, 3 (nearest 40 candidates); if no plan that small covers everything, greedy max-coverage with nearest-store tiebreak. An item stocked by two chosen stores goes to the nearer one. Stops are returned **farthest-first** (becomes `sequence_number`; the rider works towards the customer).

---

### 6.2 Placement — `placeCheckoutOrder`

**File:** `backend/src/services/database.service.ts`  
**Trigger:** Customer completes checkout

1. `fetchCandidateStores()` within 4 km (§2.2); none → `No store available…`.
2. `fetchStoreStock(storeIds, masterIds)` — active, non-deleted `products` rows; also yields the store-scoped `products.id` per (store, master).
3. Prices/quantities verified from `master_products` (unchanged).
4. `planAllocation()`; any `unplaced` → throw `Product(s) not available from any store near you: …` **before any write**.
5. `place_multi_store_order()` writes everything atomically; `order_items.product_id` = fulfilling store's own product row.

---

## 7. Shopkeeper Acceptance & Reallocation

### 7.1 Accept / Reject Items — `acceptAllocation` / `rejectAllocation`

**File:** `backend/src/controllers/shopkeeper.controller.ts`

1. Fetch allocation (must belong to one of the caller's stores); must be `pending_acceptance`; store must be approved+active; order must be payment-ready.
2. `acceptedIds = (this store's items on this order) ∩ accepted_item_ids`. Empty → **400**. Foreign ids are ignored (previously they were confirmed verbatim, and an all-foreign request produced an empty `accepted` allocation that was dispatched).
3. `unavailableIds = this store's items − acceptedIds`.
4. Random 4-digit pickup code, regenerated on collision with the delivery OTP or a sibling store's code.
5. Allocation update guarded by `status = 'pending_acceptance'` (double-accept and accept-vs-reject races lose cleanly with 409).
6. `store_orders` (this store only) → `store_accepted`; accepted items → `confirmed`; unticked items → `pending`, `assigned_store_id NULL` ("waiting for a store").
7. Unticked items → `reallocateMissingItems()` (async). Otherwise → `finalize_order_if_ready()`; if it returns false, order → `store_accepted`.
8. **Reject:** guarded flip to `rejected`; `releaseStoreFromOrder()` (items → waiting; that store's `store_orders` row → `order_cancelled`); then reallocation (or settle, if the store held no items).

`finalize_order_if_ready()` (migration `20261004010000`) requires: no `pending_acceptance` allocation, **no item waiting for a store**, and at least one `accepted` allocation with non-empty `accepted_item_ids`.

---

### 7.2 Item Reallocation — `reallocateMissingItems`

**File:** `backend/src/controllers/shopkeeper.controller.ts`  
**Trigger:** items released by accept (unticked), reject, the 5-minute stale expiry, or the server sweep. Serialised per order (`withOrderLock`).

1. Order must still be `pending_at_store` / `store_accepted` / `preparing_order`.
2. Re-read items still waiting; resolve `order_items.product_id` → `master_product_id` via `products` (**the old code compared master ids to store-scoped ids and never matched — every declined item was refunded instead of reallocated**).
3. Candidates: `fetchCandidateStores()` within 8 km, excluding every store that ever had an allocation on this order.
4. `planAllocation()` over the waiting items.
5. Per stop: RPC `reallocate_items_to_store(order, store, [{item_id, product_id}])` — one transaction, order row locked: order pre-dispatch, store live and unused, items waiting and product rows valid for that store+master, next `sequence_number`, `store_orders` row create/reuse (no `ON CONFLICT` dependency), items repointed incl. `product_id`, per-store subtotals recomputed. `ITEMS_NOT_REALLOCATABLE` = another process got there first (items re-checked, not written off); `ORDER_NOT_REALLOCATABLE` = order moved on (stop).
6. New store's shopkeeper notified.
7. Still-waiting leftovers → `flagUnresolvableItemsForRefund()`: `unavailable` (guarded on still-unassigned), subtotals recomputed, `admin_notifications` `refund_required`, customer notified; **COD:** `total_amount`/`subtotal_amount` reduced by the dropped lines (compare-and-swap).
8. `settleOrderAfterReallocation()`: finalize; else if some store accepted → `store_accepted`; else if nothing pending and nothing accepted → **auto-cancel** via `databaseService.cancelOrder()` (refund, coupon release, notifications) + history note.

### 7.3 Server Sweep — `sweepStuckOrders`

Every 60 s (`server.ts`, non-Vercel). (a) Allocations `pending_acceptance` for > 5 min — measured from when the store could *see* the order (payment time for online orders, `customer_payments.paid_at`) — on payment-ready, pre-dispatch orders → status-guarded `rejected` → release → reallocate. (b) Items `pending` with no `assigned_store_id` on pre-dispatch orders → reallocate. (c) Pre-dispatch orders with an allocation accepted > 1 min ago → `settleOrderAfterReallocation()` (finalize retry after an RPC blip or restart). Safe across instances (guarded writes + locked database function).

---

## 8. Driver Dispatch & Offer Acceptance

### 8.1 Dispatch to Driver Going Online — `dispatchReadyOrdersToDriver`

**File:** `backend/src/controllers/shopkeeper.controller.ts` ~line 426  
**Trigger:** Driver sets status to `online`

1. Fetch driver's last known location from `driver_locations`.
2. Fetch all orders with `status = 'ready_for_pickup'`.
3. Filter: `haversineKm(driver, order.delivery_point) ≤ 10 km`.
4. Skip orders where this driver already has an offer row.
5. Insert `driver_order_offers` rows (`status = 'pending'`) and send Expo push notifications.

---

### 8.2 Broadcast to Nearby Drivers — `broadcastToNearbyDrivers`

**File:** `backend/src/controllers/shopkeeper.controller.ts` ~line 488  
**Trigger:** Order becomes `ready_for_pickup`

1. Fetch order `delivery_latitude` / `delivery_longitude`.
2. Fetch all driver locations.
3. Filter: `haversineKm(driver, delivery_point) ≤ 10 km` AND driver `is_online = true` AND `status = 'active'`.
4. Upsert one `driver_order_offers` row per eligible driver (`status = 'pending'`).
5. Send batch Expo push: `{ title: '🛵 New Delivery Request', body: 'New order available' }`.

---

### 8.3 Atomic Offer Acceptance — `acceptOffer`

**File:** `backend/src/controllers/deliveryPartner.controller.ts` ~line 639  
**DB function:** `accept_driver_offer(p_offer_id, p_driver_id)` in migration `20260427000000_multi_store_allocation_dispatch.sql` ~line 75

- Uses `SELECT FOR UPDATE SKIP LOCKED` — guarantees exactly one driver wins a race condition.
- If won: mark offer `accepted`; set `driver_id` on `customer_orders` and all `store_orders`; expire all other offers for the same order.
- Returns: `'accepted'` | `'already_taken'` | `'offer_not_found'` | `'order_not_available'`
- HTTP 409 returned to drivers who lost the race.

---

## 9. Pickup Verification & Sequencing

### 9.1 Verify Pickup Code — `verifyPickupCode`

**File:** `backend/src/controllers/deliveryPartner.controller.ts` ~line 766

1. Validate code format: `^\d{4}$`.
2. Fetch allocation; check `pickup_code` matches.
3. If `status = 'picked_up'`: return `{ already_done: true }` (idempotent).
4. If `status ≠ 'accepted'`: return error.
5. Update allocation: `status → 'picked_up'`, `picked_up_at → now`.
6. Fetch remaining allocations **not** `picked_up`, ordered by `sequence_number ASC`.
7. **If none remaining (all stores done):**
   - `customer_orders.status → 'order_picked_up'`
   - `store_orders.status → 'order_picked_up'`
   - Insert history: *"All stores picked up — driver en route"*
8. **If partial (more stops):**
   - `customer_orders.status → 'picking_up'`
   - Insert history: *"Picked up X of Y · heading to [NextStore]"*

- **Output:** `{ success, all_stores_done }`
- Driver must visit stores in `sequence_number` order; each stop requires the 4-digit code displayed by the shopkeeper.

---

## 10. Road Routing & Path Utilities

### 10.1 Fetch Road Route — `fetchRoadRoute`

**File:** `backend/src/services/directions.service.ts` ~line 72

**Fallback chain:**

| Priority | Method | When Used |
|---|---|---|
| 1 | Google Directions API (`overview_polyline`) | Primary |
| 2 | Google Directions API (leg step points) | If overview_polyline missing |
| 3 | Google Roads API snap-to-roads | If Directions API fails |
| 4 | `[]` (empty) | If all APIs fail |

- Params: `mode=driving`, `alternatives=false`, `region=in`
- **Output:** `Array<{lat, lng}>` tracing the actual road path

---

### 10.2 Polyline Decoding — `decodePolyline`

**File:** `backend/src/services/directions.service.ts` ~line 15

Implements Google's polyline encoding (RFC 5005):
1. Read characters; subtract 63 from each char code.
2. Accumulate 5-bit chunks (bit `0x20` = continuation flag).
3. Right-shift and negate if result is odd (sign bit).
4. Accumulate deltas for lat then lng; divide by `1e5` to recover degrees.

- **Output:** `Array<{lat, lng}>` of decoded coordinates

---

### 10.3 Straight-Line Path Sampling — `sampleStraightPath`

**File:** `backend/src/services/roads.service.ts` ~line 16

1. Compute Haversine distance in meters between origin and destination.
2. `stepM = clamp(distM / maxPoints, 150, 300)` — adaptive 150–300 m spacing.
3. `n = clamp(ceil(distM / stepM), 10, maxPoints)` — at least 10 points.
4. Linear interpolation: `point(i) = origin + (i/n) × (destination − origin)`.

- **Used by:** Roads API fallback when Directions fails

---

### 10.4 Snap to Roads — `snapToRoads`

**File:** `backend/src/services/roads.service.ts` ~line 47

1. Limit path to 100 points (Google API constraint).
2. Call Google Roads API `/v1/snapToRoads?path=...&interpolate=true`.
3. Return `snappedPoints` as `{lat, lng}[]`.

- `interpolate=true` returns intermediate points for smooth curves
- Returns `[]` on API failure

---

### 10.5 Route Sampling for Simulation — `sampleAlongRoute`

**File:** `backend/src/services/deliverySimulation.service.ts` ~line 54

1. For `i = 1` to `steps`:
   - `t = i / steps`, `pos = t × (route.length − 1)`
   - `idx = floor(pos)`, `frac = pos − idx`
   - Linear lerp between `route[idx]` and `route[idx+1]`
2. Return exactly `steps` points.

---

## 11. Delivery Simulation

### 11.1 Full Simulation Lifecycle — `runDeliverySimulation`

**File:** `backend/src/services/deliverySimulation.service.ts` ~line 195  
**Used in:** dev/demo environments only

```
Order placed
  └─ Phase 1: Poll order_store_allocations every 5 s (max 120 s)
       └─ Timeout: auto-accept remaining pending allocations
            └─ Phase 2: Transition statuses with 2 s delays
                 store_accepted → preparing_order → ready_for_pickup
                      └─ Phase 3: Find driver (online+active preferred → any active → any)
                           Create driver_order_offers, wait 2 s, auto-accept
                                └─ Phase 4: For each allocation (sequence_number ASC):
                                     moveDriverAlongRoute(driver → store, 12 steps)
                                     Simulate pickup code verification
                                     Mark allocation 'picked_up', pause 1 s
                                          └─ Phase 5: Delivery
                                               moveDriverAlongRoute(store → customer, 18 steps)
                                               Mark order 'order_delivered'
```

---

### 11.2 GPS Step Simulation — `moveDriverAlongRoute`

**File:** `backend/src/services/deliverySimulation.service.ts` ~line 119

1. Call `fetchRoadRoute(from, to)` for actual road geometry.
2. Sample into `steps` points using `sampleAlongRoute()`.
3. For each point: `sleep(300 ms)` → `upsertDriverLocation(driverId, lat, lng)`.

- **12 steps → 3.6 s per store leg**
- **18 steps → 5.4 s for final delivery leg**
- Falls back to linear interpolation if route is unavailable

---

## 12. Customer App (Mobile)

**App location:** `/Users/tiasmondal166/projects/nearandnowcustomerapp/`

### 12.1 Order Total Calculation — `calcOrderTotal`

**File:** `nearandnowcustomerapp/constants/fees.ts` ~line 17

```
platformFee  = ₹9.50  (constant)
handlingFee  = ₹5.50  (constant)
deliveryFee  = ₹25    (HARD-CODED constant — not distance-tiered)
gst          = (platformFee + handlingFee) × 0.05 = ₹0.75
projected    = subtotal + ₹9.50 + ₹5.50 + ₹25 + ₹0.75 = subtotal + ₹40.75
finalPayable = max(round(projected − discount), 0)
```

- **Inputs:** `subtotal, totalItems (unused), distanceKm (unused), discount (optional)`
- **Output:** `{ platformFee, handlingFee, deliveryFee, gst, projected, finalPayable }`

> **See §13 for the discrepancy between this and the backend pricing.**

---

## 13. Known Discrepancies

| Aspect | Backend / Frontend Web | Customer App (Mobile) |
|---|---|---|
| Delivery fee | Distance-tiered: ₹15 / ₹20 / ₹25 / ₹40 | Hard-coded **₹25** (ignores distance) |
| Free delivery | Waived when subtotal ≥ ₹300 | **Not implemented** |
| `distanceKm` param | Used for pricing | Accepted but **ignored** |
| GST on fees | CGST + SGST (intra-state split) | Only total fee GST (₹0.75 flat) |

The customer app appears to use a simplified/older pricing model. This can cause the amount displayed in the mobile app to differ from the invoice generated by the backend.

---

## 14. Quick-Reference Table

| # | Algorithm | File | Function | Key Detail |
|---|---|---|---|---|
| 1.1 | Haversine distance | `database.service.ts:1144` | `calculateDistance` | R = 6371 km |
| 1.2 | Geocoding | `geocoding.service.ts` | forward / reverse | Returns null on failure |
| 2.1 | Nearby stores (fixed) | `database.service.ts:261` | `getNearbyStores` | Default 5 km, unordered |
| 2.2 | Candidate stores for allocation | `storeAllocation.service.ts` | `fetchCandidateStores` | Whole 4 km ring (placement) / 8 km (reallocation), nearest first |
| 3.1 | Tiered delivery fee | `deliveryFees.ts:30` | `deliveryChargeForDistanceKm` | ₹15/20/25/40 |
| 3.2 | Fee breakdown | `deliveryFees.ts:44` | `calculateFeeBreakdown` | Free delivery ≥ ₹300 |
| 3.3 | Order totals | `deliveryFees.ts:64` | `getCheckoutOrderTotals` | Default 2 km if no GPS |
| 4.1 | GST split | `invoice.service.ts:80` | `calcGstSplit` | 5% CGST+SGST; IGST unused |
| 4.2 | Invoice GST | `invoice.service.ts:226` | `buildInvoiceData` | Embedded fee GST reverse-extracted |
| 4.3 | Frontend GST | `checkoutCalculations.ts:76` | `calculateCheckoutTotals` | Mirrors backend exactly |
| 5.1 | Coupon validation | `database.service.ts:1065` | `validateCoupon` | Expiry, usage, per-user, first-order |
| 6.1 | Allocation planner | `allocationPlanner.ts` | `planAllocation` | Fewest stores (one store with everything wins), then shortest distance |
| 6.2 | Placement | `database.service.ts` | `placeCheckoutOrder` | Plans over the whole 4 km ring; fails before any write if an item has no store |
| 7.1 | Accept / reject allocation | `shopkeeper.controller.ts` | `acceptAllocation` / `rejectAllocation` | Own items only; status-guarded; unticked items → waiting for a store |
| 7.2 | Item reallocation | `shopkeeper.controller.ts` + `reallocate_items_to_store()` | `reallocateMissingItems` | Master-product match, 8 km, atomic per store; write-off → refund flag / COD bill cut; auto-cancel if nothing accepted |
| 7.3 | Server sweep | `shopkeeper.controller.ts` / `server.ts` | `sweepStuckOrders` | Every 60 s: 5-min stale allocations, orphaned waiting items |
| 8.1 | Dispatch to online driver | `shopkeeper.controller.ts:426` | `dispatchReadyOrdersToDriver` | 10 km radius |
| 8.2 | Broadcast to drivers | `shopkeeper.controller.ts:488` | `broadcastToNearbyDrivers` | Online+active within 10 km |
| 8.3 | Atomic offer acceptance | `deliveryPartner.controller.ts:639` | `acceptOffer` | `SELECT FOR UPDATE SKIP LOCKED` |
| 9.1 | Pickup code verify | `deliveryPartner.controller.ts:766` | `verifyPickupCode` | Sequential; tracks multi-store progress |
| 10.1 | Road routing | `directions.service.ts:72` | `fetchRoadRoute` | 3-level Google API fallback |
| 10.2 | Polyline decode | `directions.service.ts:15` | `decodePolyline` | RFC 5005 delta encoding |
| 10.3 | Straight-line sampling | `roads.service.ts:16` | `sampleStraightPath` | 150–300 m adaptive spacing |
| 10.4 | Snap to roads | `roads.service.ts:47` | `snapToRoads` | Google Roads API, 100-point limit |
| 10.5 | Route sampling | `deliverySimulation.service.ts:54` | `sampleAlongRoute` | Linear lerp, exact N steps |
| 11.1 | Simulation lifecycle | `deliverySimulation.service.ts:195` | `runDeliverySimulation` | Dev/demo only; 5-phase end-to-end |
| 11.2 | GPS step simulation | `deliverySimulation.service.ts:119` | `moveDriverAlongRoute` | 300 ms per step |
| 12.1 | Mobile order total | `nearandnowcustomerapp/constants/fees.ts:17` | `calcOrderTotal` | Hard-coded ₹25 delivery |
