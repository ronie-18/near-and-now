-- Create newsletter_subscriptions table in Supabase
-- Run this SQL in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscriptions(email);

-- Create index on is_active for filtering active subscriptions
CREATE INDEX IF NOT EXISTS idx_newsletter_active ON newsletter_subscriptions(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert (subscribe)
CREATE POLICY "Allow public to subscribe" ON newsletter_subscriptions
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow reading own subscription (optional, for unsubscribe functionality)
CREATE POLICY "Allow reading subscriptions" ON newsletter_subscriptions
  FOR SELECT
  USING (true);

-- Add comment to table
COMMENT ON TABLE newsletter_subscriptions IS 'Stores newsletter subscription emails';

