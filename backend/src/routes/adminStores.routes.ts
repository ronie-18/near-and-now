import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import {
  getStoreVerificationDocuments,
  reviewStoreVerificationDocument,
  notifyStoreApproved,
} from '../controllers/adminStores.controller.js';

const router = Router();

router.get('/stores/:id/verification-documents', requireAdmin, requirePermission('store_verification.view'), getStoreVerificationDocuments);
router.patch('/stores/:id/verification-documents/:docType', requireAdmin, requirePermission('store_verification.edit'), reviewStoreVerificationDocument);
router.post('/stores/:id/notify-approved', requireAdmin, requirePermission('store_verification.edit'), notifyStoreApproved);

export default router;
