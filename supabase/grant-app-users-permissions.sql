-- Fix: "permission denied" and allow reading products/categories on main page
-- Run in Supabase Dashboard → SQL Editor

-- Auth tables (for OTP login)
GRANT ALL ON public.app_users TO service_role;
GRANT ALL ON public.customers TO service_role;

-- Main page: master_products and categories
GRANT ALL ON public.master_products TO service_role;
GRANT ALL ON public.master_products TO anon;
GRANT ALL ON public.categories TO service_role;
GRANT ALL ON public.categories TO anon;
