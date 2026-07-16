# GST calculation, explained (forward and reverse)

Reference doc for how GST is added when showing a price, and how it's reversed back out when generating a tax invoice. Written to answer "why does ×1.05 / ÷1.18 give this number" without re-deriving it from scratch each time. Companion to the "Pricing model / GST reference" section in `bug_fixes_2026-07-16.md`.

---

## The two GST layers on this platform

1. **Per-item GST** — baked into each product's sellable price. `master_products.discounted_price` is the pre-tax base; `master_products.gst_rate` is a per-product percentage (0 for loose products, `is_loose = true`).
2. **A separate flat 5% GST on the whole bill at checkout** — mandated by GoI as a business-level tax, applied on top of the already-GST-inclusive item subtotal. Not double taxation — confirmed intentional by the product owner.

Both layers use the exact same math, described below, just applied at different points (per item vs. on the whole subtotal).

---

## Forward direction: adding tax to a price

"Add X% tax to a value" and "multiply that value by `(1 + X/100)`" are the same operation:

```
V + (V × X/100)              ← "V, plus X% of V"
= V × (1 + X/100)            ← factor V out
```

For X = 18: `1 + 18/100 = 1.18`. For X = 5: `1 + 5/100 = 1.05`. These multipliers (`1.18`, `1.05`) aren't separate constants someone chose — they fall straight out of the tax rate.

**Worked example (layer 1, per item):** a packaged product with `discounted_price = ₹100` and `gst_rate = 18`:

```
sellable price = 100 × 1.18 = ₹118
```

That ₹118 is what the customer sees on the product card, in the cart, and pays per unit.

**Worked example (layer 2, whole bill):** cart subtotal (sum of already-GST-inclusive item prices) = ₹286:

```
after flat checkout GST = 286 × 1.05 = ₹300.30
```

---

## Reverse direction: recovering the pre-tax value from an already-taxed amount

An invoice needs to show, per line, how much of the amount *already charged* was the real product cost versus how much was tax. Start from the forward relationship:

```
charged = P × (1 + X/100)
```

Divide both sides by `(1 + X/100)` to isolate `P` — dividing is the exact inverse of the multiplication that produced `charged` in the first place:

```
charged ÷ (1 + X/100) = P
```

**Worked example:** 2 units of the ₹118 item above → `charged = 236`, `X = 18` → multiplier `1.18`:

```
taxable_value = 236 ÷ 1.18 = ₹200
```

**Sanity check (always do this):** multiply back — `200 × 1.18 = 236` ✓. If it doesn't reproduce the original charged amount, the rate used for the reversal is wrong.

The tax itself is the difference: `236 − 200 = ₹36`, split evenly into CGST + SGST for intra-state supply (India splits GST in half between the two): `₹18 CGST + ₹18 SGST`. This is what `calcGstSplit()` in `backend/src/services/invoice.service.ts` computes.

**This does not mean the customer is charged an extra ₹200.** `200 + 18 + 18 = 236` — the exact amount already on the receipt, just decomposed into its base-price and tax components for the legally-required invoice breakdown.

---

## End-to-end example (both layers together)

Cart:

| Item | Pre-tax (`discounted_price`) | `is_loose` | `gst_rate` | Sellable price | Qty | Line total |
|---|---|---|---|---|---|---|
| Packaged rice | ₹100 | false | 18% | ₹100 × 1.18 = ₹118 | 2 | ₹236 |
| Loose tomatoes | ₹50 | true | 0% (forced) | ₹50 | 1 | ₹50 |

**Item subtotal** (what's actually charged for products): `236 + 50 = ₹286`

**Layer 2 — flat checkout GST on the subtotal:**
```
286 × 1.05 = ₹300.30   (₹14.30 of flat GST: ₹7.15 CGST + ₹7.15 SGST)
```

**Plus fixed fees:**
```
+ platform fee  ₹9.50
+ handling fee  ₹5.50
+ delivery fee  ₹20.00 (distance-tiered)
+ tip           ₹10.00 (customer's choice)
─────────────────────────
order_total     ₹345.30 → rounded to ₹345
```

**On the invoice**, each line reverses its own layer-1 tax using its own real rate:

| Item | Charged | ÷ multiplier | Taxable value | CGST | SGST |
|---|---|---|---|---|---|
| Packaged rice (×2) | ₹236 | ÷ 1.18 | ₹200 | ₹18 | ₹18 |
| Loose tomatoes (×1) | ₹50 | ÷ 1.00 | ₹50 | ₹0 | ₹0 |

...and the flat 5% layer-2 tax is computed once on the ₹286 subtotal (not per line) and folded into the invoice's overall CGST/SGST totals, matching how platform/handling fee GST is already handled. `grand_total` on the invoice reconciles exactly to the ₹345 the customer paid.

---

## Where this is implemented

| Concern | File |
|---|---|
| Per-item GST-inclusive price (layer 1) | `frontend/src/utils/priceGst.ts`, `admin/src/utils/priceGst.ts`, `frontend/src/services/supabase.ts:206-221` |
| Flat checkout-level 5% (layer 2) | `frontend/src/utils/checkoutCalculations.ts` |
| Server-side trusted price recompute + floor check | `backend/src/services/database.service.ts` (`placeCheckoutOrder`) |
| Invoice reverse-GST per line + layer-2 fold-in | `backend/src/services/invoice.service.ts` (`calcGstSplit`, `buildInvoiceData`) |

If GoI changes the flat 5% rate, it needs updating in **two independent hardcoded places**: `frontend/src/utils/checkoutCalculations.ts` (`DEFAULT_GST_RATE`) and `backend/src/services/invoice.service.ts` (`DEFAULT_GST_RATE`) — and the `× 1.05` floor multiplier in `database.service.ts`'s `placeCheckoutOrder`. These aren't currently shared from one source of truth.
