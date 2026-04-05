-- =============================================================================
-- Part 1 of 2 — Enum types only (must commit before Part 2)
--
-- PostgreSQL forbids using enum labels added via ALTER TYPE ... ADD VALUE in the
-- same transaction (55P04). Part 2 casts text to payment_status / payment_method;
-- those statements live in 20260405000001_*.
--
-- Prerequisites: none beyond a normal public schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART 1 — Enum types (idempotent)
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.payment_status as enum (
    'pending',
    'authorized',
    'paid',
    'failed',
    'cancelled',
    'refunded',
    'partially_refunded'
  );
exception
  when duplicate_object then null;
end $$;

-- If the type already existed with fewer labels, CREATE TYPE is skipped; add missing labels.
alter type public.payment_status add value if not exists 'pending';
alter type public.payment_status add value if not exists 'authorized';
alter type public.payment_status add value if not exists 'paid';
alter type public.payment_status add value if not exists 'failed';
alter type public.payment_status add value if not exists 'cancelled';
alter type public.payment_status add value if not exists 'refunded';
alter type public.payment_status add value if not exists 'partially_refunded';

do $$ begin
  create type public.payment_method as enum (
    'razorpay',
    'cod'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.payment_method add value if not exists 'razorpay';
alter type public.payment_method add value if not exists 'cod';

comment on type public.payment_status is
  'Razorpay: pending, authorized, paid, failed. COD: pending, paid, cancelled, refunded; optionally partially_refunded.';

comment on type public.payment_method is
  'cod = cash on delivery; razorpay = online (card/UPI/wallet via Razorpay).';

do $$ begin
  create type public.delivery_partner_status as enum (
    'pending_verification',
    'active',
    'inactive',
    'suspended',
    'offboarded'
  );
exception
  when duplicate_object then null;
end $$;

-- Existing DBs that created this enum before 'inactive' existed (PG 15+)
alter type public.delivery_partner_status add value if not exists 'inactive';

comment on type public.delivery_partner_status is
  'pending_verification = not yet verified; active = verified and currently taking deliveries; inactive = verified but not delivering; suspended = admin/policy block; offboarded = exited.';
