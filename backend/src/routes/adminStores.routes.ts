import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';
import {
  getStoreVerificationDocuments,
  reviewStoreVerificationDocument,
  notifyStoreApproved,
} from '../controllers/adminStores.controller.js';

const router = Router();

router.get('/stores/:id/verification-documents', requireAdmin, getStoreVerificationDocuments);
router.patch('/stores/:id/verification-documents/:docType', requireAdmin, reviewStoreVerificationDocument);
router.post('/stores/:id/notify-approved', requireAdmin, notifyStoreApproved);

export default router;
