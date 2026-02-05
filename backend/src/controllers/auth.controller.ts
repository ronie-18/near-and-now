import { Request, Response } from 'express';
import twilio from 'twilio';

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;

const client = twilio(accountSid, authToken);

// Store for OTP verification (in production, use Redis or database)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

export class AuthController {
  // Send OTP to phone number
  async sendOTP(req: Request, res: Response) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      console.log('📱 Sending OTP to:', phone);

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

  // Verify OTP
  async verifyOTP(req: Request, res: Response) {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone number and OTP are required' });
      }

      console.log('🔐 Verifying OTP for:', phone);

      // Verify OTP via Twilio Verify
      const verificationCheck = await client.verify.v2
        .services(serviceSid!)
        .verificationChecks.create({
          to: phone,
          code: otp
        });

      if (verificationCheck.status === 'approved') {
        console.log('✅ OTP verified successfully');
        res.json({
          success: true,
          message: 'OTP verified successfully',
          status: verificationCheck.status
        });
      } else {
        console.log('❌ Invalid OTP');
        res.status(400).json({
          error: 'Invalid OTP',
          status: verificationCheck.status
        });
      }
    } catch (error: any) {
      console.error('❌ Error verifying OTP:', error);
      res.status(500).json({
        error: 'Failed to verify OTP',
        message: error.message
      });
    }
  }
}
