import { Router } from 'express';
import { deployHookLimiter } from '../../middleware/rate-limit.js';
import { postTriggerDeployHook } from '../../controllers/deploy-hook.controller.js';

const router = Router();

// Token-authenticated — no session/CSRF required. See app.js for mount order.
router.post('/:projectId/:token', deployHookLimiter, postTriggerDeployHook);

export default router;
