# Payments, delivery partners, and payouts — overview for leadership

**Purpose of this note:** Explain, in plain language, what a planned one-time database update does for Near and Now, why it matters for the business, and what to watch for. It is **not** a technical runbook; your engineering team runs the actual steps.

---

## In one sentence

We are aligning the **database** with how the product is supposed to handle **customer payments (including Razorpay)**, **delivery partners**, and **future payouts to stores and partners**—so money and responsibilities are tracked clearly as the business grows.

---

## Why this matters (business view)

| Topic | What it means for the business |
|--------|--------------------------------|
| **Customer payments** | Each order can be tied to a clear payment state (pending, paid, failed, refunded, etc.) and whether the customer paid online (Razorpay) or cash on delivery. |
| **Delivery partners** | Partners have a clear **lifecycle**: not yet verified → verified but **not** currently delivering → **actively** delivering → or blocked / exited. This supports scheduling, trust, and later reporting. |
| **Payouts (stores & partners)** | The structure is in place to record **how much** we owe **which store** and **which delivery partner** for which order—before finance actually sends money. |
| **Central ledger (optional use)** | A place to log money **in** and **out** for audits and finance, linked to orders and payouts. |

None of this replaces your payment provider (Razorpay); it **records and structures** what happened in **your** systems.

---

## What “running the update” does (simplified)

Think of it as **installing the filing system** for money and partners:

1. **Labels (enums)** for payment and partner status so data stays consistent (no random spellings in the database).
2. **Customer orders** use those labels for payment type and payment status.
3. **Customer payments** table (per order) is created or upgraded and linked to customers and orders.
4. **Delivery partners** table is **rebuilt** with clearer rules (verification vs actively delivering vs not delivering, plus timestamps).  
5. **Payout tables** are created for **stores**, **delivery partners**, and an optional **ledger**.
6. A simple **order summary** view helps reporting (e.g. how many stores and items per order).

Your tech team runs a **single combined SQL script** that performs these steps in the right order.

---

## Will it “just work”?

**Yes, if:**

- The **live (or staging) database** already has the core tables the product uses today: users, customers, orders, stores, store orders, order line items, etc.
- A small **database helper function** used elsewhere for “last updated” timestamps already exists (same as for other tables).
- Someone **qualified** runs the script in the right environment (usually staging first, then production).

**No / not without extra steps if:**

- You **already have important rows** in **delivery partner payouts** or **platform ledger** tables—the script may **remove and recreate** some of those structures; **backup or export** first if anything valuable is there.
- The **delivery partners** section of the script **drops and recreates** the partners table—any **existing partner rows** in that table must be **exported and re-imported** if you need to keep them (your tech team handles this).

So: **technically it works** when prerequisites are met and the team accounts for **data that would be wiped** in the destructive steps.

---

## Risks leadership should be aware of

| Risk | Mitigation (high level) |
|------|-------------------------|
| **Data loss** on certain tables during partner/payout/ledger recreation | Backup before production; test on **staging** first; export partner data if needed. |
| **Downtime** | Usually minimal if the script is fast; run in a **maintenance window** if your team recommends it. |
| **App must match the database** | Engineering has already aligned the **app** with new payment labels (e.g. online vs cash). After the DB update, old code paths should not assume old column types. |

---

## After the update — what you can expect

- **Clearer reporting** on payment status and partner state (verified vs on duty vs off duty).
- **Foundation** for paying stores and partners **per order** without hacking spreadsheets.
- **Fewer inconsistencies** in how payment and partner states are stored.

The app does **not** automatically create payout rows for every order yet—that is **future business logic** (when an order is delivered, how much to pay whom). The **structure** is what this update provides.

---

## Suggested approvals / owners

| Area | Owner |
|------|--------|
| **Go / no-go** for production | Product or operations lead + engineering lead |
| **Backup & staging test** | Engineering / DBA |
| **Partner data** if partners already exist in DB | Operations + engineering (export/reload plan) |
| **Finance** | Informed that payout and ledger **tables** exist; settlement rules still defined by the business |

---

## Questions to ask your tech team before sign-off

1. Has this been run successfully on **staging** with a recent copy of production-like data?
2. Do we have a **backup** and a **rollback or restore** plan if something goes wrong?
3. Are **delivery partner** records **exported** if we need to keep them through the table recreation?
4. When will **customer_payouts** rows be **created** for each order (if not already)—who owns that product decision?

---

*Document version: aligned with the combined migration `20260405000000_combined_customer_payments_enums_payouts.sql`. For technical detail, see that file and your engineering team.*
