# Twilio OTP Authentication Setup

## Overview

The application uses Twilio Verify API for OTP-based authentication. This provides secure phone number verification for customer login and registration.

## Authentication Flow

### 1. Send OTP
```
User enters phone number → Frontend calls sendOTP() → Backend calls Twilio Verify API → SMS sent to user
```

### 2. Verify OTP
```
User enters OTP → Frontend calls verifyOTP() → Backend verifies with Twilio → 
  → If valid: Check if user exists in database
    → Existing user: Login
    → New user: Register (requires name, landmark, delivery_instructions)
```

## Twilio Setup

### 1. Create Twilio Account
1. Go to https://www.twilio.com/
2. Sign up for a free account
3. Verify your email and phone number

### 2. Create a Verify Service
1. Go to Twilio Console → Verify → Services
2. Click "Create new Service"
3. Give it a name (e.g., "Near and Now OTP")
4. Copy the **Service SID** (starts with `VA...`)

### 3. Get API Credentials
1. Go to Twilio Console → Account → API keys & tokens
2. Copy your **Account SID** (starts with `AC...`)
3. Copy your **Auth Token** (click to reveal)

### 4. Configure Environment Variables

Add to `backend/.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Backend API Endpoints

### POST /api/auth/send-otp
Send OTP to phone number

**Request:**
```json
{
  "phone": "+919876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "status": "pending"
}
```

### POST /api/auth/verify-otp
Verify OTP code

**Request:**
```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "status": "approved"
}
```

**Response (Invalid):**
```json
{
  "error": "Invalid OTP",
  "status": "pending"
}
```

## Frontend Usage

### Send OTP
```typescript
import { useAuth } from '../context/AuthContext';

const { sendOTPCode } = useAuth();

// Send OTP
await sendOTPCode('+919876543210');
```

### Verify OTP (Existing User - Login)
```typescript
const { verifyOTPCode } = useAuth();

// Just verify OTP for existing user
await verifyOTPCode('+919876543210', '123456');
```

### Verify OTP (New User - Register)
```typescript
const { verifyOTPCode } = useAuth();

// Verify OTP and register new user
await verifyOTPCode('+919876543210', '123456', {
  name: 'John Doe',
  email: 'john@example.com',
  landmark: 'Near City Mall',
  delivery_instructions: 'Ring bell twice'
});
```

## Database Schema

### app_users Table
```sql
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  password_hash text,  -- NULL for OTP auth
  role user_role NOT NULL,
  is_activated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### customers Table
```sql
CREATE TABLE customers (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  landmark text NOT NULL,
  delivery_instructions text NOT NULL,
  address text,
  city text,
  state text,
  pincode text,
  country text NOT NULL DEFAULT 'India',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## Security Features

1. **Twilio Verify API**: Industry-standard OTP verification
2. **Rate Limiting**: Twilio automatically rate limits OTP requests
3. **Expiration**: OTPs expire after 10 minutes
4. **Session Management**: Token-based sessions stored in sessionStorage
5. **No Password Storage**: OTP auth doesn't require password storage

## Testing

### Test Phone Numbers (Twilio Trial)
When using a Twilio trial account, you can only send to verified phone numbers:
1. Go to Twilio Console → Phone Numbers → Verified Caller IDs
2. Add your test phone numbers

### Test OTP Codes
In development, you can see the OTP in Twilio Console → Monitor → Logs

## Error Handling

### Common Errors

**"Phone number is not verified"** (Trial Account)
- Solution: Add phone number to Verified Caller IDs in Twilio Console

**"Invalid phone number format"**
- Solution: Use E.164 format: `+[country code][number]` (e.g., `+919876543210`)

**"Too many requests"**
- Solution: Wait before requesting another OTP (rate limited by Twilio)

**"Invalid OTP"**
- Solution: Check if OTP has expired (10 min timeout) or user entered wrong code

## Cost

- **Free Tier**: Twilio provides $15.50 credit for trial
- **Verify API**: ~$0.05 per verification
- **SMS Cost**: Varies by country (India: ~$0.0035 per SMS)

## Production Checklist

- [ ] Upgrade Twilio account from trial to paid
- [ ] Configure proper rate limiting
- [ ] Set up monitoring and alerts
- [ ] Add phone number validation
- [ ] Implement retry logic for failed OTPs
- [ ] Add logging for security audits
- [ ] Configure webhook for delivery status (optional)

## Support

For Twilio-related issues:
- Twilio Documentation: https://www.twilio.com/docs/verify/api
- Twilio Support: https://support.twilio.com/

For application issues:
- Check `backend/src/controllers/auth.controller.ts`
- Check `frontend/src/services/authService.ts`
- Check `frontend/src/context/AuthContext.tsx`
