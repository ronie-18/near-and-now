import { supabaseAdmin } from './supabase';

/**
 * Audit logging service
 * Tracks all admin actions for security and compliance
 */

export interface AuditLogEntry {
  admin_id?: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  status?: 'success' | 'failure';
  error_message?: string;
}

/**
 * Log an admin action
 */
export async function logAdminAction(entry: AuditLogEntry): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: entry.admin_id || null,
      user_id: entry.user_id || null,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id || null,
      old_values: entry.old_values || null,
      new_values: entry.new_values || null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || navigator.userAgent,
      status: entry.status || 'success',
      error_message: entry.error_message || null,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log audit entry:', error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  description: string,
  metadata?: any
): Promise<void> {
  try {
    await supabaseAdmin.from('security_events').insert({
      event_type: eventType,
      severity,
      description,
      metadata: metadata || null,
      ip_address: null, // Would need server-side to get real IP
      user_agent: navigator.userAgent,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * Log failed login attempt
 */
export async function logFailedLogin(email: string): Promise<void> {
  try {
    await supabaseAdmin.from('failed_login_attempts').insert({
      email: email.toLowerCase().trim(),
      ip_address: null, // Would need server-side to get real IP
      user_agent: navigator.userAgent,
      attempted_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log failed login:', error);
  }
}

/**
 * Check if account is locked due to failed attempts
 */
export async function isAccountLocked(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('is_account_locked', { p_email: email.toLowerCase().trim() });
    
    if (error) {
      console.error('Error checking account lock status:', error);
      return false;
    }
    
    return data === true;
  } catch (error) {
    console.error('Error checking account lock:', error);
    return false;
  }
}

/**
 * Get audit logs for a specific resource
 */
export async function getAuditLogs(
  resourceType?: string,
  resourceId?: string,
  limit: number = 100
): Promise<any[]> {
  try {
    let query = supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }
    
    if (resourceId) {
      query = query.eq('resource_id', resourceId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getAuditLogs:', error);
    return [];
  }
}

/**
 * Get security events
 */
export async function getSecurityEvents(
  severity?: 'low' | 'medium' | 'high' | 'critical',
  limit: number = 100
): Promise<any[]> {
  try {
    let query = supabaseAdmin
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (severity) {
      query = query.eq('severity', severity);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching security events:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getSecurityEvents:', error);
    return [];
  }
}

/**
 * Helper to get client IP (would need server-side implementation)
 */
export function getClientIP(): string | null {
  // This would need to be implemented server-side
  // For now, return null
  return null;
}

/**
 * Wrapper for admin operations with automatic audit logging
 */
export async function withAuditLog<T>(
  operation: () => Promise<T>,
  auditEntry: Omit<AuditLogEntry, 'status' | 'error_message'>
): Promise<T> {
  try {
    const result = await operation();
    
    await logAdminAction({
      ...auditEntry,
      status: 'success'
    });
    
    return result;
  } catch (error: any) {
    await logAdminAction({
      ...auditEntry,
      status: 'failure',
      error_message: error.message || 'Unknown error'
    });
    
    throw error;
  }
}
