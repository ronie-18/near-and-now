import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.middleware.js';
import {
  getStoreVerificationDocuments,
  reviewStoreVerificationDocument,
} from '../controllers/adminStores.controller.js';

const router = Router();

router.get('/stores/:id/verification-documents', requireAdmin, getStoreVerificationDocuments);
router.patch('/stores/:id/verification-documents/:docType', requireAdmin, reviewStoreVerificationDocument);

export default router;
