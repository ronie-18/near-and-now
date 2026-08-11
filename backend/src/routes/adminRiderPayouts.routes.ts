import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { listRiderPayouts, markRiderPayoutPaid } from '../controllers/adminRiderPayouts.controller.js';

const router = Router();

router.get('/rider-payouts', requireAdmin, requirePermission('payments.view'), listRiderPayouts);
router.post('/rider-payouts/:id/mark-paid', requireAdmin, requirePermission('payments.edit'), markRiderPayoutPaid);

export default router;
