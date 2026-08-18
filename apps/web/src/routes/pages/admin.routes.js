import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireAdmin } from '../../middleware/require-auth.js';
import { requireSuperAdmin } from '../../middleware/require-auth.js';
import {
  getAdminIndex,
  getAdminUsers,
  postSuspendUser,
  postReactivateUser,
  getAdminProjects,
  postAdminSuspendProject,
  postAdminReactivateProject,
  getApprovalRequestsList,
  postReviewApprovalRequest,
  getAdminServer,
  postPauseQueue,
  postResumeQueue,
  postEnableMaintenance,
  postDisableMaintenance,
  getAdminAuditEvents,
  getAdminAuditExport,
  getAdminQuota,
  postAdminSetQuota,
} from '../../controllers/admin.controller.js';
import {
  getAdminDomains,
  postApproveDomain,
  postRejectDomain,
} from '../../controllers/domain.controller.js';
import { validateObjectId } from '../../middleware/validate-object-id.js';

const router = Router();

router.use(requireAuth, requireAdmin);

for (const param of ['userId', 'projectId', 'requestId', 'domainId', 'scopeId']) {
  router.param(param, validateObjectId);
}

router.get('/', getAdminIndex);

router.get('/users', getAdminUsers);
router.post('/users/:userId/suspend', postSuspendUser);
router.post('/users/:userId/reactivate', postReactivateUser);

router.get('/projects', getAdminProjects);
router.post('/projects/:projectId/suspend', postAdminSuspendProject);
router.post('/projects/:projectId/reactivate', postAdminReactivateProject);

router.get('/approval-requests', getApprovalRequestsList);
router.post('/approval-requests/:requestId/review', postReviewApprovalRequest);

router.get('/domains', getAdminDomains);
router.post('/domains/:domainId/approve', postApproveDomain);
router.post('/domains/:domainId/reject', postRejectDomain);

router.get('/server', getAdminServer);
// Queue pause/resume is a platform-wide operational lever (stalls every
// project's deploys), same class of impact as maintenance mode below.
router.post('/server/queue/pause', requireSuperAdmin, postPauseQueue);
router.post('/server/queue/resume', requireSuperAdmin, postResumeQueue);
router.post('/server/maintenance/enable', requireSuperAdmin, postEnableMaintenance);
router.post('/server/maintenance/disable', requireSuperAdmin, postDisableMaintenance);

router.get('/audit-events', getAdminAuditEvents);
router.get('/audit-events/export', getAdminAuditExport);

router.get('/quotas/:scopeType/:scopeId', getAdminQuota);
// Quota overrides are a resource/billing policy lever, not routine moderation.
router.post('/quotas/:scopeType/:scopeId', requireSuperAdmin, postAdminSetQuota);

export default router;
