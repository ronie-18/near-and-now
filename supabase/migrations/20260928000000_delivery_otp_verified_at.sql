-- markDelivered previously trusted only client-side React state that the
-- delivery OTP had been verified — verifyDeliveryOTP never persisted
-- anything, so a replayed/direct call to the "delivered" endpoint could
-- skip OTP verification entirely and still trigger rider payout. Add a
-- persisted verification timestamp so markDelivered can require it.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_otp_verified_at TIMESTAMPTZ;
