import { supabase, supabaseAdmin } from './supabase';

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

// Base URL for backend API.
// Prefer VITE_API_URL; optional EXPO_PUBLIC_API_BASE_URL fallback (Expo / shared .env).
// In Vite dev, if VITE_API_URL points at a remote https API, use same-origin `/api` instead so the
// dev server proxy (vite.config) forwards the request — avoids CORS (localhost → production).
const getApiBase = () => {
  let base = (import.meta.env.VITE_API_URL || import.meta.env.EXPO_PUBLIC_API_BASE_URL || '')
    .toString()
    .replace(/\/$/, '');
  if (import.meta.env.DEV && base.startsWith('https://')) {
    return '';
  }
  return base;
};

function isHtmlResponseBody(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

function parseErrorMessageFromResponse(text: string, fallback: string): string {
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text);
    const message = parsed?.message || parsed?.error;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // Not JSON
  }

  if (isHtmlResponseBody(text)) {
    return 'Server returned an internal error page. Please retry in a moment.';
  }

  return text.trim() || fallback;
}

// Send OTP to phone number via Twilio
export async function sendOTP(phone: string): Promise<void> {
  try {
    console.log('📱 Sending OTP to:', phone);

    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}/api/auth/send-otp` : '/api/auth/send-otp';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    if (!response.ok) {
      let message = 'Failed to send OTP';
      try {
        const text = await response.text();
        message = parseErrorMessageFromResponse(text, message);
      } catch {
        // Response body read failed
      }
      throw new Error(message);
    }

    console.log('✅ OTP sent successfully');
  } catch (error: any) {
    console.error('❌ Error sending OTP:', error);
    throw error;
  }
}

// Verify OTP and login/register customer (backend handles creation - role: customer only)
export async function verifyOTP(phone: string, otp: string, userData?: {
  name: string;
  email?: string;
  landmark: string;
  delivery_instructions: string;
}): Promise<AuthResponse> {
  try {
    console.log('� Verifying OTP for:', phone);

    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}/api/auth/verify-otp` : '/api/auth/verify-otp';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        otp: String(otp).trim(),
        name: userData?.name || 'Customer'
      })
    });

    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      let message = parseErrorMessageFromResponse(text, 'Invalid OTP');
      if (!String(message).trim()) message = 'Something went wrong. Please try again.';
      throw new Error(String(message));
    }

    if (!data.user || !data.token) {
      throw new Error('Invalid response from server');
    }

    return {
      user: data.user as AppUser,
      customer: data.customer,
      token: data.token
    };
  } catch (error: any) {
    console.error('Error in verifyOTP:', error);
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

      await supabaseAdmin
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

