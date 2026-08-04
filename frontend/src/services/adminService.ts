import { supabaseNoSession } from './supabase';

// Admin Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  color?: string;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

export async function getCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabaseNoSession
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCategories:', error);
    throw error;
  }
}
