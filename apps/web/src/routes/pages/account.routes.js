import { Router } from 'express';

import { postUiMode } from '../../controllers/account.controller.js';
import { requireAuth } from '../../middleware/require-auth.js';

const router = Router();

router.use(requireAuth);

// Interface complexity preference (Simple / Advanced)
router.post('/ui-mode', postUiMode);

export default router;
