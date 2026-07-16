import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CustomersController } from '../controllers/customers.controller.js';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';

const router = Router();
const customersController = new CustomersController();

// Trivial authenticated call whose only real purpose is passing through
// requireCustomer, which renews the sliding 25-day session window as a side
// effect. The app calls this on cold start and on every foreground resume so
// "opened the app" always counts as activity — not just ordering-related
// actions, which are the only other routes that happen to renew the session.
router.get('/session/ping', requireCustomer, (_req, res) => res.json({ success: true }));

router.get('/addresses/resolved', requireCustomer, (req, res) => customersController.getResolvedAddresses(req, res));
router.get('/:customerId/addresses', requireCustomer, customersController.getAddresses);
router.post('/:customerId/addresses', requireCustomer, customersController.createAddress);
router.patch('/addresses/:addressId', requireCustomer, customersController.updateAddress);
router.delete('/addresses/:addressId', requireCustomer, customersController.deleteAddress);

// Max 5 verification-code sends per customer per 10 minutes (mirrors send-otp limiter).
const emailCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.customerId || req.ip || 'unknown',
  message: { error: 'Too many requests. Please wait 10 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/email/change', requireCustomer, emailCodeLimiter, (req, res) => customersController.changeEmail(req, res));
router.post('/email/resend', requireCustomer, emailCodeLimiter, (req, res) => customersController.resendEmailVerification(req, res));
router.post('/email/verify', requireCustomer, (req, res) => customersController.verifyEmail(req, res));

export default router;
