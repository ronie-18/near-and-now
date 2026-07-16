import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AdminController } from '../controllers/admin.controller.js';

const router = Router();
const ctrl = new AdminController();

// Max 10 login attempts per email per 15 minutes (mirrors verifyOtpLimiter in auth.routes.ts).
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req.body?.email || req.ip || 'unknown').toLowerCase(),
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', adminLoginLimiter, ctrl.login.bind(ctrl));

export default router;
