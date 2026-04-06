# Razorpay payment testing runbook

This document is the single place to run and record Razorpay test payments for Near and Now.

## Razorpay test pages

- Test mode dashboard: [https://dashboard.razorpay.com/app/payments](https://dashboard.razorpay.com/app/payments)
- API keys (test/live): [https://dashboard.razorpay.com/app/keys](https://dashboard.razorpay.com/app/keys)
- Official test payment methods (cards/UPI/netbanking/wallet): [https://razorpay.com/docs/payments/payments/test-card-details/](https://razorpay.com/docs/payments/payments/test-card-details/)
- Webhooks guide: [https://razorpay.com/docs/webhooks/](https://razorpay.com/docs/webhooks/)

## Environment checklist (before testing)

- `RAZORPAY_KEY_ID` uses a test key (`rzp_test_*`).
- `RAZORPAY_KEY_SECRET` matches the same test key pair.
- Backend API is reachable from frontend (`/api/payment/create`, `/api/payment/verify`).
- Order placement route works (`/api/orders/place`) and DB permissions are valid.

## Payment test scenarios

Run all of these once per release (or when payment code/migrations change):

1. Online payment success (Razorpay test mode).
2. Online payment signature verification failure (tampered payload expected to fail).
3. Payment cancelled by user at Razorpay checkout.
4. Payment failure (use a failing test method from Razorpay docs).
5. COD order still works and does not call Razorpay APIs.
6. Order cancel after paid order (refund flow, if enabled in backend).

## Evidence to capture per test

- Checkout attempt timestamp.
- Internal `customer_orders.id` and `order_code`.
- Razorpay IDs (`razorpay_order_id`, `razorpay_payment_id`) when available.
- API responses from:
  - `POST /api/payment/create`
  - `POST /api/payment/verify`
- Final DB status (`customer_orders.payment_status`, `payment_method`).
- Screenshot of Razorpay test dashboard payment event.

## Test log template

Copy this block for each run and update it:

```md
### Test Case: <name>
- Date:
- Tester:
- Environment: local / staging / production
- Input amount:
- Payment method:
- Internal order id:
- Razorpay order id:
- Razorpay payment id:
- Expected result:
- Actual result:
- API create status/body:
- API verify status/body:
- DB payment_status:
- Pass/Fail:
- Notes:
```

## Current test history

### Run: <YYYY-MM-DD>
- Status: Pending
- Notes: Add first full test cycle result here.
