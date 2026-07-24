import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/database.js';

export class AdminController {
  // POST /api/admin/login
  // Body: { email, password }
  // Verifies the password server-side and issues the same opaque session
  // token/admin_sessions row the admin panel already expects — password_hash
  // never leaves this process. See adminAuthService.ts (frontend) for the
  // now-retired direct-Supabase version this replaces.
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const normalizedEmail = email.toLowerCase().trim();

      const { data: admin, error } = await supabaseAdmin
        .from('admins')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !admin) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isValidPassword = await bcrypt.compare(password, (admin as any).password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      const { error: sessionError } = await supabaseAdmin.from('admin_sessions').insert({
        admin_id: (admin as any).id,
        session_token: token,
        user_agent: req.headers['user-agent'] || 'unknown',
        expires_at: expiresAt,
      });
      if (sessionError) {
        console.error('admin login: failed to create session row', sessionError);
        return res.status(500).json({ error: 'Failed to create session' });
      }

      await supabaseAdmin
        .from('admins')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', (admin as any).id);

      const { password_hash, ...adminData } = admin as any;
      res.json({ admin: adminData, token, expiresAt });
    } catch (err) {
      console.error('admin login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  // POST /api/admin/create — requireAdmin-gated
  // Creating an admin used to be a direct Supabase insert from the browser
  // (adminAuthService.ts's old createAdmin) with nothing checking the
  // *calling* admin's own role — any authenticated admin, including a
  // low-privilege 'viewer', could insert a row with role: 'super_admin' and
  // grant themselves full access. This endpoint re-checks the caller's real
  // role server-side (RLS only proved "some valid admin session," not which
  // one) and hashes the new admin's password server-side too, rather than
  // trusting a client-computed bcrypt hash.
  async createAdmin(req: Request, res: Response) {
    try {
      const { data: caller, error: callerError } = await supabaseAdmin
        .from('admins')
        .select('role')
        .eq('id', req.adminId)
        .maybeSingle();

      if (callerError || !caller) {
        return res.status(401).json({ error: 'Invalid admin session' });
      }
      if ((caller as any).role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admins can create new admin accounts' });
      }

      const { email, password, full_name, role, permissions } = req.body as {
        email?: string;
        password?: string;
        full_name?: string;
        role?: string;
        permissions?: string[];
      };

      const validRoles = ['super_admin', 'admin', 'manager', 'viewer'];
      if (!email || !password || !full_name || !role || !validRoles.includes(role)) {
        return res.status(400).json({ error: 'email, password, full_name, and a valid role are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const { data, error } = await supabaseAdmin
        .from('admins')
        .insert({
          email: email.toLowerCase().trim(),
          password_hash: passwordHash,
          full_name,
          role,
          permissions: permissions || [],
          created_by: req.adminId,
          status: 'active'
        })
        .select('id, email, full_name, role, permissions, created_by, status, last_login_at, created_at, updated_at')
        .single();

      if (error) {
        const code = (error as any).code === '23505' ? 409 : 500;
        return res.status(code).json({ error: code === 409 ? 'An admin with this email already exists' : error.message });
      }

      res.status(201).json({ admin: data });
    } catch (err) {
      console.error('admin createAdmin error:', err);
      res.status(500).json({ error: 'Failed to create admin' });
    }
  }

  // PATCH /api/admin/:id
  // Previously a direct Supabase write from the admin panel with zero role
  // check — any logged-in admin (including 'viewer') could edit any other
  // admin's role/permissions/status, the same class of privilege-escalation
  // gap already closed on createAdmin. Two allowed cases: (1) an admin
  // changing their own password only (self-service, any role), or (2) a
  // super_admin editing anything, for themself or anyone else.
  async updateAdmin(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { email, password, full_name, role, permissions, status } = req.body as {
        email?: string;
        password?: string;
        full_name?: string;
        role?: string;
        permissions?: string[];
        status?: string;
      };

      const { data: caller, error: callerError } = await supabaseAdmin
        .from('admins')
        .select('role')
        .eq('id', req.adminId)
        .maybeSingle();
      if (callerError || !caller) {
        return res.status(401).json({ error: 'Invalid admin session' });
      }

      const onlyChangingOwnPassword =
        id === req.adminId &&
        password !== undefined &&
        email === undefined && full_name === undefined && role === undefined &&
        permissions === undefined && status === undefined;

      if (!onlyChangingOwnPassword && (caller as any).role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admins can edit other admin accounts, or change role/permissions/status.' });
      }

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (email !== undefined) updateData.email = email.toLowerCase().trim();
      if (full_name !== undefined) updateData.full_name = full_name;
      if (role !== undefined) updateData.role = role;
      if (permissions !== undefined) updateData.permissions = permissions;
      if (status !== undefined) updateData.status = status;
      if (password !== undefined) {
        if (password.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        updateData.password_hash = await bcrypt.hash(password, 10);
      }

      const { data, error } = await supabaseAdmin
        .from('admins')
        .update(updateData)
        .eq('id', id)
        .select('id, email, full_name, role, permissions, created_by, status, last_login_at, created_at, updated_at')
        .single();

      if (error) {
        const code = (error as any).code === '23505' ? 409 : 500;
        return res.status(code).json({ error: code === 409 ? 'An admin with this email already exists' : error.message });
      }

      res.json({ admin: data });
    } catch (err) {
      console.error('admin updateAdmin error:', err);
      res.status(500).json({ error: 'Failed to update admin' });
    }
  }

  // DELETE /api/admin/:id
  // Same gap as updateAdmin — was a direct Supabase delete with no role check.
  async deleteAdmin(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const { data: caller, error: callerError } = await supabaseAdmin
        .from('admins')
        .select('role')
        .eq('id', req.adminId)
        .maybeSingle();
      if (callerError || !caller) {
        return res.status(401).json({ error: 'Invalid admin session' });
      }
      if ((caller as any).role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admins can delete admin accounts' });
      }
      if (id === req.adminId) {
        return res.status(400).json({ error: 'You cannot delete your own admin account.' });
      }

      const { error } = await supabaseAdmin.from('admins').delete().eq('id', id);
      if (error) throw error;

      res.json({ success: true });
    } catch (err) {
      console.error('admin deleteAdmin error:', err);
      res.status(500).json({ error: 'Failed to delete admin' });
    }
  }
}
