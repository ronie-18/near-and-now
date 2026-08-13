import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { listAuditLogs, listSecurityEvents, listFailedLogins } from '../controllers/adminSecurityLog.controller.js';

const router = Router();

router.get('/audit-logs', requireAdmin, requirePermission('security_log.view'), listAuditLogs);
router.get('/security-events', requireAdmin, requirePermission('security_log.view'), listSecurityEvents);
router.get('/failed-logins', requireAdmin, requirePermission('security_log.view'), listFailedLogins);

export default router;
