import express, { Router } from 'express';
import { handleGithubWebhook } from '../../controllers/webhook.controller.js';
import { handleResendWebhook } from '../../controllers/resend-webhook.controller.js';
import { githubWebhookLimiter, resendWebhookLimiter } from '../../middleware/rate-limit.js';

const router = Router();

// Raw body required for HMAC-SHA256 signature verification.
// This route must be mounted BEFORE express.json() in app.js.
// Arrow wrapper keeps Express's `next` out of the handler's injectable `deps` slot.
// A large push exceeds the 100 kB default. The cap matches the platform nginx
// vhost (10 MB), so no delivery nginx passes is refused here, and because the
// GitHub limiter fails open, an unsigned body is never buffered beyond it.
const GITHUB_WEBHOOK_MAX_BODY = '10mb';
router.post(
  '/github',
  githubWebhookLimiter,
  express.raw({ type: 'application/json', limit: GITHUB_WEBHOOK_MAX_BODY }),
  (req, res) => handleGithubWebhook(req, res),
);
router.post(
  '/resend',
  resendWebhookLimiter,
  express.raw({ type: 'application/json' }),
  (req, res) => handleResendWebhook(req, res),
);

export default router;
