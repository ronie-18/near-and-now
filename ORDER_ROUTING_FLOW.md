# Order Routing & Driver Assignment Flow

## Overview

This document describes the end-to-end flow from a customer placing an order to a delivery driver picking it up, including store selection, shopkeeper acceptance, item reallocation, and driver broadcast logic.

---

## Radius Rules at a Glance

| Step | Radius | Applied to |
|---|---|---|
| Store selection at order placement | **4 km** from customer (whole ring, not expanding) | Which stores receive the order |
| Item reallocation (shopkeeper can't fulfil) | **8 km** from customer | Store(s) that stock the declined items |
| Driver offer broadcast | **10 km** from the first pickup store | Which online, active drivers get the push |

---

## Phase 1 — Customer Places Order

- The checkout flow geocodes the delivery address to lat/lng.
- `placeCheckoutOrder()` in `backend/src/services/database.service.ts` plans the store split with the shared planner in `backend/src/services/allocationPlanner.ts` (2026-10-04):
  1. Candidate stores = every live store (active, approved, not deleted) within **4 km** of the delivery address, nearest first — the same radius the storefront catalogue shows, so a customer can never see a product they cannot order. (The old code expanded 1→2→3→4 km and stopped at the first ring with *any* store, so a 0.8 km store with one item hid a 1.5 km store that had everything.)
  2. Objective, in priority order: **fewest stores** (a single store that stocks every item takes the whole order — the nearest such store), then **shortest total distance**, then a deterministic store-id tiebreak. Exact search for plans of up to 3 stores, greedy max-coverage beyond that.
  3. Items no candidate store stocks fail the checkout before any write (`Product(s) not available from any store near you: …`).
  4. Stops are ordered farthest-first; that order becomes `sequence_number` (the rider works towards the customer).
  5. One `place_multi_store_order()` call writes `customer_orders`, one `store_orders` + `order_store_allocations` row per stop (`pending_acceptance`) and every `order_items` row — `order_items.product_id` is the fulfilling store's own `products.id`.
- Overall order status: **`pending_at_store`**.
- Each shopkeeper whose store is allocated receives a notification.

---

## Phase 2 — Shopkeeper Accepts (the gate to drivers)

Handled in `backend/src/controllers/shopkeeper.controller.ts`.

The shopkeeper sees the incoming order with all items **unchecked by default**. They tick each item they actually have in stock, then hit Accept.

### On acceptance:

- `accepted_item_ids` is intersected with the items actually assigned to this store on this order; foreign ids are ignored and a request with no valid id is refused (400). An allocation can no longer become `accepted` with nothing in it.
- **Checked items** → `item_status: 'confirmed'`
- **Unchecked items** → `item_status: 'pending'`, `assigned_store_id: null` ("waiting for a store")
  - `reallocateMissingItems()` fires asynchronously (see Phase 2b below). Only if no store can take an item is it written off as `unavailable`.
- The accept and reject writes are both guarded by `status = 'pending_acceptance'`, so two devices on one store account (or an accept racing a reject) can never both win.
- The store's own `store_orders` row becomes `store_accepted`.
- `finalize_order_if_ready()` then decides (atomically, order row locked): **no allocation `pending_acceptance`**, **no item waiting for a store**, and **at least one accepted allocation with accepted items** → order moves to **`ready_for_pickup`** and `broadcastToNearbyDrivers()` fires. Otherwise the order shows `store_accepted` and waits.

### On rejection (or no answer within 5 minutes):

- Allocation marked `rejected` (status-guarded)
- The store's items go back to "waiting for a store"; its `store_orders` row is closed as `order_cancelled` **for that store only** (so its order history, per-store revenue and `check_order_completion` stop counting it; `accept_driver_offer()` skips such rows)
- `reallocateMissingItems()` fires for those items

---

## Phase 2b — Item Reallocation

`reallocateMissingItems(orderId, itemIds)` in `shopkeeper.controller.ts` (serialised per order in-process; the database function is the real guard):

1. Re-reads which of the items are still waiting for a store and resolves each `order_items.product_id` (store-scoped) to its **master product** — the old code compared `master_product_id` against the store-scoped id and so never found a match; every declined item went straight to the refund queue.
2. Candidate stores = live stores within **8 km**, nearest first, excluding every store that has ever had an allocation on this order (a store that declined is not asked again).
3. Runs the same planner as placement over the waiting items: fewest stores, then shortest total distance — so a farther store only wins when it saves the rider a stop.
4. For each planned stop calls `reallocate_items_to_store(order, store, [{item_id, product_id}])` (migration `20261004000000`), which in **one transaction** with the order row locked: checks the order is still pre-dispatch and the store live and unused, validates every item is waiting and the product row is that store's active listing of the same master product, inserts the `pending_acceptance` allocation with the next `sequence_number`, creates/reuses the `store_orders` row, repoints `order_items` (store, store_order, **product_id**, status `pending`), and recomputes per-store subtotals.
5. The new store's shopkeeper is notified (previously only their 10 s poll would show it) and must accept as in Phase 2.
6. Items nobody stocks are written off: `item_status: 'unavailable'`, an `admin_notifications` row of type `refund_required` (admin triggers the money via `POST /api/payment/resolve-item-refund`), a customer notification naming the items, and for **cash-on-delivery** orders the dropped lines are taken off `total_amount`/`subtotal_amount` so the rider collects what the customer actually receives.
7. Finally `finalize_order_if_ready()` runs. If instead **no store accepted anything and nothing is pending**, the order is **cancelled automatically** with refund/coupon release/notifications (`databaseService.cancelOrder`) instead of sitting at `pending_at_store` forever.

> **Self-healing:** `sweepStuckOrders()` runs every 60 s from `server.ts` (non-Vercel). It expires allocations unanswered for 5 minutes (only on orders the shopkeeper could see, i.e. COD or paid) and re-homes items left waiting with nothing in flight — e.g. after a crash between "release items" and "new store". The tracking-endpoint watchdogs still run too, but nothing depends on the customer keeping the app open any more.

---

## Phase 2c — Payment gates and cancellation (what stores can see and do)

- **Visibility.** A store sees an allocation only when the order is payable: COD, or `payment_status` in `paid` / `partially_refunded` (a per-item admin refund leaves the rest of the order paid; it used to hide the order from its remaining stores for good). Shopkeepers are pushed "New Order" at checkout for COD, and at the moment payment lands for online/wallet orders (`notifyStoresOrderPayable`), not before.
- **Accept/reject** refuse (409) once the order is no longer at the store stage (cancelled, dispatched).
- **Add-on items** (30 s window) are only taken for a paid/COD order still at the store stage, only for stores still part of it; `apply_order_addition_request()` (migration `20261004040000`) adds them to an already-accepted store's accepted list so the rider collects them, and refuses (→ automatic refund of the add-on payment) if the store or order has moved on.
- **Cancellation** always goes through `cancel_customer_order()` + `databaseService.cancelOrder()` — customer, admin override (`PATCH /api/orders/:id/status` with `order_cancelled`) and the automatic "nobody can fulfil it" path alike. It refunds every captured payment up to what that payment captured (the UPI share of a split order; the main payment and each paid add-on separately), releases the coupon, closes allocations and offers, notifies stores, and writes the `order_cancelled` history row. Riders cannot cancel (tracking updates refuse `order_cancelled`); they *release* (Phase 4).
- **Money after cancel.** A payment captured for an already-cancelled order (late webhook, wallet) is never marked paid: the payment id is recorded and a full-amount `refund_required` admin notification is raised; `pay_order_with_wallet()` (migration `20261004050000`) refuses outright.

---

## Phase 3 — Driver Broadcast

`broadcastToNearbyDrivers(orderId)` in `shopkeeper.controller.ts` (lines 488–532):

1. Reads `delivery_latitude` / `delivery_longitude` from `customer_orders`.
2. Pulls every row from the `driver_locations` table.
3. Runs Haversine distance on each row — keeps only drivers within **10 km** of the customer.
4. Filters to `is_online = true` AND `status = 'active'` on the `delivery_partners` table.
5. Upserts one `driver_order_offers` row per qualifying driver (`onConflict: ignoreDuplicates`).
6. Fires Expo push notifications to each driver's `expo_push_token`.

### Catchup broadcast (drivers who were offline)

`dispatchReadyOrdersToDriver(driverId)` fires in two situations:
- When a driver **goes online** (toggle in the app)
- When a driver **updates their GPS location** (throttled to once every 5 minutes)

This scans all `ready_for_pickup` orders within 10 km and creates offer rows for the driver if they don't already have one. This prevents drivers from missing orders that went live while they were offline.

---

## Phase 4 — Driver Accepts (race-condition safe)

Handled in `backend/src/controllers/deliveryPartner.controller.ts` (lines 639–681).

Drivers poll `/delivery-partner/available-orders` every 5 seconds and see their pending `driver_order_offers` rows. When a driver taps Accept:

1. Backend calls the Postgres RPC `accept_driver_offer(p_offer_id, p_driver_id)`.
2. The RPC uses `SELECT FOR UPDATE SKIP LOCKED` — the first driver to call it locks the row; any concurrent call returns `'already_taken'` immediately with no conflict.
3. On success:
   - This driver's offer → `accepted`
   - All other drivers' offers for the same order → `expired`
   - `customer_orders.assigned_driver_id` set, status → **`delivery_partner_assigned`**
   - `store_orders.delivery_partner_id` set on all store sub-orders

---

## Phase 4b — Rider releases an order

`rejectOrder` (`deliveryPartner.controller.ts`) puts an order back in the pool **only while it is `delivery_partner_assigned`** — once any store has been picked up it refuses (409). It unassigns the rider, marks that rider's offer `rejected`, and immediately re-runs `broadcastToNearbyDrivers()`, which now **re-opens `expired` offers** (the other riders' offers expired when this rider won; before, nobody from the original broadcast could ever be offered the order again). `dispatchReadyOrdersToDriver` does the same for a rider coming back online. The legacy direct-claim endpoint (`POST /delivery-partner/orders/:id/accept`) only claims a `ready_for_pickup` order with no rider; the legacy `/picked-up` only works from the assigned/collecting stage.

---

## Full Status Lifecycle

```
Customer places order
        │
        ▼
pending_at_store
  (stores allocated, shopkeepers notified)
        │
        ▼  (some stores accept, reallocation in progress)
store_accepted
        │
        ▼  (ALL allocations resolved — no pending_acceptance rows remain)
ready_for_pickup  ──► broadcastToNearbyDrivers() fires
        │
        ▼  (driver accepts via RPC)
delivery_partner_assigned
        │
        ▼
en_route_pickup  →  picked_up  →  en_route_delivery  →  delivered
```

---

## Key Files

| Concern | File | Key lines |
|---|---|---|
| Store assignment at order creation | `backend/src/services/database.service.ts` | `placeCheckoutOrder()` |
| Allocation planner (shared) | `backend/src/services/allocationPlanner.ts`, `storeAllocation.service.ts` | `planAllocation()`, `fetchCandidateStores()`, `fetchStoreStock()` |
| Shopkeeper accept / reject | `backend/src/controllers/shopkeeper.controller.ts` | `acceptAllocation()`, `rejectAllocation()` |
| Item reallocation | `backend/src/controllers/shopkeeper.controller.ts` | `reallocateMissingItems()`, `settleOrderAfterReallocation()` |
| Atomic reallocation step | `supabase/migrations/20261004000000_reallocate_items_to_store_rpc.sql` | `reallocate_items_to_store()` |
| Finalize gate | `supabase/migrations/20261004010000_finalize_order_if_ready_require_items_placed.sql` | `finalize_order_if_ready()` |
| Server sweep | `backend/src/controllers/shopkeeper.controller.ts`, `server.ts` | `sweepStuckOrders()` |
| Broadcast to drivers | `backend/src/controllers/shopkeeper.controller.ts` | `broadcastToNearbyDrivers()` L488–532 |
| Catchup broadcast on login/location | `backend/src/controllers/shopkeeper.controller.ts` | `dispatchReadyOrdersToDriver()` L426–486 |
| Driver location upsert | `backend/src/controllers/deliveryPartner.controller.ts` | `updateLocation()` L143–180 |
| Available orders query | `backend/src/controllers/deliveryPartner.controller.ts` | `getAvailableOrders()` L565–635 |
| Atomic offer acceptance RPC | `supabase/migrations/20260427000000_multi_store_allocation_dispatch.sql` | `accept_driver_offer()` L75–143 |
| Haversine helper | `backend/src/controllers/shopkeeper.controller.ts` | L19–24 |
