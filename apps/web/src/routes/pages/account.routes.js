import { Router } from 'express';

import { requireAuth } from '../../middleware/require-auth.js';
import { signInLimiter } from '../../middleware/rate-limit.js';
import {
  getAccount,
  postClosureRequest,
  postPassword,
  postProfile,
} from '../../controllers/account.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', getAccount);
router.post('/profile', postProfile);
// Both check the current password, so they share the sign-in guessing limit.
router.post('/password', signInLimiter, postPassword);
router.post('/close', signInLimiter, postClosureRequest);

export default router;
