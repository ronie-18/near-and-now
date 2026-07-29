import { apiUrl } from '../utils/apiBase';
import { getAuthHeaders, authedFetch } from '../utils/authHeader';

export interface AppUser {
  id: string;
  name: string;
  email: string | null;
  email_verified_at?: string | null;
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
  isNewUser: boolean;
}

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

    const url = apiUrl('/api/auth/send-otp');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const text = await response.text();

    if (isHtmlResponseBody(text)) {
      throw new Error(
        'Login API is not reachable at this URL (got a web page instead of JSON). If you use a custom domain, add it to the same Vercel project as the API or set VITE_API_URL to your *.vercel.app URL until /api works on that domain.'
      );
    }

    if (!response.ok) {
      const message = parseErrorMessageFromResponse(text, 'Failed to send OTP');
      throw new Error(message);
    }

    try {
      const data = text ? JSON.parse(text) : {};
      if (data.success !== true) {
        throw new Error(
          typeof data.error === 'string' ? data.error : data.message || 'Failed to send OTP'
        );
      }
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        throw new Error('Invalid response from server when sending OTP');
      }
      throw e;
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

    const url = apiUrl('/api/auth/verify-otp');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        otp: String(otp).trim(),
        name: userData?.name || 'Customer',
        email: userData?.email
      })
    });

    const text = await response.text();
    if (isHtmlResponseBody(text)) {
      throw new Error(
        'Login API is not reachable at this URL (got a web page instead of JSON). Set VITE_API_URL to your Vercel API origin or fix custom domain routing for /api.'
      );
    }
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
      token: data.token,
      isNewUser: Boolean(data.isNewUser)
    };
  } catch (error: any) {
    console.error('Error in verifyOTP:', error);
    throw error;
  }
}

// Get current user from session — routed through the backend (GET
// /api/customers/me, requireCustomer-gated) rather than the browser's own
// anon Supabase client. The anon client is blocked by RLS on both
// app_users and customers (this app doesn't sign in via supabase.auth, so
// auth.uid() is always NULL), so this always silently returned null before
// — masked in the one real caller (AuthContext.tsx's updateUserProfile) by
// a fallback to an optimistic local update, so a "successful" profile save
// never actually re-synced with the real server state. The backend derives
// the caller's identity from the bearer token, so `userId` is no longer
// meaningful here — kept in the signature only so the existing call site
// doesn't need touching.
export async function getCurrentUserFromSession(_userId: string): Promise<{ user: AppUser; customer?: Customer } | null> {
  try {
    const res = await authedFetch(apiUrl('/api/customers/me'), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.user) return null;

    return {
      user: data.user as AppUser,
      customer: data.customer || undefined,
    };
  } catch (error) {
    console.error('❌ Error getting current user:', error);
    return null;
  }
}

// Update customer profile. Routed through the backend's PATCH /api/customers/me
// (requireCustomer-gated) rather than writing to app_users/customers directly
// from the browser — the direct-Supabase version this replaced only ever
// "worked" for name because of a misconfigured RLS policy on app_users that
// granted anon full read/write (see Supabase schema & migrations → Critical
// in bug_fixes_2026-07-23.md); its write to `customers` had zero grants at
// all and always 401'd, silently, since the caller never checked the result.
// `email` was dropped from the accepted fields — it was already dead here in
// practice (the only real caller, ProfilePage.tsx, only ever passes `name`;
// email changes go through the separate OTP-verified changeCustomerEmail flow).
export async function updateCustomerProfile(_userId: string, updates: {
  name?: string;
  surname?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  delivery_instructions?: string;
}): Promise<void> {
  const response = await authedFetch(apiUrl('/api/customers/me'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseErrorMessageFromResponse(text, 'Failed to update profile'));
  }
}

async function postJson(path: string, body?: Record<string, unknown>): Promise<any> {
  const response = await authedFetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Request failed');
  }
  return data;
}

/** Sets (first time) or stages a change of (subsequent times) the customer's email. Sends a 4-digit code. */
export async function changeCustomerEmail(email: string): Promise<void> {
  await postJson('/api/customers/email/change', { email });
}

/** Confirms the 4-digit code emailed by changeCustomerEmail/resendEmailVerificationCode. */
export async function verifyCustomerEmailCode(code: string): Promise<{ email: string }> {
  const data = await postJson('/api/customers/email/verify', { code });
  return { email: data.email };
}

/** Regenerates and resends the verification code for whichever email is currently unverified. */
export async function resendEmailVerificationCode(): Promise<void> {
  await postJson('/api/customers/email/resend');
}

