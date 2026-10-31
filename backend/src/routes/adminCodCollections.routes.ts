import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { listRiderCashInHand, markRiderCashDeposited } from '../controllers/adminCodCollections.controller.js';

const router = Router();

router.get('/cod-cash', requireAdmin, requirePermission('payments.view'), listRiderCashInHand);
router.post('/cod-cash/:riderId/mark-deposited', requireAdmin, requirePermission('payments.edit'), markRiderCashDeposited);

export default router;
