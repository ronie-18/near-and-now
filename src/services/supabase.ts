import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://mpbszymyubxavjoxhzfm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnN6eW15dWJ4YXZqb3hoemZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyOTc5OTQsImV4cCI6MjA2OTg3Mzk5NH0.NnHFwGCkNpTWorV8O6vgn6uuqYPRek1QK4Sk_rcqLOg';

// Service role key for admin operations (bypasses RLS)
// Get this from: Supabase Dashboard → Settings → API → service_role key
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

// Create Supabase client for public operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create Supabase admin client for admin operations (bypasses RLS)
// ⚠️ IMPORTANT: This key has full access to the database. Use ONLY for admin operations.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Product types
export interface Product {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  description?: string;
  image?: string;
  image_url?: string;
  category: string;
  in_stock: boolean;
  rating?: number;
  size?: string;
  weight?: string;
  created_at?: string;
  isLoose?: boolean;
}

// Get all products
export async function getAllProducts(): Promise<Product[]> {
  try {
    console.log('🔄 Fetching products from Supabase...');
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(`✅ Successfully fetched ${data?.length || 0} products`);
    
    // Transform products to match frontend expectations
    return transformSupabaseProducts(data || []);
  } catch (error) {
    console.error('❌ Error in getAllProducts:', error);
    throw error; // Re-throw so calling code can handle it
  }
}

// Get products by category
export async function getProductsByCategory(categoryName: string): Promise<Product[]> {
  try {
    console.log('🔎 getProductsByCategory - Querying for category:', categoryName);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('category', categoryName)
      .eq('in_stock', true)
      .order('rating', { ascending: false });

    if (error) {
      console.error('❌ Error fetching products by category:', error);
      return [];
    }

    console.log('✅ getProductsByCategory - Raw data from DB:', data?.length || 0, 'products', data);
    const transformed = transformSupabaseProducts(data || []);
    console.log('✅ getProductsByCategory - Transformed products:', transformed.length);
    return transformed;
  } catch (error) {
    console.error('Error in getProductsByCategory:', error);
    return [];
  }
}

// Search products
export async function searchProducts(query: string): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)
      .ilike('name', `%${query}%`);

    if (error) {
      console.error('Error searching products:', error);
      return [];
    }

    return transformSupabaseProducts(data || []);
  } catch (error) {
    console.error('Error in searchProducts:', error);
    return [];
  }
}

// Transform products from Supabase format to frontend format
function transformSupabaseProducts(products: any[]): Product[] {
  return products.map(product => ({
    ...product,
    price: typeof product.price === 'string' ? parseFloat(product.price) : product.price,
    image: product.image_url || product.image
  }));
}

// Authentication types
export interface User {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
}

// Login with OTP
export async function loginWithOTP(phone: string) {
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
}

// Verify OTP
export async function verifyOTP(phone: string, token: string) {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
}

// Get current user
export async function getCurrentUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Logout
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
}
