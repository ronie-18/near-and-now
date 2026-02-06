-- Migration: Create app_users and customers tables for OTP phone login
-- Run this in Supabase Dashboard → SQL Editor if you get "Database error" during login

-- Create user_role enum (skip if exists)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'shopkeeper', 'delivery_partner');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  password_hash text,
  role user_role NOT NULL,
  is_activated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  surname text,
  phone text NOT NULL UNIQUE,
  address text,
  city text,
  state text,
  pincode text,
  country text NOT NULL DEFAULT 'India',
  landmark text NOT NULL,
  delivery_instructions text NOT NULL,
  google_place_id text,
  google_formatted_address text,
  google_place_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_app_users_phone ON app_users(phone);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Grant permissions (fixes "permission denied for table app_users")
GRANT ALL ON app_users TO service_role;
GRANT ALL ON customers TO service_role;
