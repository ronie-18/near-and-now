import { Request, Response } from 'express';
import crypto from 'crypto';
import twilio from 'twilio';
import { supabaseAdmin } from '../config/database.js';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';
import { createSignupTicket } from '../utils/signupTicket.js';
import { mintRiderRealtimeSession } from '../services/riderAuthBridge.service.js';

function extractErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  const msg = err.message || err.details || err.hint || err.error_description;
  if (msg && typeof msg === 'string' && msg.trim() && msg !== '{}') return msg;
  if (err.code) return `${fallback} (code: ${err.code})`;
  const str = typeof err === 'string' ? err : JSON.stringify(err);
  if (str && str !== '{}') return str;
  return fallback;
}

/**
 * All plausible stored values for app_users.phone so login matches regardless of +91 / spacing.
 * Used by every OTP-login flow (customer, shopkeeper, delivery_partner) — prevents duplicate
 * rows (and, for role-scoped flows, an existing account being wrongly routed into "new user
 * registration" just because its stored phone lacks/has a country-code prefix the client didn't).
 */
function phoneLookupVariants(phone: string): string[] {
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (digits) out.add(digits);
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    out.add(digits);
    out.add(`91${digits}`);
    out.add(`+91${digits}`);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    const local = digits.slice(1);
    if (local.length === 10 && /^[6-9]/.test(local)) {
      out.add(local);
      out.add(`91${local}`);
      out.add(`+91${local}`);
    }
  }
  if (digits.length >= 12 && digits.startsWith('91')) {
    const local = digits.slice(-10);
    out.add(digits);
    out.add(local);
    out.add(`91${local}`);
    out.add(`+91${local}`);
  }
  return [...out].filter(Boolean);
}

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;

// Only initialize Twilio client if credentials are provided
let client: ReturnType<typeof twilio> | null = null;
if (accountSid && authToken && accountSid.startsWith('AC')) {
  client = twilio(accountSid, authToken);
  console.log('✅ Twilio client initialized');
} else {
  console.warn('⚠️ Twilio credentials not configured - OTP features will be disabled');
}

export class AuthController {
  // Send OTP to phone number
  async sendOTP(req: Request, res: Response) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      console.log('📱 Sending OTP to:', phone);

      // Check if Twilio is configured
      if (!client) {
        return res.status(503).json({
          error: 'OTP service not configured',
          message: 'SMS OTP is currently unavailable. Please contact support.'
        });
      }

      // Send OTP via Twilio Verify
      const verification = await client.verify.v2
        .services(serviceSid!)
        .verifications.create({
          to: phone,
          channel: 'sms'
        });

      console.log('✅ OTP sent successfully:', verification.status);

      res.json({
        success: true,
        message: 'OTP sent successfully',
        status: verification.status
      });
    } catch (error: any) {
      console.error('❌ Error sending OTP:', error);
      res.status(500).json({
        error: 'Failed to send OTP',
        message: error.message
      });
    }
  }

  // Verify OTP and login/register by role (customer, shopkeeper, delivery_partner)
  async verifyOTP(req: Request, res: Response) {
    try {
      const { phone, otp, name, email, role: requestRole } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone number and OTP are required' });
      }

      const requestedRole =
        requestRole === 'shopkeeper'
          ? 'shopkeeper'
          : requestRole === 'delivery_partner'
            ? 'delivery_partner'
            : 'customer';
      const isRoleScopedFlow = requestedRole === 'shopkeeper' || requestedRole === 'delivery_partner';
      console.log('🔐 Verifying OTP for:', phone, `(${requestedRole})`);

      if (!client) {
        return res.status(503).json({
          error: 'OTP service not configured',
          message: 'SMS OTP verification is currently unavailable.'
        });
      }

      const verificationCheck = await client.verify.v2
        .services(serviceSid!)
        .verificationChecks.create({
          to: String(phone),
          code: String(otp)
        });

      if (verificationCheck.status !== 'approved') {
        console.log('❌ Invalid OTP');
        return res.status(400).json({
          error: 'Invalid OTP',
          status: verificationCheck.status
        });
      }

      console.log('✅ OTP verified successfully');

      // Role-scoped flows: look up by phone AND requested role (shopkeeper / delivery_partner)
      if (isRoleScopedFlow) {
        const roleLabel = requestedRole === 'shopkeeper' ? '🏪 Shopkeeper' : '🛵 Delivery partner';
        console.log(`${roleLabel} flow: looking for ${requestedRole} account`);

        // CRITICAL: Must filter by BOTH phone AND role.
        // Same phone can have multiple users with different roles.
        //
        // Previously this only tried 2 formats (exact-as-sent, and digits-only
        // WITH the 91 country code) — missing the plain 10-digit-no-prefix
        // format entirely. The app always sends "+91XXXXXXXXXX", but an
        // account whose stored phone happens to be the bare 10 digits (e.g.
        // seeded/entered a different way) would never match either format,
        // so a genuinely existing rider/shopkeeper got silently routed into
        // "new user registration" instead of logged in. Reusing the same
        // full variant set the customer flow below already relies on for
        // exactly this reason.
        let existingUser: any = null;
        const roleVariants = phoneLookupVariants(phone);
        const { data: byVariant } = await supabaseAdmin
          .from('app_users')
          .select('*')
          .in('phone', roleVariants)
          .eq('role', requestedRole)
          .limit(1)
          .maybeSingle();

        if (byVariant) {
          existingUser = byVariant;
          console.log(`✅ Found ${requestedRole} account: ${byVariant.name} (${byVariant.role})`);
        }

        if (existingUser && existingUser.role === requestedRole) {
          const token = crypto.randomUUID();
          const { password_hash: _, ...userWithoutPassword } = existingUser;
          console.log(`👤 Existing ${requestedRole}, logging in:`, existingUser.id, existingUser.name);

          // Persist token so delivery-partner / shopkeeper APIs can authenticate requests
          if (requestedRole === 'delivery_partner') {
            await supabaseAdmin
              .from('delivery_partners')
              .update({ session_token: token, session_token_issued_at: new Date().toISOString() })
              .eq('user_id', existingUser.id);
          }
          if (requestedRole === 'shopkeeper') {
            await supabaseAdmin
              .from('app_users')
              .update({ session_token: token, session_token_issued_at: new Date().toISOString() })
              .eq('id', existingUser.id);
          }

          // Only riders currently have a Realtime-scoped RLS policy
          // (partner_own_record) waiting for a real auth.uid() — see
          // riderAuthBridge.service.ts. Best-effort: a failure here doesn't
          // block login, the app just falls back to polling.
          const supabaseSession =
            requestedRole === 'delivery_partner'
              ? await mintRiderRealtimeSession(existingUser.id)
              : null;

          return res.json({
            success: true,
            message: 'OTP verified successfully',
            mode: 'login',
            user: userWithoutPassword,
            token,
            ...(supabaseSession ? { supabaseSession } : {})
          });
        }

        // No role-specific account found (customer may exist, but we need requestedRole)
        console.log(`📝 No ${requestedRole} account found, need signup`);
        return res.json({
          success: true,
          message: 'OTP verified; complete signup',
          mode: 'signup',
          // Proof this phone actually passed OTP verification for this role — signup/complete requires it.
          signupTicket: createSignupTicket(String(phone), requestedRole)
        });
      }

      // Customer flow: match by any common phone format (stored value may differ from Twilio "to" format)
      const phoneVariants = phoneLookupVariants(phone);
      const { data: customerRows, error: customerLookupError } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .in('phone', phoneVariants)
        .eq('role', 'customer')
        .order('created_at', { ascending: true });

      if (customerLookupError) {
        console.error('❌ Customer lookup by phone failed:', customerLookupError);
      }
      if (customerRows && customerRows.length > 1) {
        console.warn(
          `⚠️ Multiple customer app_users rows for same phone variants (${phoneVariants.join(', ')}); using oldest`
        );
      }

      const existingUser = customerRows?.[0] ?? null;

      let appUser: any;
      let customer: any;

      if (existingUser) {
        // Existing customer - login
        if (existingUser.is_suspended) {
          return res.status(403).json({ error: 'This account has been suspended.' });
        }
        console.log('👤 Existing customer, logging in');
        appUser = existingUser;
        const { data: customerData } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('user_id', appUser.id)
          .single();
        customer = customerData;
      } else {
        // New customer - register (website users are always customers)
        const trimmedEmail = typeof email === 'string' ? email.trim() : '';
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          return res.status(400).json({
            error: 'Email required',
            message: 'A valid email address is required to complete signup.'
          });
        }

        const userName = name || 'Customer';
        const landmark = 'To be updated';
        const deliveryInstructions = 'To be updated';

        console.log('📝 New customer, registering');

        const { data: newUser, error: userError } = await supabaseAdmin
          .from('app_users')
          .insert({
            name: userName,
            phone,
            email: trimmedEmail,
            password_hash: null,
            role: 'customer', // Website users are always customers, never admin
            is_activated: true
          })
          .select()
          .single();

        if (userError || !newUser) {
          const errMsg = extractErrorMessage(userError, 'Failed to create user account');
          console.error('❌ Error creating user:', userError);
          return res.status(500).json({
            error: 'Failed to create user account',
            message: errMsg
          });
        }

        appUser = newUser;

        const { data: newCustomer, error: customerError } = await supabaseAdmin
          .from('customers')
          .insert({
            user_id: appUser.id,
            name: userName,
            phone,
            landmark,
            delivery_instructions: deliveryInstructions,
            country: 'India'
          })
          .select()
          .single();

        if (customerError) {
          const errMsg = extractErrorMessage(customerError, 'Failed to create customer profile');
          console.error('❌ Error creating customer:', customerError);
          await supabaseAdmin.from('app_users').delete().eq('id', appUser.id);
          return res.status(500).json({
            error: 'Failed to create customer profile',
            message: errMsg
          });
        }

        customer = newCustomer;

        // Fire off the initial verification code (non-fatal — the customer can
        // still complete signup and browse; verification is only enforced at checkout).
        databaseService.setOrChangeCustomerEmail(appUser.id, trimmedEmail)
          .then(({ code }) => notificationService.sendEmailVerificationCode(trimmedEmail, code))
          .catch((err) => console.error('[verifyOTP] initial email verification send failed (non-fatal)', err));
      }

      const isNewUser = !existingUser;
      const token = crypto.randomUUID();

      // Persist the session token so customer-authenticated routes can validate it,
      // matching the shopkeeper/delivery_partner flows above. Without this write the
      // token returned to the client is never checkable against anything.
      const { error: tokenError } = await supabaseAdmin
        .from('app_users')
        .update({ session_token: token, session_token_issued_at: new Date().toISOString() })
        .eq('id', appUser.id);

      if (tokenError) {
        console.error('❌ Failed to persist customer session token:', tokenError);
        return res.status(500).json({
          error: 'Failed to complete login',
          message: extractErrorMessage(tokenError, 'Could not persist session token')
        });
      }
      const { password_hash: _, session_token: __, ...userWithoutPassword } = appUser;

      res.json({
        success: true,
        message: 'OTP verified successfully',
        user: userWithoutPassword,
        customer: customer || undefined,
        token,
        isNewUser
      });
    } catch (error: any) {
      console.error('❌ Error verifying OTP:', error);
      res.status(500).json({
        error: 'Failed to verify OTP',
        message: error.message
      });
    }
  }
}
