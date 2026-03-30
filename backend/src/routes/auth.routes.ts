import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';

const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Phone must be at least 10 digits').max(15, 'Phone too long')
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
  role: z.enum(['customer', 'shopkeeper', 'delivery_partner']).optional(),
  name: z.string().optional()
});

const router = Router();
const authController = new AuthController();

// Allow max 5 OTP sends per phone per 10 minutes
const sendOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.phone || req.ip,
  message: { error: 'Too many OTP requests. Please wait 10 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Allow max 10 verification attempts per IP per 15 minutes
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.body?.phone || req.ip,
  message: { error: 'Too many verification attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/send-otp', sendOtpLimiter, validate(sendOtpSchema), authController.sendOTP);
router.post('/verify-otp', verifyOtpLimiter, validate(verifyOtpSchema), authController.verifyOTP);

export default router;
