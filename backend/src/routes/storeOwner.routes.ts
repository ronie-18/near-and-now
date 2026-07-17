import { Router } from 'express';
import multer from 'multer';
import { signupComplete, getStores, updateStoreStatus, updateProductQuantity, updateStore, deleteStoreProduct, registerPushToken, updateNotificationPreferences, getStoreNotifications, markStoreNotificationRead, markAllStoreNotificationsRead, getVerificationDocuments, saveVerificationDocument, deleteVerificationDocument } from '../controllers/storeOwner.controller.js';
import { MAX_DOC_SIZE_BYTES } from '../utils/verificationDocuments.js';

const router = Router();
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOC_SIZE_BYTES } });

router.post('/signup/complete', signupComplete);
router.get('/stores', getStores);
router.patch('/stores/:id', updateStore);
router.patch('/stores/:id/online', updateStoreStatus);
router.get('/stores/:id/verification-documents', getVerificationDocuments);
router.post('/stores/:id/verification-documents/:docType', docUpload.single('file'), saveVerificationDocument);
router.delete('/stores/:id/verification-documents/:docType', deleteVerificationDocument);
router.patch('/products/:productId/quantity', updateProductQuantity);
router.delete('/products/:productId', deleteStoreProduct);
router.post('/notifications/register', registerPushToken);
router.post('/notifications/preferences', updateNotificationPreferences);
router.get('/notifications', getStoreNotifications);
router.put('/notifications/read-all', markAllStoreNotificationsRead);
router.put('/notifications/:notificationId/read', markStoreNotificationRead);

export default router;
