import { Router } from 'express';
import { ProjectRole } from '@hellodeploy/contracts';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireProjectRole } from '../../middleware/require-project-role.js';
import { deployActionLimiter, repositoryInspectLimiter } from '../../middleware/rate-limit.js';
import {
  getProjectIndex,
  getNewProject,
  postNewProject,
  getProject,
  getEditProject,
  getProjectSettings,
  postEditProject,
  postArchiveProject,
  postDeleteProject,
  postEnableMaintenance,
  postDisableMaintenance,
  postSubmitForReview,
  getProjectMembersPage,
  postInviteMember,
  postRemoveMember,
  postRevokeInvitation,
  postUpdateMemberRole,
  postTransferOwnership,
  postUpdateDeploymentMode,
  postUpdateNotificationPreference,
  getSlugAvailability,
} from '../../controllers/project.controller.js';
import {
  getRepository,
  postConnectRepository,
  postDisconnectRepository,
  postInspectPublicRepository,
} from '../../controllers/github.controller.js';
import {
  getDetection,
  postRunDetection,
  postResetBuildConfiguration,
  postUpdateBuildConfiguration,
  postUpdateBuildFilters,
} from '../../controllers/detection.controller.js';
import {
  getDeployHookSettings,
  postGenerateDeployHook,
  postRevokeDeployHook,
} from '../../controllers/deploy-hook.controller.js';
import {
  getEnvironment,
  postSetSecret,
  postImportEnvFile,
  postPreviewEnvFile,
  postBulkUpdateSecrets,
  postDeleteSecret,
  postDeleteAllSecrets,
  postRevealSecrets,
} from '../../controllers/env-secret.controller.js';
import {
  getDomains,
  postAddDomain,
  postVerifyDomain,
  postActivateDomain,
  postRemoveDomain,
  getDomainStatuses,
  postCheckDomainRouting,
  postConnectDomain,
} from '../../controllers/domain.controller.js';
import {
  getDeploymentList,
  getDeploymentDetail,
  postCreateDeployment,
  postCancelDeployment,
  postRetryDeployment,
  postRollback,
  sseDeploymentLogs,
  getDeploymentStatuses,
  getDeploymentStatus,
  downloadDeploymentLogs,
} from '../../controllers/deployment.controller.js';
import { validateObjectId } from '../../middleware/validate-object-id.js';
import { requireEditableProject } from '../../middleware/require-editable-project.js';
import { attachSetupGuide } from '../../middleware/attach-setup-guide.js';

const router = Router();

const anyRole = requireProjectRole(ProjectRole.OWNER, ProjectRole.MAINTAINER, ProjectRole.VIEWER);
const ownerOrMaintainer = requireProjectRole(ProjectRole.OWNER, ProjectRole.MAINTAINER);
const ownerOnly = requireProjectRole(ProjectRole.OWNER);
const repositoryGuide = attachSetupGuide('repository');
const detectionGuide = attachSetupGuide('detection');
const environmentGuide = attachSetupGuide('environment');
const deploymentsGuide = attachSetupGuide('deployments');

for (const param of ['userId', 'deploymentId', 'domainId']) {
  router.param(param, validateObjectId);
}

// Project list and creation
router.get('/', requireAuth, getProjectIndex);
router.get('/new', requireAuth, getNewProject);
router.get('/slug-availability', requireAuth, getSlugAvailability);
router.post('/', requireAuth, postNewProject);

// Project-scoped routes (require resolved project + membership)
router.get('/:slug', requireAuth, anyRole, getProject);
router.get('/:slug/edit', requireAuth, ownerOnly, getEditProject);
router.get('/:slug/settings', requireAuth, ownerOnly, getProjectSettings);
router.post('/:slug/update', requireAuth, ownerOnly, requireEditableProject, postEditProject);
router.post('/:slug/archive', requireAuth, ownerOnly, requireEditableProject, postArchiveProject);
router.post('/:slug/delete', requireAuth, ownerOnly, postDeleteProject);
router.post(
  '/:slug/maintenance/enable',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postEnableMaintenance,
);
router.post(
  '/:slug/maintenance/disable',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postDisableMaintenance,
);
router.post(
  '/:slug/submit-review',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postSubmitForReview,
);

// Members
router.get('/:slug/members', requireAuth, ownerOnly, getProjectMembersPage);
router.post(
  '/:slug/members/invite',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postInviteMember,
);
router.post(
  '/:slug/members/invitations/:invitationId/revoke',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postRevokeInvitation,
);
router.post(
  '/:slug/members/:userId/remove',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postRemoveMember,
);
router.post(
  '/:slug/members/:userId/role',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postUpdateMemberRole,
);
router.post(
  '/:slug/transfer-ownership',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postTransferOwnership,
);

// Repository
router.get('/:slug/repository', requireAuth, ownerOnly, repositoryGuide, getRepository);
router.post(
  '/:slug/repository/inspect',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  repositoryInspectLimiter,
  postInspectPublicRepository,
);
router.post(
  '/:slug/repository',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postConnectRepository,
);
router.post(
  '/:slug/repository/disconnect',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postDisconnectRepository,
);

// Deployment mode
router.post(
  '/:slug/deployment-mode',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postUpdateDeploymentMode,
);

// Notification preference
router.post(
  '/:slug/notification-preference',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postUpdateNotificationPreference,
);

// Deploy hook
router.get('/:slug/deploy-hook', requireAuth, ownerOnly, getDeployHookSettings);
router.post(
  '/:slug/deploy-hook/generate',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postGenerateDeployHook,
);
router.post(
  '/:slug/deploy-hook/revoke',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postRevokeDeployHook,
);

// Detection
router.get('/:slug/detection', requireAuth, anyRole, detectionGuide, getDetection);
router.post(
  '/:slug/detection',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  detectionGuide,
  postRunDetection,
);
router.post(
  '/:slug/build-configuration',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postUpdateBuildConfiguration,
);
router.post(
  '/:slug/build-configuration/reset',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postResetBuildConfiguration,
);
router.post(
  '/:slug/build-filters',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postUpdateBuildFilters,
);

// Deployments
router.get('/:slug/deployments', requireAuth, anyRole, deploymentsGuide, getDeploymentList);
router.post(
  '/:slug/deployments',
  requireAuth,
  ownerOrMaintainer,
  deployActionLimiter,
  postCreateDeployment,
);
router.post('/:slug/rollback', requireAuth, ownerOrMaintainer, deployActionLimiter, postRollback);
router.get('/:slug/deployments/status', requireAuth, anyRole, getDeploymentStatuses);
router.get('/:slug/deployments/:deploymentId', requireAuth, anyRole, getDeploymentDetail);
router.get('/:slug/deployments/:deploymentId/status', requireAuth, anyRole, getDeploymentStatus);
router.get(
  '/:slug/deployments/:deploymentId/logs/download',
  requireAuth,
  anyRole,
  downloadDeploymentLogs,
);
router.get('/:slug/deployments/:deploymentId/logs', requireAuth, anyRole, sseDeploymentLogs);
router.post(
  '/:slug/deployments/:deploymentId/cancel',
  requireAuth,
  ownerOrMaintainer,
  postCancelDeployment,
);
router.post(
  '/:slug/deployments/:deploymentId/retry',
  requireAuth,
  ownerOrMaintainer,
  postRetryDeployment,
);

// Environment secrets
router.get('/:slug/environment', requireAuth, ownerOnly, environmentGuide, getEnvironment);
router.post(
  '/:slug/environment',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  environmentGuide,
  postSetSecret,
);
router.post(
  '/:slug/environment/import',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  environmentGuide,
  postImportEnvFile,
);
router.post(
  '/:slug/environment/import/preview',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postPreviewEnvFile,
);
router.post(
  '/:slug/environment/bulk-update',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  environmentGuide,
  postBulkUpdateSecrets,
);
router.post('/:slug/environment/reveal', requireAuth, ownerOnly, postRevealSecrets);
router.post(
  '/:slug/environment/delete-all',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postDeleteAllSecrets,
);
router.post(
  '/:slug/environment/:name/delete',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postDeleteSecret,
);

// Custom domains
router.get('/:slug/domains', requireAuth, anyRole, getDomains);
router.get('/:slug/domains/status', requireAuth, anyRole, getDomainStatuses);
router.post('/:slug/domains', requireAuth, ownerOnly, requireEditableProject, postAddDomain);
router.post(
  '/:slug/domains/:domainId/verify',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postVerifyDomain,
);
router.post(
  '/:slug/domains/:domainId/routing-check',
  requireAuth,
  ownerOnly,
  postCheckDomainRouting,
);
router.post(
  '/:slug/domains/:domainId/connect',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postConnectDomain,
);
router.post(
  '/:slug/domains/:domainId/remove',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postRemoveDomain,
);
router.post(
  '/:slug/domains/:domainId/activate',
  requireAuth,
  ownerOnly,
  requireEditableProject,
  postActivateDomain,
);

export default router;
