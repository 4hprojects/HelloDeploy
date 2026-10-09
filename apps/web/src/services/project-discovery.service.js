import { ApprovalRequest, Deployment, ProjectMembership, Repository } from '@hellodeploy/database';
import {
  ApprovalStatus,
  DeploymentStatus,
  DetectionStatus,
  getStatusPresentation,
  ProjectRole,
  ProjectStatus,
} from '@hellodeploy/contracts';
import { getDeploymentQueue } from '../queue/client.js';
import { checkWorkerReadiness } from './worker-readiness.service.js';

const ACTIVE_DEPLOYMENT_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
];
const ROLE_FILTERS = new Set(Object.values(ProjectRole));
const STATE_FILTERS = new Set([
  'setup',
  'needs_attention',
  'awaiting_review',
  'ready_to_deploy',
  'deploying',
  'live',
  'failed',
  'suspended',
  'archived',
]);
const SORTS = new Set(['updated_desc', 'updated_asc', 'name_asc', 'name_desc', 'state_asc']);

export function deriveProjectState({ project, repository, latestDeployment, latestApproval }) {
  if (project.status === ProjectStatus.ARCHIVED) {
    return state('archived', 'Archived', 'neutral');
  }
  if (project.status === ProjectStatus.SUSPENDED) {
    return state('suspended', 'Suspended', 'danger');
  }
  if (!repository) {
    return state('setup', 'Connect source', 'neutral');
  }
  if (repository.accessStatus !== 'ACTIVE') {
    return state('needs_attention', 'Repository access', 'warning');
  }
  if (project.detection?.status !== DetectionStatus.READY) {
    return state(
      project.detection?.status === DetectionStatus.NEEDS_ATTENTION ? 'needs_attention' : 'setup',
      project.detection?.status === DetectionStatus.NEEDS_ATTENTION
        ? 'Setup needs attention'
        : 'Check setup',
      project.detection?.status === DetectionStatus.NEEDS_ATTENTION ? 'warning' : 'neutral',
    );
  }
  if (latestApproval?.status === ApprovalStatus.PENDING) {
    return state('awaiting_review', 'Awaiting review', 'pending');
  }
  if (project.status === ProjectStatus.DRAFT) {
    return state('needs_attention', 'Submit for review', 'warning');
  }
  if (latestDeployment && ACTIVE_DEPLOYMENT_STATUSES.includes(latestDeployment.status)) {
    return state('deploying', 'Deploying', 'info');
  }
  if (latestDeployment?.status === DeploymentStatus.FAILED) {
    return state('failed', 'Deployment failed', 'danger');
  }
  if (project.activeDeploymentId) {
    return state('live', 'Live', 'success');
  }
  return state('ready_to_deploy', 'Ready to deploy', 'success');
}

function state(key, label, tone) {
  return { key, label, tone };
}

async function loadProjectRows(userId) {
  const memberships = await ProjectMembership.find({ userId }).limit(500).lean();
  const projectIds = memberships.map(({ projectId }) => projectId);
  if (projectIds.length === 0) {
    return [];
  }
  const [projects, repositories, deployments, approvals] = await Promise.all([
    ProjectMembership.populate(memberships, { path: 'projectId', model: 'Project' }),
    Repository.find({ projectId: { $in: projectIds } }).lean(),
    Deployment.find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(1_000)
      .lean(),
    ApprovalRequest.find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(1_000)
      .lean(),
  ]);
  const repositoryByProject = new Map(
    repositories.map((item) => [item.projectId.toString(), item]),
  );
  const latestDeploymentByProject = new Map();
  deployments.forEach((item) => {
    const key = item.projectId.toString();
    if (!latestDeploymentByProject.has(key)) {
      latestDeploymentByProject.set(key, item);
    }
  });
  const latestApprovalByProject = new Map();
  approvals.forEach((item) => {
    const key = item.projectId.toString();
    if (!latestApprovalByProject.has(key)) {
      latestApprovalByProject.set(key, item);
    }
  });
  return projects
    .filter((membership) => membership.projectId)
    .map((membership) => {
      const project = membership.projectId;
      const key = project._id.toString();
      const repository = repositoryByProject.get(key) ?? null;
      const latestDeployment = latestDeploymentByProject.get(key) ?? null;
      const latestApproval = latestApprovalByProject.get(key) ?? null;
      return {
        project,
        role: membership.role,
        repository,
        latestDeployment,
        latestApproval,
        derivedState: deriveProjectState({ project, repository, latestDeployment, latestApproval }),
      };
    });
}

export async function getProjectDiscovery(userId, query = {}) {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100).toLowerCase() : '';
  const role = ROLE_FILTERS.has(query.role) ? query.role : '';
  const status = STATE_FILTERS.has(query.status) ? query.status : '';
  const sort = SORTS.has(query.sort) ? query.sort : 'updated_desc';
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = 20;
  let rows = await loadProjectRows(userId);
  rows = rows.filter(
    (row) =>
      (!q ||
        [row.project.name, row.project.slug, row.repository?.fullName].some((value) =>
          value?.toLowerCase().includes(q),
        )) &&
      (!role || row.role === role) &&
      (!status || row.derivedState.key === status),
  );
  const direction = sort.endsWith('_asc') ? 1 : -1;
  rows.sort((a, b) => {
    if (sort.startsWith('name_')) {
      return direction * a.project.name.localeCompare(b.project.name);
    }
    if (sort === 'state_asc') {
      return a.derivedState.label.localeCompare(b.derivedState.label);
    }
    return direction * (new Date(a.project.updatedAt) - new Date(b.project.updatedAt));
  });
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  return {
    rows: rows.slice((safePage - 1) * perPage, safePage * perPage),
    total,
    page: safePage,
    totalPages,
    filters: { q, role, status, sort },
  };
}

export async function getDashboardOverview(userId) {
  const rows = await loadProjectRows(userId);
  const activeDeployments = rows
    .filter((row) => ACTIVE_DEPLOYMENT_STATUSES.includes(row.latestDeployment?.status))
    .slice(0, 10);
  const needsAttention = rows
    .filter((row) => ['needs_attention', 'failed'].includes(row.derivedState.key))
    .slice(0, 8);
  const healthCounts = Object.fromEntries([...STATE_FILTERS].map((key) => [key, 0]));
  rows.forEach((row) => {
    healthCounts[row.derivedState.key] += 1;
  });
  const recentEvents = rows
    .filter((row) => row.latestDeployment)
    .sort((a, b) => new Date(b.latestDeployment.updatedAt) - new Date(a.latestDeployment.updatedAt))
    .slice(0, 10);
  const notices = await getUserNotices(activeDeployments.length);
  return { rows, activeDeployments, needsAttention, healthCounts, recentEvents, notices };
}

async function getUserNotices(activeCount) {
  if (activeCount === 0) {
    return [];
  }
  try {
    const queue = getDeploymentQueue();
    const worker = await checkWorkerReadiness(queue);
    if (!queue) {
      return [
        { code: 'queue_unavailable', message: 'New deployments are temporarily unavailable.' },
      ];
    }
    if (!worker.ready) {
      return [
        {
          code: 'worker_unavailable',
          message: 'Active deployments are waiting for a deployment worker.',
        },
      ];
    }
    if (await queue.isPaused()) {
      return [{ code: 'queue_paused', message: 'Deployment processing is temporarily paused.' }];
    }
  } catch {
    return [
      {
        code: 'status_unavailable',
        message: 'Deployment processing status is temporarily unavailable.',
      },
    ];
  }
  return [];
}

function boundedDeploymentIds(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return [...new Set(value.split(',').filter((id) => /^[0-9a-f]{24}$/i.test(id)))].slice(0, 10);
}

function dashboardDeploymentPayload(row) {
  const deployment = row.latestDeployment;
  const presentation = getStatusPresentation('deployment', deployment.status);
  return {
    id: deployment._id.toString(),
    project: { name: row.project.name, slug: row.project.slug },
    status: deployment.status,
    stage: deployment.currentStage,
    terminal: presentation.terminal,
    presentation: {
      label: presentation.label,
      tone: presentation.tone,
      hint: presentation.hint,
    },
    updatedAt: deployment.updatedAt,
  };
}

export async function getDashboardStatus(userId, requestedIds = '') {
  const rows = await loadProjectRows(userId);
  const trackedIds = boundedDeploymentIds(requestedIds);
  const activeRows = rows.filter((row) =>
    ACTIVE_DEPLOYMENT_STATUSES.includes(row.latestDeployment?.status),
  );
  const rowByProject = new Map(rows.map((row) => [row.project._id.toString(), row]));
  const trackedDeployments = trackedIds.length
    ? await Deployment.find({
        _id: { $in: trackedIds },
        projectId: { $in: rows.map((row) => row.project._id) },
      }).lean()
    : [];
  const trackedRows = trackedDeployments.flatMap((deployment) => {
    const row = rowByProject.get(deployment.projectId.toString());
    return row ? [{ ...row, latestDeployment: deployment }] : [];
  });
  const notices = await getUserNotices(activeRows.length);
  return {
    deployments: trackedRows.map(dashboardDeploymentPayload),
    activeDeployments: activeRows.slice(0, 10).map(dashboardDeploymentPayload),
    notices,
  };
}
