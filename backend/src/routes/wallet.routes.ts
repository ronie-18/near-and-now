import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { walletController } from '../controllers/wallet.controller.js';

const router = Router();

// Amount bounds (₹10–₹50,000) were already enforced, but nothing throttled
// request *frequency* — each call is a live Razorpay order-creation API
// call, so an unthrottled loop is a straightforward gateway-quota/cost abuse
// vector (and can spam an account with thousands of pending orders). Found
// 2026-08-11 during a rate-limiting audit.
const topupCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.customerId || req.ip || 'unknown',
  message: { error: 'Too many top-up attempts. Please wait a while before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', requireCustomer, walletController.getBalance.bind(walletController));
router.get('/transactions', requireCustomer, walletController.getTransactions.bind(walletController));
router.post('/topup/create', requireCustomer, topupCreateLimiter, walletController.createTopupOrder.bind(walletController));
router.post('/topup/verify', requireCustomer, walletController.verifyTopup.bind(walletController));
router.post('/pay-order', requireCustomer, walletController.payOrderWithWallet.bind(walletController));

export default router;
