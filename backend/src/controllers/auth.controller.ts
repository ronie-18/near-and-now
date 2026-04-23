import { Request, Response } from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../config/database.js';

function extractErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  const msg = err.message || err.details || err.hint || err.error_description;
  if (msg && typeof msg === 'string' && msg.trim() && msg !== '{}') return msg;
  if (err.code) return `${fallback} (code: ${err.code})`;
  const str = typeof err === 'string' ? err : JSON.stringify(err);
  if (str && str !== '{}') return str;
  return fallback;
}

/** Normalize phone to digits only for consistent lookup (e.g. +919876543210 -> 919876543210) */
function normalizePhone(phone: string): string {
  return String(phone).replace(/\D/g, '');
}

/**
 * All plausible stored values for app_users.phone so login matches regardless of +91 / spacing.
 * Prevents duplicate customer rows (and orphaned saved addresses) when OTP uses a different format.
 */
function customerPhoneLookupVariants(phone: string): string[] {
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
      const { phone, otp, name, role: requestRole } = req.body;

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
        // Same phone can have multiple users with different roles
        let existingUser: any = null;

        // Try exact phone with role filter
        const { data: byExact } = await supabaseAdmin
          .from('app_users')
          .select('*')
          .eq('phone', phone)
          .eq('role', requestedRole)
          .maybeSingle();

        if (byExact) {
          existingUser = byExact;
          console.log(`✅ Found ${requestedRole} account: ${byExact.name} (${byExact.role})`);
        } else {
          // Try normalized phone with role filter
          const normalized = normalizePhone(phone);
          if (normalized) {
            const { data: byNormalized } = await supabaseAdmin
              .from('app_users')
              .select('*')
              .eq('phone', normalized)
              .eq('role', requestedRole)
              .maybeSingle();
            if (byNormalized) {
              existingUser = byNormalized;
              console.log(
                `✅ Found ${requestedRole} account (normalized): ${byNormalized.name} (${byNormalized.role})`
              );
            }
          }
        }

        if (existingUser && existingUser.role === requestedRole) {
          const token = crypto.randomUUID();
          const { password_hash: _, ...userWithoutPassword } = existingUser;
          console.log(`👤 Existing ${requestedRole}, logging in:`, existingUser.id, existingUser.name);

          // Persist token so delivery-partner API can authenticate requests
          if (requestedRole === 'delivery_partner') {
            await supabaseAdmin
              .from('delivery_partners')
              .update({ session_token: token })
              .eq('user_id', existingUser.id);
          }

          return res.json({
            success: true,
            message: 'OTP verified successfully',
            mode: 'login',
            user: userWithoutPassword,
            token
          });
        }

        // No role-specific account found (customer may exist, but we need requestedRole)
        console.log(`📝 No ${requestedRole} account found, need signup`);
        return res.json({
          success: true,
          message: 'OTP verified; complete signup',
          mode: 'signup'
        });
      }

      // Customer flow: match by any common phone format (stored value may differ from Twilio "to" format)
      const phoneVariants = customerPhoneLookupVariants(phone);
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
        const userName = name || 'Customer';
        const landmark = 'To be updated';
        const deliveryInstructions = 'To be updated';

        console.log('📝 New customer, registering');

        const { data: newUser, error: userError } = await supabaseAdmin
          .from('app_users')
          .insert({
            name: userName,
            phone,
            email: null,
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
      }

      const token = crypto.randomUUID();
      const { password_hash: _, ...userWithoutPassword } = appUser;

      res.json({
        success: true,
        message: 'OTP verified successfully',
        user: userWithoutPassword,
        customer: customer || undefined,
        token
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
