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

  // Verify OTP and login/register customer
  async verifyOTP(req: Request, res: Response) {
    try {
      const { phone, otp, name } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone number and OTP are required' });
      }

      console.log('🔐 Verifying OTP for:', phone);

      // Check if Twilio is configured
      if (!client) {
        return res.status(503).json({
          error: 'OTP service not configured',
          message: 'SMS OTP verification is currently unavailable.'
        });
      }

      // Verify OTP via Twilio
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

      // Check if customer exists
      const { data: existingUser } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('phone', phone)
        .eq('role', 'customer')
        .single();

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
