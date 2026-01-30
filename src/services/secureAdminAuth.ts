/**
 * Secure Admin Authentication Service
 * Uses Edge Functions with JWT tokens instead of localStorage
 */

import { checkRateLimit } from '../utils/rateLimit';
import { logFailedLogin, logSecurityEvent, isAccountLocked } from './auditLog';
import { AdminLoginSchema } from '../schemas/admin.schema';
import { z } from 'zod';

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/admin-auth';

interface AdminAuthResponse {
  admin: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    permissions: string[];
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * Secure admin login using Edge Function
 */
export async function secureAdminLogin(email: string, password: string): Promise<AdminAuthResponse | null> {
  try {
    // Validate input
    const validatedInput = AdminLoginSchema.parse({ email, password });
    
    // Check rate limit
    if (!checkRateLimit('ADMIN_LOGIN', validatedInput.email)) {
      await logSecurityEvent(
        'RATE_LIMIT_EXCEEDED',
        'medium',
        `Admin login rate limit exceeded for ${validatedInput.email}`
      );
      throw new Error('Too many login attempts. Please try again in 15 minutes.');
    }
    
    // Check if account is locked
    const locked = await isAccountLocked(validatedInput.email);
    if (locked) {
      await logSecurityEvent(
        'ACCOUNT_LOCKED',
        'high',
        `Login attempt on locked account: ${validatedInput.email}`
      );
      throw new Error('Account is locked due to multiple failed login attempts. Please try again in 15 minutes.');
    }
    
    // Call Edge Function for authentication
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important for cookies
      body: JSON.stringify({
        action: 'login',
        email: validatedInput.email,
        password
      })
    });
    
    if (!response.ok) {
      // Log failed login
      await logFailedLogin(validatedInput.email);
      
      await logSecurityEvent(
        'FAILED_LOGIN',
        'medium',
        `Failed admin login attempt for ${validatedInput.email}`
      );
      
      return null;
    }
    
    const data = await response.json();
    
    // Store access token in memory (not localStorage!)
    sessionStorage.setItem('adminAccessToken', data.accessToken);
    sessionStorage.setItem('adminData', JSON.stringify(data.admin));
    
    // Set expiry (15 minutes from now)
    const expiresAt = Date.now() + (15 * 60 * 1000);
    sessionStorage.setItem('adminTokenExpiry', expiresAt.toString());
    
    await logSecurityEvent(
      'ADMIN_LOGIN_SUCCESS',
      'low',
      `Admin logged in: ${data.admin.email}`
    );
    
    return data;
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid email or password format');
    }
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = sessionStorage.getItem('adminRefreshToken');
    
    if (!refreshToken) {
      return null;
    }
    
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        action: 'refresh',
        refreshToken
      })
    });
    
    if (!response.ok) {
      // Refresh token invalid, logout
      await secureAdminLogout();
      return null;
    }
    
    const data = await response.json();
    
    // Update access token
    sessionStorage.setItem('adminAccessToken', data.accessToken);
    sessionStorage.setItem('adminData', JSON.stringify(data.admin));
    
    const expiresAt = Date.now() + (15 * 60 * 1000);
    sessionStorage.setItem('adminTokenExpiry', expiresAt.toString());
    
    return data.accessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Get current access token, refresh if expired
 */
export async function getAccessToken(): Promise<string | null> {
  const token = sessionStorage.getItem('adminAccessToken');
  const expiry = sessionStorage.getItem('adminTokenExpiry');
  
  if (!token || !expiry) {
    return null;
  }
  
  // Check if token is expired or about to expire (within 1 minute)
  if (Date.now() >= parseInt(expiry) - 60000) {
    return await refreshAccessToken();
  }
  
  return token;
}

/**
 * Secure admin logout
 */
export async function secureAdminLogout(): Promise<void> {
  try {
    const refreshToken = sessionStorage.getItem('adminRefreshToken');
    
    // Call Edge Function to invalidate refresh token
    await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        action: 'logout',
        refreshToken
      })
    });
    
    // Clear session storage
    sessionStorage.removeItem('adminAccessToken');
    sessionStorage.removeItem('adminRefreshToken');
    sessionStorage.removeItem('adminData');
    sessionStorage.removeItem('adminTokenExpiry');
    
    await logSecurityEvent(
      'ADMIN_LOGOUT',
      'low',
      'Admin logged out'
    );
  } catch (error) {
    console.error('Error during logout:', error);
    // Clear session storage anyway
    sessionStorage.clear();
  }
}

/**
 * Get current admin data
 */
export function getCurrentAdmin(): any | null {
  const adminData = sessionStorage.getItem('adminData');
  
  if (!adminData) {
    return null;
  }
  
  try {
    return JSON.parse(adminData);
  } catch {
    return null;
  }
}

/**
 * Check if admin is authenticated
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

/**
 * Secure fetch wrapper for admin API calls
 */
export async function secureAdminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  return fetch(url, {
    ...options,
    headers
  });
}
