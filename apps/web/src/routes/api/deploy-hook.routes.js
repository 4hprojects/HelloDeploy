import { Router } from 'express';
import { deployHookLimiter, deployHookProjectLimiter } from '../../middleware/rate-limit.js';
import { postTriggerDeployHook } from '../../controllers/deploy-hook.controller.js';

const router = Router();

// Token-authenticated — no session/CSRF required. See app.js for mount order.
router.post(
  '/:projectId/:token',
  deployHookLimiter,
  deployHookProjectLimiter,
  postTriggerDeployHook,
);

export default router;
