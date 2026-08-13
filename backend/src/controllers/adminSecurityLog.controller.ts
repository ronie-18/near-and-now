import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';

/**
 * Surfaces audit_logs/security_events/failed_login_attempts — all three are
 * written to already (admin/src/services/auditLog.ts's logAdminAction/
 * logSecurityEvent/logFailedLogin, called from adminAuthService.ts and
 * secureAdminAuth.ts on every login/logout/failed-login), but had zero UI
 * reading them back: write-only, never-read data. auditLog.ts's own
 * getAuditLogs()/getSecurityEvents() can never work as written — they query
 * through the frontend's anon-key getAdminClient(), but these three tables
 * only grant SELECT to service_role (20260718000002_fix_missing_table_grants.sql),
 * so a real backend route (service-role read, same pattern as
 * adminActivityLog.controller.ts) is required, not just an RLS/permission fix.
 */
export async function listAuditLogs(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ listAuditLogs error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const adminIds = [...new Set((data ?? []).map((r: any) => r.admin_id).filter(Boolean))];
    const adminById = new Map<string, { full_name: string; role: string }>();
    if (adminIds.length) {
      const { data: admins } = await supabaseAdmin.from('admins').select('id, full_name, role').in('id', adminIds);
      (admins ?? []).forEach((a: any) => adminById.set(a.id, { full_name: a.full_name, role: a.role }));
    }

    const rows = (data ?? []).map((r: any) => ({
      ...r,
      admin_name: r.admin_id ? adminById.get(r.admin_id)?.full_name ?? null : null,
      admin_role: r.admin_id ? adminById.get(r.admin_id)?.role ?? null : null,
    }));

    res.json({ success: true, logs: rows });
  } catch (error: any) {
    console.error('❌ listAuditLogs error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch audit logs' });
  }
}

export async function listSecurityEvents(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabaseAdmin
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ listSecurityEvents error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, events: data ?? [] });
  } catch (error: any) {
    console.error('❌ listSecurityEvents error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch security events' });
  }
}

export async function listFailedLogins(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabaseAdmin
      .from('failed_login_attempts')
      .select('*')
      .order('attempted_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ listFailedLogins error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, attempts: data ?? [] });
  } catch (error: any) {
    console.error('❌ listFailedLogins error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch failed login attempts' });
  }
}
