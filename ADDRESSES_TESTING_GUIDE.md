# Addresses Feature - Testing Guide

## Prerequisites

Before testing, ensure you have:
1. ✅ Run the SQL schema (`supabase/addresses-schema.sql`) in Supabase SQL Editor
2. ✅ Supabase project is connected
3. ✅ User authentication is working
4. ✅ Application is running locally

## Test Plan

### 1. Database Setup (One-time)

**Steps:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents from `supabase/addresses-schema.sql`
3. Paste and run the SQL
4. Verify in Table Editor that `addresses` table exists

**Expected Result:**
- ✅ Table `addresses` created successfully
- ✅ All columns present (id, user_id, name, address_line_1, etc.)
- ✅ RLS enabled
- ✅ Policies created

---

### 2. AddressesPage - View Addresses

**Steps:**
1. Log in to the application
2. Navigate to `/profile`
3. Click "Saved Addresses" link
4. Or directly navigate to `/addresses`

**Expected Result:**
- ✅ Page loads without errors
- ✅ Shows empty state if no addresses
- ✅ "Add New Address" button visible
- ✅ Loading state shows briefly while fetching

---

### 3. AddressesPage - Add New Address

**Steps:**
1. On `/addresses` page
2. Click "Add New Address"
3. Fill in the form:
   - Address Name: "Home"
   - Phone: "9876543210"
   - Address Line 1: "123, Green Valley Apartments"
   - Address Line 2: "Near Central Mall"
   - City: "Bangalore"
   - State: "Karnataka"
   - PIN Code: "560038"
   - Check "Set as default address"
4. Click "Save Address"

**Expected Result:**
- ✅ Success notification appears
- ✅ Form closes
- ✅ New address appears in the list
- ✅ "Default" badge shows on the address
- ✅ Address persists after page refresh

---

### 4. AddressesPage - Add Second Address

**Steps:**
1. Click "Add New Address" again
2. Fill in different details:
   - Address Name: "Office"
   - Phone: "9876543211"
   - Address Line 1: "Block B, Tech Park"
   - City: "Bangalore"
   - State: "Karnataka"
   - PIN Code: "560066"
   - Leave "Set as default" unchecked
3. Click "Save Address"

**Expected Result:**
- ✅ Second address added successfully
- ✅ First address still shows "Default" badge
- ✅ Both addresses visible in list
- ✅ Both persist after refresh

---

### 5. AddressesPage - Edit Address

**Steps:**
1. Click "Edit" on the Office address
2. Change City to "Bengaluru"
3. Click "Update Address"

**Expected Result:**
- ✅ Success notification
- ✅ City updated in the list
- ✅ Change persists after refresh

---

### 6. AddressesPage - Set Default Address

**Steps:**
1. Click "Set as Default" on Office address (at bottom)

**Expected Result:**
- ✅ "Default" badge moves to Office address
- ✅ Home address loses "Default" badge
- ✅ Change persists after refresh

---

### 7. AddressesPage - Delete Address

**Steps:**
1. Try to delete the default (Office) address
2. Then set Home as default
3. Delete Office address

**Expected Result:**
- ✅ Cannot delete default address (error notification)
- ✅ Can delete non-default address
- ✅ Address removed from list
- ✅ Change persists after refresh

---

### 8. CheckoutPage - View Saved Addresses

**Steps:**
1. Add items to cart
2. Go to `/checkout`
3. View Step 1 (Shipping Information)

**Expected Result:**
- ✅ Saved addresses list is visible
- ✅ Default address is pre-selected
- ✅ All addresses show with radio buttons
- ✅ "Add New Address" button visible

---

### 9. CheckoutPage - Select Different Address

**Steps:**
1. On checkout page, Step 1
2. Click radio button for non-default address

**Expected Result:**
- ✅ Address selection changes
- ✅ Form fields auto-populate with selected address
- ✅ Visual highlight on selected address

---

### 10. CheckoutPage - Add New Address During Checkout

**Steps:**
1. On checkout page, Step 1
2. Click "Add New Address"
3. Fill in new address details
4. Continue to payment and place order

**Expected Result:**
- ✅ New address form appears
- ✅ Can enter all address details
- ✅ "Back to saved addresses" link works
- ✅ Can complete order with new address

---

### 11. Integration - Complete Order Flow

**Steps:**
1. Select a saved address in checkout
2. Continue through all checkout steps
3. Complete order
4. Go to `/orders` and view order details

**Expected Result:**
- ✅ Order created with selected address
- ✅ Address shows correctly in order confirmation
- ✅ Address details saved in order

---

### 12. Multi-Device/Session Test

**Steps:**
1. Add/edit address on Device A
2. Open same account on Device B
3. Refresh or navigate to addresses page

**Expected Result:**
- ✅ Changes from Device A visible on Device B
- ✅ No stale data
- ✅ Real-time sync (after refresh)

---

### 13. Validation Tests

**Test Invalid Phone Numbers:**
- "123" (too short) → ❌ Should show error
- "1234567890" (doesn't start with 6-9) → ❌ Should show error
- "9876543210" (valid) → ✅ Should accept

**Test Invalid PIN Codes:**
- "12345" (5 digits) → ❌ Should show error
- "1234567" (7 digits) → ❌ Should show error
- "560038" (valid) → ✅ Should accept

**Test Required Fields:**
- Leave any required field empty → ❌ Should show error
- Fill all required fields → ✅ Should accept

---

### 14. Edge Cases

**Test Empty States:**
1. New user with no addresses
   - ✅ Shows empty state message
   - ✅ "Add New Address" button prominent

**Test Single Address:**
1. User with only one address
   - ✅ Cannot delete the only address if it's default
   - ✅ Can add more addresses

**Test Default Address Logic:**
1. User with 3 addresses
   - ✅ Only one can be default at a time
   - ✅ Setting new default unsets previous

---

### 15. Error Handling

**Test Network Errors:**
1. Disconnect internet
2. Try to save address
   - ✅ Shows error notification
   - ✅ Doesn't crash the app

**Test Unauthorized Access:**
1. Log out
2. Try to navigate to `/addresses`
   - ✅ Redirects to login page

---

### 16. Performance Tests

**Test with Many Addresses:**
1. Add 10+ addresses
   - ✅ Page loads quickly
   - ✅ List is scrollable
   - ✅ No lag in UI

---

### 17. Mobile Responsiveness

**Test on Mobile Device:**
1. Open app on mobile browser
2. Test all address operations
   - ✅ Forms are usable
   - ✅ Buttons are tappable
   - ✅ Layout is responsive
   - ✅ Radio buttons work well

---

## Common Issues & Solutions

### Issue: "Failed to fetch addresses"
- ✅ Check: SQL schema executed successfully
- ✅ Check: RLS policies are enabled
- ✅ Check: User is authenticated
- ✅ Check: Supabase connection is working

### Issue: "Failed to create address"
- ✅ Check: All required fields filled
- ✅ Check: Phone format is correct
- ✅ Check: PIN code format is correct
- ✅ Check: User has valid session

### Issue: Addresses not showing
- ✅ Check: Browser console for errors
- ✅ Check: Network tab for API calls
- ✅ Check: Supabase logs
- ✅ Refresh the page

### Issue: Cannot set default address
- ✅ Check: Trigger is created in database
- ✅ Check: No database constraints violated

---

## Success Criteria

All tests should pass with these results:
- ✅ Users can view all their saved addresses
- ✅ Users can add new addresses
- ✅ Users can edit existing addresses
- ✅ Users can delete non-default addresses
- ✅ Users can set default address
- ✅ Only one default address per user
- ✅ Addresses persist across sessions
- ✅ Checkout page shows saved addresses
- ✅ Users can select address in checkout
- ✅ Orders are created with correct address
- ✅ All validations work correctly
- ✅ Error handling is graceful
- ✅ Mobile responsive design works

---

## Post-Testing

After all tests pass:
1. ✅ Mark feature as complete
2. ✅ Document any edge cases found
3. ✅ Update user documentation if needed
4. ✅ Deploy to production

---

## Automated Testing (Optional)

Consider adding these tests:
```typescript
// Example test cases
describe('Addresses Feature', () => {
  test('User can add a new address', async () => {
    // Test implementation
  });
  
  test('User can edit an address', async () => {
    // Test implementation
  });
  
  test('User can set default address', async () => {
    // Test implementation
  });
  
  test('Cannot delete default address', async () => {
    // Test implementation
  });
});
```

---

## Notes

- Test with different user accounts
- Test with guest vs authenticated users
- Verify data isolation (User A cannot see User B's addresses)
- Check database for orphaned records
- Monitor performance with large datasets
- Test concurrent operations (two tabs open)

---

**Happy Testing! 🎉**


