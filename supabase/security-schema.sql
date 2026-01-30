-- Security-related database schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Admin Refresh Tokens Table
-- ============================================
CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_refresh_tokens_admin ON admin_refresh_tokens(admin_id);
CREATE INDEX idx_admin_refresh_tokens_expires ON admin_refresh_tokens(expires_at);

-- Auto-delete expired tokens
CREATE OR REPLACE FUNCTION delete_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM admin_refresh_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Audit Logs Table
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================
-- 3. Failed Login Attempts Table
-- ============================================
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  ip_address INET NOT NULL,
  attempted_at TIMESTAMP DEFAULT NOW(),
  user_agent TEXT
);

CREATE INDEX idx_failed_login_email ON failed_login_attempts(email);
CREATE INDEX idx_failed_login_ip ON failed_login_attempts(ip_address);
CREATE INDEX idx_failed_login_attempted ON failed_login_attempts(attempted_at DESC);

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO attempt_count
  FROM failed_login_attempts
  WHERE email = p_email
    AND attempted_at > NOW() - INTERVAL '15 minutes';

  RETURN attempt_count >= 5;
END;
$$ LANGUAGE plpgsql;

-- Auto-delete old failed attempts (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_failed_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM failed_login_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. Security Events Table
-- ============================================
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
  description TEXT NOT NULL,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX idx_security_events_admin ON security_events(admin_id);

-- ============================================
-- 5. CSRF Tokens Table (Server-side validation)
-- ============================================
CREATE TABLE IF NOT EXISTS csrf_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_csrf_tokens_token ON csrf_tokens(token);
CREATE INDEX idx_csrf_tokens_expires ON csrf_tokens(expires_at);

-- Auto-delete expired CSRF tokens
CREATE OR REPLACE FUNCTION delete_expired_csrf_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM csrf_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. Rate Limit Tracking Table
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier VARCHAR(255) NOT NULL, -- IP address, user ID, etc.
  action VARCHAR(50) NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP DEFAULT NOW(),
  window_end TIMESTAMP NOT NULL
);

CREATE INDEX idx_rate_limit_identifier ON rate_limit_tracking(identifier, action);
CREATE INDEX idx_rate_limit_window ON rate_limit_tracking(window_end);

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier VARCHAR,
  p_action VARCHAR,
  p_max_requests INTEGER,
  p_window_minutes INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  window_start TIMESTAMP;
BEGIN
  window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;

  SELECT COALESCE(SUM(request_count), 0)
  INTO current_count
  FROM rate_limit_tracking
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_end > NOW();

  RETURN current_count < p_max_requests;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Scheduled Cleanup Jobs
-- ============================================

-- Create a function to run all cleanup tasks
CREATE OR REPLACE FUNCTION run_security_cleanup()
RETURNS void AS $$
BEGIN
  PERFORM delete_expired_refresh_tokens();
  PERFORM cleanup_failed_login_attempts();
  PERFORM delete_expired_csrf_tokens();

  -- Delete old rate limit tracking (older than 24 hours)
  DELETE FROM rate_limit_tracking WHERE window_end < NOW() - INTERVAL '24 hours';

  -- Delete old audit logs (older than 90 days)
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';

  -- Delete old security events (older than 90 days)
  DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. Row Level Security Policies
-- ============================================

-- Enable RLS on all security tables
ALTER TABLE admin_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE csrf_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_tracking ENABLE ROW LEVEL SECURITY;

-- Only service role can access these tables
CREATE POLICY "Service role only" ON admin_refresh_tokens FOR ALL USING (false);
CREATE POLICY "Service role only" ON audit_logs FOR ALL USING (false);
CREATE POLICY "Service role only" ON failed_login_attempts FOR ALL USING (false);
CREATE POLICY "Service role only" ON security_events FOR ALL USING (false);
CREATE POLICY "Service role only" ON csrf_tokens FOR ALL USING (false);
CREATE POLICY "Service role only" ON rate_limit_tracking FOR ALL USING (false);

-- ============================================
-- 9. Helper Functions
-- ============================================

-- Log security event
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type VARCHAR,
  p_severity VARCHAR,
  p_description TEXT,
  p_admin_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO security_events (
    event_type,
    severity,
    description,
    admin_id,
    user_id,
    ip_address,
    metadata
  ) VALUES (
    p_event_type,
    p_severity,
    p_description,
    p_admin_id,
    p_user_id,
    p_ip_address,
    p_metadata
  ) RETURNING id INTO event_id;

  RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. Initial Data
-- ============================================

-- Log initial setup
SELECT log_security_event(
  'SYSTEM_SETUP',
  'low',
  'Security schema initialized',
  NULL,
  NULL,
  NULL,
  jsonb_build_object('version', '1.0', 'timestamp', NOW()::text)
);

-- ============================================
-- NOTES FOR DEPLOYMENT
-- ============================================

-- 1. Set up a cron job to run run_security_cleanup() daily:
--    In Supabase Dashboard → Database → Cron Jobs:
--    SELECT cron.schedule('security-cleanup', '0 2 * * *', 'SELECT run_security_cleanup()');

-- 2. Add JWT_SECRET to your Edge Function secrets:
--    supabase secrets set JWT_SECRET=your-super-secret-key-here

-- 3. Deploy the admin-auth Edge Function:
--    supabase functions deploy admin-auth

-- 4. Update your .env file to add:
--    VITE_ENCRYPTION_KEY=your-encryption-key-here
--    (Generate with: openssl rand -base64 32)
