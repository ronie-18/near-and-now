import { Router } from 'express';
import { signupComplete, getStores, updateStoreStatus, updateProductQuantity, updateStore, deleteStoreProduct, registerPushToken, updateNotificationPreferences } from '../controllers/storeOwner.controller.js';

const router = Router();

router.post('/signup/complete', signupComplete);
router.get('/stores', getStores);
router.patch('/stores/:id', updateStore);
router.patch('/stores/:id/online', updateStoreStatus);
router.patch('/products/:productId/quantity', updateProductQuantity);
router.delete('/products/:productId', deleteStoreProduct);
router.post('/notifications/register', registerPushToken);
router.post('/notifications/preferences', updateNotificationPreferences);

export default router;
