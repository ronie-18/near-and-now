import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import {
  listSupportMessages,
  getSupportMessage,
  replySupportMessage,
  resolveSupportMessage,
  reopenSupportMessage,
} from '../controllers/adminSupportMessages.controller.js';

const router = Router();

router.get('/support-messages', requireAdmin, requirePermission('support_messages.view'), listSupportMessages);
router.get('/support-messages/:id', requireAdmin, requirePermission('support_messages.view'), getSupportMessage);
router.post('/support-messages/:id/reply', requireAdmin, requirePermission('support_messages.edit'), replySupportMessage);
router.post('/support-messages/:id/resolve', requireAdmin, requirePermission('support_messages.edit'), resolveSupportMessage);
router.post('/support-messages/:id/reopen', requireAdmin, requirePermission('support_messages.edit'), reopenSupportMessage);

export default router;
