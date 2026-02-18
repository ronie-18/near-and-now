# Near and Now - Project Status

**Last Updated:** February 19, 2026  
**Overall Completion:** ~84%

---

## 📊 Completion Overview

| Area | Completion | Status |
|------|------------|--------|
| Core Shopping (browse, cart, checkout) | ~95% | ✅ Production Ready |
| Order Management & Tracking | ~80% | ⚠️ Good, Needs Partner Flow |
| Admin Panel | ~93% | ✅ Production Ready |
| Customer Features (addresses, profile, help) | ~97% | ✅ Complete |
| Delivery Partner Infrastructure | ~25% | ❌ Significant Work Needed |
| **Overall Project** | **~84%** | ⚠️ In Progress |

---

## ✅ What's Done

### Customer-Facing
- **Home, Shop, Category, Product Detail** – Browse, filtering, search, product randomization
- **Cart** – CartSidebar, CartItem, add/remove, totals
- **Checkout** – Order creation, saved addresses, payment method, location picker, order-for-others; uses saved-address or map-picker coords when present (avoids geocoding failures); ShippingAddress accepts optional lat/lng
- **Orders Page** – Real orders from DB, "Track Order" links
- **Order Tracking Page** – Timeline, status history, delivery info, real-time subscriptions; current status + collapsible tracking history; delivery person details; order items collapsible (initially collapsed); map hidden on delivery, replaced by delivery status box
- **Mock Delivery Simulation** – Auto-runs on track page: store accepts → driver spawns → picks up → delivers (~5 min single-store, ~7 min multi-store). Demo rule: >6 items = multi-store. Driver movement follows road routes (Directions API, bicycling). 5 s buffer at store before in_transit.
- **Tracking by Order Number** – `/track` lookup form, `/track?number=XXX` for guests
- **DeliveryMap** – Google Maps with delivery pin, driver marker, polyline (when coords exist); driver→shop before pickup, driver→customer after; bounds update with driver; pan to customer when within ~35 m; hide store after pickup; 420px height, no legends/zoom/fullscreen
- **Driver Location Polling** – Runs when orderId exists; backend supplies partner IDs for live driver position
- **Map Fallback** – "Map unavailable" message + "View address in Google Maps" link when no coords
- **Open in Google Maps** – Button to open delivery destination in Maps
- **Addresses** – Saved addresses, LocationPicker, MapLocationPicker with search, address type icons (Home/Work/Other); logged-in users default to saved address; layout: saved addresses → Use Current Location → search; geolocation vs reverse-geocode errors handled separately
- **Help Page** – `/help` with FAQs, order/delivery info, contact support
- **Profile** – View/edit profile, email update
- **Auth** – Login, signup, session management
- **Policy Pages** – Terms, Shipping, Privacy, Refund

### Admin Panel
- **Dashboard** – Stats, charts, recent orders, top products (real data); growth % calculated from chart period (first half vs second half)
- **Products** – CRUD, search, filter, sort, image upload
- **Categories** – CRUD, product count
- **Orders** – List, detail view, status updates
- **Customers** – List, search, filter (View Details still placeholder)
- **Reports** – Revenue, orders, products, charts, export
- **Admin Management** – Create, edit, delete admins, RBAC
- **Admin Help Page** – FAQ with answers, contact info, documentation references
- **Placeholder Pages** – Delivery, Offers, Settings, Profile, Notifications (structure/UI only; Delivery/Offers/Settings show "Coming Soon"; Notifications uses mock data)

### Backend & Infrastructure
- **Express API** – `/api/auth`, `/api/products`, `/api/orders`, `/api/customers`, `/api/coupons`, `/api/places`, `/api/delivery`, `/api/tracking`, `/api/notifications`, `/api/payment`
- **Supabase** – Database, RLS, real-time subscriptions
- **Orders** – createOrder, status workflow, order_status_history
- **Tracking** – Realtime for customer_orders, store_orders, order_status_history, driver_locations; getOrderTrackingFull enriches store addresses via reverse geocode
- **Places API** – Geocoding, reverse geocoding, search, place details
- **Store Proximity** – Generic placeholder (no Bangalore hardcode)
- **Payments** – Basic flow (COD only)
- **Coupons** – validateCoupon implemented; getActiveCoupons returns 501 Not Implemented

### Data & Schema
- **customer_orders, store_orders, order_items** – Multi-store order model
- **order_status_history** – Status timeline
- **driver_locations** – GPS tracking table (exists; needs partner app to populate)
- **customer_saved_addresses** – Full address fields, Google Places integration
- **master_products, store_inventory** – Product catalog model

---

## ❌ Critical Issues (Open)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **Delivery partner location updates** – No app/UI for partners to push GPS to `driver_locations` | Map cannot show live driver position; real-time tracking incomplete | High |

### Critical Issues (Resolved ✅)
- ~~Customer /help route missing~~ – Added `/help` route and HelpPage
- ~~Map hidden when no coords~~ – Map fallback + "View in Google Maps" link
- ~~MapLocationPicker showing "Address unavailable" when address exists~~ – Preserve valid address; ignore stale reverse geocode responses

---

## ⚠️ Moderate Issues

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **Multi-store order tracking** – Single view; no per-store status/ETA | Confusing for multi-store orders | Medium |
| 2 | **ETA calculation** – Static estimated_delivery_time; no dynamic ETA from driver | Less accurate expectations | Medium |
| 3 | **Admin Delivery Page** – Placeholder; no partner management/assignment | Can't manage delivery partners | High |
| 4 | **Admin Offers Page** – Placeholder; no coupon/offer management | No discount/coupon system | High |
| 5 | **Payment gateway** – COD only; no Razorpay/Stripe | Limited payment options | High |
| 6 | **Customer Detail Page** – Admin "View Details" is placeholder | No full customer info/history | Low |
| 7 | **Real-time admin notifications** – Static mock data; not from DB | No live admin alerts | Medium |

### Moderate Issues (Resolved ✅)
- ~~Dashboard growth percentages – Hardcoded~~ – Growth now calculated from chart period (first half vs second half of selected range)

---

## 🟢 Easy Issues

### Completed ✅
- Address type icons – Home/Work/Other in AddressesPage and CheckoutPage
- Order for others – Form wiring confirmed
- Tracking by tracking number – `/track?number=XXX` and lookup form
- "Open in Google Maps" button – On tracking page when coords exist
- Map fallback message – "Map unavailable" + link to view address in Maps
- Admin Help Page content – FAQ with answers, contact info
- Customer Help page – `/help` route, HelpPage with FAQs and contact
- **MapLocationPicker address display** – Shows real address when available; preserves existing valid address when reverse geocode fails for same coords; ignores stale responses; only shows "Address unavailable" when no address and reverse geocode fails

### Pending
- **Admin Settings Page** – Add real configuration (store, payment, notifications)
- **Global search in Admin Header** – Search input has no behavior

---

## 📋 What's Left (Summary)

### Tracking & Delivery (High Priority)
- Delivery partner app/UI for GPS updates
- Dynamic ETA from driver location
- Multi-store order tracking view

### Admin Placeholder Pages
- **Delivery** – Partner CRUD, status, assignment, map view
- **Offers** – Coupon CRUD, rules, expiry, usage (backend validateCoupon exists; getActiveCoupons not implemented)
- **Settings** – Store config, payment, delivery, notifications
- **Notifications** – Real-time notifications from DB (currently mock data)

### Other
- Customer Detail Page (admin) – Full view for customers
- Payment gateway – Razorpay/Stripe integration
- Email/SMS notifications for order updates

---

## 📁 Key Files Reference

| Feature | File(s) |
|---------|---------|
| Order Tracking | `frontend/src/pages/OrderTrackingPage.tsx` |
| Delivery Map | `frontend/src/components/tracking/DeliveryMap.tsx` |
| Realtime Tracking | `frontend/src/hooks/useOrderTrackingRealtime.ts` |
| Checkout | `frontend/src/pages/CheckoutPage.tsx` |
| Help (Customer) | `frontend/src/pages/HelpPage.tsx` |
| Help (Admin) | `frontend/src/pages/admin/HelpPage.tsx` |
| Location Picker | `frontend/src/components/location/MapLocationPicker.tsx`, `LocationPicker.tsx` |
| Admin Dashboard | `frontend/src/pages/admin/AdminDashboardPage.tsx` |
| Admin Delivery | `frontend/src/pages/admin/DeliveryPage.tsx` (placeholder) |
| Admin Offers | `frontend/src/pages/admin/OffersPage.tsx` (placeholder) |
| Admin Settings | `frontend/src/pages/admin/SettingsPage.tsx` (placeholder) |
| Driver Locations | `driver_locations` table, `supabase/realtime-tracking-tables.sql` |
| Backend API | `backend/src/server.ts`, `backend/src/controllers/*`, `backend/src/routes/*` |

---

## 🎯 Recommended Priorities

### Phase 1: Remaining Quick Wins (~1 day)
1. Fix Customer Detail page (admin) – full customer view
2. Admin Settings Page – basic store config
3. Admin Header global search – wire to products/orders/customers

### Phase 2: Tracking & Delivery (1–2 weeks)
1. Delivery partner location update flow (web or mobile)
2. Multi-store tracking view
3. Dynamic ETA from driver location

### Phase 3: Admin & Business (2–4 weeks)
1. Admin Delivery page – partner management
2. Admin Offers page – coupon management (backend validateCoupon exists)
3. Payment gateway integration
4. Real-time admin notifications from DB

---

## 📚 Related Documentation

- `docs/ADMIN_PANEL_STATUS.md` – Admin panel details
- `docs/IMPLEMENTATION_PROGRESS.md` – Feature implementation log
- `docs/ECOMMERCE_ROADMAP.txt` – Full roadmap
- `docs/DEPLOYMENT_CHECKLIST.md` – Deployment steps

---

## 💡 Notes

- **Demo setup**: Run `supabase/seed-mock-delivery-partners.sql` before testing the delivery simulation.
- Thank You page auto-redirects to track page after 7 seconds; simulation runs on track page load.
- Core shopping and admin flows are production-ready.
- Order tracking UX: lookup by number, map fallback, Open in Maps; driver polling; route polyline (Directions API); store pin hides after pickup; map hides on delivery.
- Location picker: logged-in users default to saved address; MapLocationPicker shows dropped-pin address correctly (preserves valid address when reverse geocode fails for same coords).
- Checkout uses lat/lng from saved address or map picker to avoid geocoding failures.
- Customer Help and Admin Help pages are live with content.
- Main gap: delivery partner infrastructure (no app to push GPS).
- `driver_locations` table and realtime subscriptions exist; partner app needed.
- Admin panel ~93% complete; Delivery, Offers, Settings are placeholders; Notifications uses mock data.
