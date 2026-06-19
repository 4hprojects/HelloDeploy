import express, { Router } from 'express';
import { handleGithubWebhook } from '../../controllers/webhook.controller.js';

const router = Router();

// Raw body required for HMAC-SHA256 signature verification.
// This route must be mounted BEFORE express.json() in app.js.
router.post('/github', express.raw({ type: 'application/json' }), handleGithubWebhook);

export default router;
