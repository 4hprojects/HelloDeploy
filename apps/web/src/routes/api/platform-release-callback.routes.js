import express, { Router } from 'express';
import { postPlatformReleaseCallback } from '../../controllers/platform-release-callback.controller.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router = Router();

router.post(
  '/:requestId/status',
  express.raw({ type: 'application/json', limit: '16kb' }),
  asyncHandler(postPlatformReleaseCallback),
);

export default router;
