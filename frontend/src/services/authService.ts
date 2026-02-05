import { supabase } from './supabase';

export interface AppUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'customer' | 'shopkeeper' | 'delivery_partner';
  is_activated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  user_id: string;
  name: string;
  surname: string | null;
  phone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  landmark: string;
  delivery_instructions: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: AppUser;
  customer?: Customer;
  token: string;
}

// Send OTP to phone number via Twilio
export async function sendOTP(phone: string): Promise<void> {
  try {
    console.log('📱 Sending OTP to:', phone);

    // Call backend API to send OTP via Twilio
    const response = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send OTP');
    }

    console.log('✅ OTP sent successfully');
  } catch (error: any) {
    console.error('❌ Error sending OTP:', error);
    throw error;
  }
}

// Verify OTP and login/register user
export async function verifyOTP(phone: string, otp: string, userData?: {
  name: string;
  email?: string;
  landmark: string;
  delivery_instructions: string;
}): Promise<AuthResponse> {
  try {
    console.log('� Verifying OTP for:', phone);

    // Call backend API to verify OTP via Twilio
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Invalid OTP');
    }

    console.log('✅ OTP verified successfully');

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('*')
      .eq('phone', phone)
      .eq('role', 'customer')
      .single();

    let appUser: any;
    let customer: any;

    if (existingUser) {
      // User exists - login
      console.log('👤 Existing user, logging in');
      appUser = existingUser;

      // Get customer data
      const { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', appUser.id)
        .single();

      customer = customerData;
    } else {
      // New user - register
      if (!userData) {
        throw new Error('User data required for registration');
      }

      console.log('📝 New user, registering');

      // Create app_user
      const { data: newUser, error: userError } = await supabase
        .from('app_users')
        .insert({
          name: userData.name,
          phone: phone,
          email: userData.email || null,
          password_hash: null, // No password for OTP auth
          role: 'customer',
          is_activated: true
        })
        .select()
        .single();

      if (userError || !newUser) {
        console.error('❌ Error creating user:', userError);
        throw new Error('Failed to create user account');
      }

      appUser = newUser;

      // Create customer record
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: appUser.id,
          name: userData.name,
          phone: phone,
          landmark: userData.landmark,
          delivery_instructions: userData.delivery_instructions,
          country: 'India'
        })
        .select()
        .single();

      if (customerError) {
        console.error('❌ Error creating customer:', customerError);
        // Rollback user creation
        await supabase.from('app_users').delete().eq('id', appUser.id);
        throw new Error('Failed to create customer profile');
      }

      customer = newCustomer;
    }

    // Generate session token
    const token = crypto.randomUUID();

    // Remove password_hash from response
    const { password_hash, ...userDataClean } = appUser;

    return {
      user: userDataClean as AppUser,
      customer: customer || undefined,
      token
    };
  } catch (error: any) {
    console.error('❌ Error in verifyOTP:', error);
    throw error;
  }
}

// Get current user from session
export async function getCurrentUserFromSession(userId: string): Promise<{ user: AppUser; customer?: Customer } | null> {
  try {
    const { data: appUser, error } = await supabase
      .from('app_users')
      .select('id, name, email, phone, role, is_activated, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !appUser) {
      return null;
    }

    if (appUser.role === 'customer') {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', appUser.id)
        .single();

      return {
        user: appUser as AppUser,
        customer: customer || undefined
      };
    }

    return {
      user: appUser as AppUser
    };
  } catch (error) {
    console.error('❌ Error getting current user:', error);
    return null;
  }
}

// Update customer profile
export async function updateCustomerProfile(userId: string, updates: {
  name?: string;
  email?: string;
  surname?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  delivery_instructions?: string;
}): Promise<void> {
  try {
    // Update app_users if name or email changed
    if (updates.name || updates.email) {
      const appUserUpdates: any = {};
      if (updates.name) appUserUpdates.name = updates.name;
      if (updates.email) appUserUpdates.email = updates.email;

      await supabase
        .from('app_users')
        .update(appUserUpdates)
        .eq('id', userId);
    }

    // Update customers table
    const customerUpdates: any = {};
    if (updates.name) customerUpdates.name = updates.name;
    if (updates.surname !== undefined) customerUpdates.surname = updates.surname;
    if (updates.address !== undefined) customerUpdates.address = updates.address;
    if (updates.city !== undefined) customerUpdates.city = updates.city;
    if (updates.state !== undefined) customerUpdates.state = updates.state;
    if (updates.pincode !== undefined) customerUpdates.pincode = updates.pincode;
    if (updates.landmark !== undefined) customerUpdates.landmark = updates.landmark;
    if (updates.delivery_instructions !== undefined) customerUpdates.delivery_instructions = updates.delivery_instructions;

    if (Object.keys(customerUpdates).length > 0) {
      await supabase
        .from('customers')
        .update(customerUpdates)
        .eq('user_id', userId);
    }

    console.log('✅ Profile updated successfully');
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    throw error;
  }
}

