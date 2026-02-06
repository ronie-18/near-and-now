-- Fix: "permission denied for table app_users"
-- Run in Supabase Dashboard → SQL Editor

GRANT ALL ON public.app_users TO service_role;
GRANT ALL ON public.customers TO service_role;
