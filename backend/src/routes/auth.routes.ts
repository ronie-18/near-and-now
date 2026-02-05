import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();
const authController = new AuthController();

router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);

export default router;
