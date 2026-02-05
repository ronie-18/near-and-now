# Login System Update - New Database Schema

## Overview

The login system has been updated to work with the new database schema. The authentication flow has changed from OTP-based to password-based authentication.

## Changes Made

### 1. New Authentication Service (`frontend/src/services/authService.ts`)

Created a new authentication service that works with the new database schema:

**Key Features:**
- Password-based authentication (bcrypt hashing)
- Separate `app_users` and `customers` tables
- Session management with sessionStorage
- Registration with required fields (landmark, delivery_instructions)

**Functions:**
- `registerCustomer()` - Register new customer account
- `loginWithPassword()` - Login with phone and password
- `getCurrentUserFromSession()` - Get user data from session
- `updateCustomerProfile()` - Update customer information
- `changePassword()` - Change user password

### 2. Updated AuthContext (`frontend/src/context/AuthContext.tsx`)

**Old Flow (OTP-based):**
```typescript
loginWithPhone(phone) → verifyOTPCode(phone, otp) → authenticated
```

**New Flow (Password-based):**
```typescript
login(phone, password) → authenticated
register(data) → authenticated
```

**New Context API:**
```typescript
interface AuthContextType {
  user: AppUser | null;
  customer: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (data: any) => Promise<void>;
}
```

### 3. Database Schema Changes

**New Tables:**
- `app_users` - Base user table with role (customer, shopkeeper, delivery_partner)
- `customers` - Customer-specific data (linked to app_users)
- `admins` - Separate admin authentication

**Key Fields:**
```sql
app_users:
  - id (uuid)
  - name (text)
  - email (text, nullable)
  - phone (text, nullable)
  - password_hash (text)
  - role (user_role enum)
  - is_activated (boolean)

customers:
  - user_id (uuid, references app_users)
  - name (text)
  - phone (text, unique)
  - landmark (text, required)
  - delivery_instructions (text, required)
  - address, city, state, pincode (optional)
```

## Migration Guide

### For Existing Users

If you have existing users in the old schema, you need to migrate them:

1. **Export existing users** from Supabase Auth
2. **Create app_users records** with hashed passwords
3. **Create customers records** linked to app_users
4. **Update any existing orders** to reference new user IDs

### For New Installations

1. Apply the new database schema:
   ```sql
   -- Run docs/near_and_now_schema_tables
   -- Run docs/near_and_now_schema_functions
   ```

2. The system will work immediately with the new authentication flow

## Usage Examples

### Customer Registration

```typescript
const { register } = useAuth();

await register({
  name: "John Doe",
  phone: "+919876543210",
  email: "john@example.com",
  password: "securePassword123",
  landmark: "Near City Mall",
  delivery_instructions: "Ring bell twice"
});
```

### Customer Login

```typescript
const { login } = useAuth();

await login("+919876543210", "securePassword123");
```

### Admin Login

Admin login remains similar but uses the new `admins` table:

```typescript
// AdminLoginPage.tsx
const result = await authenticateAdmin(email, password);
```

## Security Improvements

1. **Password Hashing**: Uses bcrypt with 10 salt rounds
2. **Session Management**: Token-based sessions stored in sessionStorage
3. **Separate Admin Table**: Admins are completely separate from regular users
4. **RBAC for Admins**: Role-based access control with granular permissions

## Breaking Changes

### ⚠️ Important

1. **OTP Authentication Removed**: No longer using Supabase Auth OTP
2. **Phone + Password Required**: Users must provide both phone and password
3. **Registration Fields**: Now requires `landmark` and `delivery_instructions`
4. **Session Storage**: Uses sessionStorage instead of Supabase Auth sessions

### Components That Need Updates

The following components may need updates to work with the new auth system:

1. **LoginPage.tsx** - Update to use password input instead of OTP
2. **AuthModal.tsx** - Add password field and registration form
3. **ProfilePage.tsx** - Update to use new customer fields
4. **AddressesPage.tsx** - Use `customer_saved_addresses` table

## Testing Checklist

- [ ] Customer registration works
- [ ] Customer login works
- [ ] Session persists on page reload
- [ ] Logout clears session
- [ ] Profile updates work
- [ ] Admin login works
- [ ] Protected routes work correctly

## Next Steps

1. Update LoginPage to use password authentication
2. Update AuthModal component for new flow
3. Test registration and login flows
4. Update profile management pages
5. Migrate existing users (if any)

## Support

For issues or questions about the new authentication system, refer to:
- `frontend/src/services/authService.ts` - Authentication logic
- `frontend/src/context/AuthContext.tsx` - Auth context provider
- `docs/near_and_now_schema_tables` - Database schema
