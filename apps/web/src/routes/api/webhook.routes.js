import express, { Router } from 'express';
import { handleGithubWebhook } from '../../controllers/webhook.controller.js';
import { handleResendWebhook } from '../../controllers/resend-webhook.controller.js';

const router = Router();

// Raw body required for HMAC-SHA256 signature verification.
// This route must be mounted BEFORE express.json() in app.js.
// Arrow wrapper keeps Express's `next` out of the handler's injectable `deps` slot.
// GitHub caps webhook payloads at 25 MB; a large push exceeds the 100 kB default.
// The platform nginx vhost still caps request bodies at 10 MB.
const GITHUB_WEBHOOK_MAX_BODY = '25mb';
router.post(
  '/github',
  express.raw({ type: 'application/json', limit: GITHUB_WEBHOOK_MAX_BODY }),
  (req, res) => handleGithubWebhook(req, res),
);
router.post('/resend', express.raw({ type: 'application/json' }), (req, res) =>
  handleResendWebhook(req, res),
);

export default router;
