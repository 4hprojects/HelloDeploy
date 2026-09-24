import { Router } from 'express';
import { deployHookLimiter, deployStatusLimiter } from '../../middleware/rate-limit.js';
import {
  postTriggerDeployHook,
  getHookDeploymentStatus,
  getHookCapabilities,
} from '../../controllers/deploy-hook.controller.js';

const router = Router();

// Token-authenticated — no session/CSRF required. See app.js for mount order.
router.post('/:projectId/:token', deployHookLimiter, postTriggerDeployHook);

router.get('/:projectId/deployments/:deploymentId', deployStatusLimiter, getHookDeploymentStatus);

router.get('/:projectId/capabilities', deployStatusLimiter, getHookCapabilities);

export default router;
