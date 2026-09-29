import express, { Router } from 'express';
import { handleGithubWebhook } from '../../controllers/webhook.controller.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router = Router();

// Raw body required for HMAC-SHA256 signature verification.
// This route must be mounted BEFORE express.json() in app.js.
// The inner arrow keeps Express's `next` out of the handler's injectable `deps`
// slot; asyncHandler wraps it so a rejection reaches the error handler instead
// of leaving GitHub waiting for a response that never comes.
router.post(
  '/github',
  express.raw({ type: 'application/json' }),
  asyncHandler((req, res) => handleGithubWebhook(req, res)),
);

export default router;
