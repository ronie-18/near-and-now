# Addresses Feature Setup Guide

This guide will help you set up the addresses feature with database persistence.

## Prerequisites

- Supabase account and project set up
- Access to Supabase SQL Editor

## Step 1: Create the Addresses Table

1. Open your Supabase Dashboard
2. Navigate to the **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the contents of `supabase/addresses-schema.sql`
5. Click **Run** to execute the SQL

This will:
- Create the `addresses` table with all required fields
- Add indexes for better performance
- Enable Row Level Security (RLS)
- Create policies to ensure users can only access their own addresses
- Add triggers to automatically update timestamps
- Add a constraint to ensure only one default address per user

## Step 2: Verify the Table

After running the SQL, verify that the table was created:

1. Go to **Table Editor** in your Supabase Dashboard
2. You should see the `addresses` table in the list
3. Click on it to view its structure

## Step 3: Test the Feature

The application is now ready to use the addresses feature!

### Features Implemented:

1. **AddressesPage** (`/addresses`)
   - View all saved addresses
   - Add new addresses
   - Edit existing addresses
   - Delete addresses (except default)
   - Set default address

2. **CheckoutPage** (`/checkout`)
   - Select from saved addresses
   - Add new address during checkout
   - Auto-selects default address
   - Seamless address selection UI

3. **ProfilePage** (`/profile`)
   - Link to manage addresses
   - View saved addresses count

## Database Schema

### Table: `addresses`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| name | VARCHAR(100) | Address label (e.g., "Home", "Office") |
| address_line_1 | TEXT | Primary address line |
| address_line_2 | TEXT | Secondary address line (optional) |
| city | VARCHAR(100) | City name |
| state | VARCHAR(100) | State name |
| pincode | VARCHAR(6) | 6-digit PIN code |
| phone | VARCHAR(15) | Contact phone number |
| is_default | BOOLEAN | Whether this is the default address |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### Security (RLS Policies)

- Users can only view, create, update, and delete their own addresses
- Enforced at the database level for security

### Automatic Features

- Only one default address per user (enforced by trigger)
- Automatic timestamp updates
- Cascade deletion when user is deleted

## Testing Checklist

- [ ] Navigate to `/addresses` page
- [ ] Add a new address
- [ ] Set it as default
- [ ] Add another address
- [ ] Edit an address
- [ ] Delete a non-default address
- [ ] Try to delete default address (should fail)
- [ ] Go to `/checkout`
- [ ] Verify saved addresses are shown
- [ ] Select different addresses
- [ ] Add new address from checkout
- [ ] Complete an order with selected address
- [ ] Verify address persists after refresh

## Troubleshooting

### Issue: "Failed to fetch addresses"

**Solution:** Check that:
1. The addresses table exists in Supabase
2. RLS policies are correctly set up
3. User is authenticated

### Issue: "Failed to create address"

**Solution:** Check that:
1. All required fields are filled
2. User is authenticated
3. Phone number is valid (10 digits starting with 6-9)
4. PIN code is valid (6 digits)

### Issue: Addresses not persisting

**Solution:**
1. Check browser console for errors
2. Verify Supabase connection in `src/services/supabase.ts`
3. Check Supabase logs for database errors

## API Reference

### Service Functions (src/services/supabase.ts)

```typescript
// Get all addresses for a user
getUserAddresses(userId: string): Promise<Address[]>

// Create a new address
createAddress(addressData: CreateAddressData): Promise<Address>

// Update an existing address
updateAddress(addressId: string, userId: string, updateData: UpdateAddressData): Promise<Address>

// Delete an address
deleteAddress(addressId: string, userId: string): Promise<void>

// Set an address as default
setDefaultAddress(addressId: string, userId: string): Promise<Address>
```

## Next Steps

- Test the feature thoroughly with real user accounts
- Consider adding address validation (e.g., Google Places API)
- Add ability to save address during first order
- Implement address search/autocomplete
- Add delivery zone validation based on pincode

## Support

If you encounter any issues:
1. Check the browser console for error messages
2. Check Supabase logs in the Dashboard
3. Verify all SQL queries executed successfully
4. Ensure user authentication is working correctly

