import express, { Router } from 'express';
import { handleGithubWebhook } from '../../controllers/webhook.controller.js';

const router = Router();

// Raw body required for HMAC-SHA256 signature verification.
// This route must be mounted BEFORE express.json() in app.js.
// Arrow wrapper keeps Express's `next` out of the handler's injectable `deps` slot.
router.post('/github', express.raw({ type: 'application/json' }), (req, res) =>
  handleGithubWebhook(req, res),
);

export default router;
