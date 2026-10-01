import { Router } from 'express';
import multer from 'multer';
import { signupComplete, getStores, createStore, updateStoreStatus, updateProductQuantity, updateProductActiveState, updateStore, deleteStoreProduct, registerPushToken, updateNotificationPreferences, getStoreNotifications, markStoreNotificationRead, markAllStoreNotificationsRead, getVerificationDocuments, saveVerificationDocument, deleteVerificationDocument, getProfileChangeRequest, requestProfileChange, getStoreImages, addStoreImage, deleteStoreImage, getBillingInfo, saveBillingInfo, createSupportMessage, getMySupportMessages, requireStoreOwnerAuth } from '../controllers/storeOwner.controller.js';
import { MAX_DOC_SIZE_BYTES } from '../utils/verificationDocuments.js';

const router = Router();
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOC_SIZE_BYTES } });

router.post('/signup/complete', signupComplete);
router.get('/stores', getStores);
router.post('/stores', createStore);
router.patch('/stores/:id', updateStore);
router.patch('/stores/:id/online', updateStoreStatus);
router.get('/stores/:id/profile-change-request', getProfileChangeRequest);
router.post('/stores/:id/profile-change-request', requestProfileChange);
router.get('/stores/:id/images', getStoreImages);
router.post('/stores/:id/images', addStoreImage);
router.delete('/stores/:id/images/:imageId', deleteStoreImage);
router.get('/stores/:id/verification-documents', getVerificationDocuments);
// requireStoreOwnerAuth runs before docUpload on both of these specifically — auth
// must reject an unauthenticated request before multer spends any work parsing its
// multipart body (up to MAX_DOC_SIZE_BYTES) into memory. See its own comment
// (storeOwner.controller.ts) for the full writeup; found 2026-10-01 (bug_fixes
// doc, item 11).
router.post('/stores/:id/verification-documents/:docType', requireStoreOwnerAuth, docUpload.single('file'), saveVerificationDocument);
router.delete('/stores/:id/verification-documents/:docType', deleteVerificationDocument);
router.get('/stores/:id/billing-info', getBillingInfo);
router.post('/stores/:id/billing-info', requireStoreOwnerAuth, docUpload.single('file'), saveBillingInfo);
router.patch('/products/:productId/quantity', updateProductQuantity);
router.patch('/products/:productId', updateProductActiveState);
router.delete('/products/:productId', deleteStoreProduct);
router.post('/notifications/register', registerPushToken);
router.post('/notifications/preferences', updateNotificationPreferences);
router.get('/notifications', getStoreNotifications);
router.put('/notifications/read-all', markAllStoreNotificationsRead);
router.put('/notifications/:notificationId/read', markStoreNotificationRead);
router.post('/support-messages', createSupportMessage);
router.get('/support-messages', getMySupportMessages);

export default router;
