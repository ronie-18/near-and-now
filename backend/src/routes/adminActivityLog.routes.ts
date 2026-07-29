import { Router } from 'express';
import { requireAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { listActivityLog } from '../controllers/adminActivityLog.controller.js';

const router = Router();

router.get('/activity-log', requireAdmin, requirePermission('activity_log.view'), listActivityLog);

export default router;
