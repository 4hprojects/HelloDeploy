import { Router } from 'express';
import { ProjectRole } from '@hellodeploy/contracts';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireProjectRole } from '../../middleware/require-project-role.js';
import {
  getProjectIndex,
  getNewProject,
  postNewProject,
  getProject,
  getEditProject,
  postEditProject,
  postArchiveProject,
  postSubmitForReview,
  getProjectMembers_ctrl,
  postInviteMember,
  postRemoveMember,
  postUpdateMemberRole,
  postTransferOwnership,
} from '../../controllers/project.controller.js';
import {
  getRepository,
  postConnectRepository,
  postDisconnectRepository,
  postUpdateDeploymentMode,
} from '../../controllers/github.controller.js';
import {
  getDetection,
  postRunDetection,
} from '../../controllers/detection.controller.js';
import {
  getEnvironment,
  postSetSecret,
  postDeleteSecret,
} from '../../controllers/env-secret.controller.js';
import {
  getDomains,
  postAddDomain,
  postVerifyDomain,
  postRemoveDomain,
} from '../../controllers/domain.controller.js';
import {
  getDeploymentList,
  getDeploymentDetail,
  postCreateDeployment,
  postCancelDeployment,
  postRetryDeployment,
  postRollback,
  sseDeploymentLogs,
} from '../../controllers/deployment.controller.js';

const router = Router();

const anyRole = requireProjectRole(ProjectRole.OWNER, ProjectRole.MAINTAINER, ProjectRole.VIEWER);
const ownerOrMaintainer = requireProjectRole(ProjectRole.OWNER, ProjectRole.MAINTAINER);
const ownerOnly = requireProjectRole(ProjectRole.OWNER);

// Project list and creation
router.get('/', requireAuth, getProjectIndex);
router.get('/new', requireAuth, getNewProject);
router.post('/', requireAuth, postNewProject);

// Project-scoped routes (require resolved project + membership)
router.get('/:slug', requireAuth, anyRole, getProject);
router.get('/:slug/edit', requireAuth, ownerOnly, getEditProject);
router.post('/:slug/update', requireAuth, ownerOnly, postEditProject);
router.post('/:slug/archive', requireAuth, ownerOnly, postArchiveProject);
router.post('/:slug/submit-review', requireAuth, ownerOnly, postSubmitForReview);

// Members
router.get('/:slug/members', requireAuth, ownerOnly, getProjectMembers_ctrl);
router.post('/:slug/members/invite', requireAuth, ownerOnly, postInviteMember);
router.post('/:slug/members/:userId/remove', requireAuth, ownerOnly, postRemoveMember);
router.post('/:slug/members/:userId/role', requireAuth, ownerOnly, postUpdateMemberRole);
router.post('/:slug/transfer-ownership', requireAuth, ownerOnly, postTransferOwnership);

// Repository
router.get('/:slug/repository', requireAuth, ownerOnly, getRepository);
router.post('/:slug/repository', requireAuth, ownerOnly, postConnectRepository);
router.post('/:slug/repository/disconnect', requireAuth, ownerOnly, postDisconnectRepository);

// Deployment mode
router.post('/:slug/deployment-mode', requireAuth, ownerOnly, postUpdateDeploymentMode);

// Detection
router.get('/:slug/detection', requireAuth, anyRole, getDetection);
router.post('/:slug/detection', requireAuth, ownerOnly, postRunDetection);

// Deployments
router.get('/:slug/deployments', requireAuth, anyRole, getDeploymentList);
router.post('/:slug/deployments', requireAuth, ownerOrMaintainer, postCreateDeployment);
router.post('/:slug/rollback', requireAuth, ownerOrMaintainer, postRollback);
router.get('/:slug/deployments/:deploymentId', requireAuth, anyRole, getDeploymentDetail);
router.get('/:slug/deployments/:deploymentId/logs', requireAuth, anyRole, sseDeploymentLogs);
router.post('/:slug/deployments/:deploymentId/cancel', requireAuth, ownerOrMaintainer, postCancelDeployment);
router.post('/:slug/deployments/:deploymentId/retry', requireAuth, ownerOrMaintainer, postRetryDeployment);

// Environment secrets
router.get('/:slug/environment', requireAuth, ownerOnly, getEnvironment);
router.post('/:slug/environment', requireAuth, ownerOnly, postSetSecret);
router.post('/:slug/environment/:name/delete', requireAuth, ownerOnly, postDeleteSecret);

// Custom domains
router.get('/:slug/domains', requireAuth, anyRole, getDomains);
router.post('/:slug/domains', requireAuth, ownerOnly, postAddDomain);
router.post('/:slug/domains/:domainId/verify', requireAuth, ownerOnly, postVerifyDomain);
router.post('/:slug/domains/:domainId/remove', requireAuth, ownerOnly, postRemoveDomain);

export default router;
