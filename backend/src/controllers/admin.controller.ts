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
}
