import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import {
  getGithubConnect,
  getGithubCallback,
  getBranches,
} from '../../controllers/github.controller.js';

const router = Router();

router.use(requireAuth);

// Redirect to GitHub App installation page (stores project slug in session)
router.get('/connect', getGithubConnect);

// GitHub redirects here after user installs/updates the App
router.get('/callback', getGithubCallback);

// JSON endpoint: list branches for a repository (used by repo connect form)
router.get('/branches', getBranches);

export default router;
