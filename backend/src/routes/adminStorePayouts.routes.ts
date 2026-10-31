import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import {
  acceptAccountName,
  cancel,
  getBatchLines,
  getStorePayouts,
  prepare,
  refresh,
  refreshAccount,
  registerAccount,
  send,
} from '../controllers/adminStorePayouts.controller.js';

const router = Router();

router.get('/store-payouts', requireAdmin, requirePermission('payments.view'), getStorePayouts);
router.get('/store-payouts/batches/:batchId', requireAdmin, requirePermission('payments.view'), getBatchLines);
router.post('/store-payouts/accounts/:storeId/register', requireAdmin, requirePermission('payments.edit'), registerAccount);
router.post('/store-payouts/accounts/:storeId/refresh', requireAdmin, requirePermission('payments.edit'), refreshAccount);
router.post('/store-payouts/accounts/:storeId/accept-name', requireAdmin, requirePermission('payments.edit'), acceptAccountName);
router.post('/store-payouts/batches/prepare', requireAdmin, requirePermission('payments.edit'), prepare);
router.post('/store-payouts/batches/:batchId/send', requireAdmin, requirePermission('payments.edit'), send);
router.post('/store-payouts/batches/:batchId/cancel', requireAdmin, requirePermission('payments.edit'), cancel);
router.post('/store-payouts/batches/:batchId/refresh', requireAdmin, requirePermission('payments.edit'), refresh);

export default router;
