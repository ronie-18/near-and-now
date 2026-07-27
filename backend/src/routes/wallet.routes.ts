import { Router } from 'express';
import { requireCustomer } from '../middleware/customerAuth.middleware.js';
import { walletController } from '../controllers/wallet.controller.js';

const router = Router();

router.get('/', requireCustomer, walletController.getBalance.bind(walletController));
router.post('/topup/create', requireCustomer, walletController.createTopupOrder.bind(walletController));
router.post('/topup/verify', requireCustomer, walletController.verifyTopup.bind(walletController));
router.post('/pay-order', requireCustomer, walletController.payOrderWithWallet.bind(walletController));

export default router;
