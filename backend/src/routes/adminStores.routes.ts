import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import {
  getStoreVerificationDocuments,
  reviewStoreVerificationDocument,
  getStoreBillingInfo,
  getStoreImages,
  reviewStoreImage,
  notifyStoreApproved,
  listProfileChangeRequests,
  reviewProfileChangeRequest,
} from '../controllers/adminStores.controller.js';

const router = Router();

router.get('/stores/:id/verification-documents', requireAdmin, requirePermission('store_verification.view'), getStoreVerificationDocuments);
router.get('/stores/:id/billing-info', requireAdmin, requirePermission('store_verification.view'), getStoreBillingInfo);
router.patch('/stores/:id/verification-documents/:docType', requireAdmin, requirePermission('store_verification.edit'), reviewStoreVerificationDocument);
router.get('/stores/:id/images', requireAdmin, requirePermission('store_verification.view'), getStoreImages);
router.patch('/stores/:id/images/:imageId', requireAdmin, requirePermission('store_verification.edit'), reviewStoreImage);
router.post('/stores/:id/notify-approved', requireAdmin, requirePermission('store_verification.edit'), notifyStoreApproved);
router.get('/stores/profile-change-requests', requireAdmin, requirePermission('profile_change_requests.view'), listProfileChangeRequests);
router.post('/stores/profile-change-requests/:id/review', requireAdmin, requirePermission('profile_change_requests.edit'), reviewProfileChangeRequest);

export default router;
