import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { gstinRejectionMessage, verifyGstin } from '../services/gstVerification.service.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

// Each uncached lookup is a paid provider call, so throttle per customer —
// generous for a real checkout (a few attempts), tight enough that a script
// can't run up the bill.
const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.customerId || req.ip || 'unknown',
  message: { success: false, error: 'Too many GSTIN checks. Please wait a while before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/gstin/verify  { gstin }
 * Live check for the checkout's "Add GSTIN" field. `verified` is true only
 * for an Active registration; `unavailable` means "couldn't check right now"
 * and the client should not block the customer on it (the order route
 * re-checks anyway).
 */
router.post('/verify', requireCustomer, verifyLimiter, async (req: Request, res: Response) => {
  try {
    const raw = typeof req.body?.gstin === 'string' ? req.body.gstin : '';
    if (!raw.trim()) return res.status(400).json({ success: false, error: 'gstin is required' });
    const v = await verifyGstin(raw);
    res.json({
      success: true,
      result: v.result,
      verified: v.result === 'active',
      gstin: v.gstin,
      legal_name: v.result === 'active' || v.result === 'inactive' ? v.legalName : null,
      trade_name: v.result === 'active' ? v.tradeName : null,
      registry_status: v.result === 'active' || v.result === 'inactive' ? v.registryStatus : null,
      message: gstinRejectionMessage(v),
    });
  } catch (error) {
    return sendError(res, 'gstin.verify', 'Could not check the GSTIN', error, undefined, { success: false });
  }
});

export default router;
