import { Deployment, Project, mongoose } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';

const IN_PROGRESS = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
];
const FINISHED = [
  DeploymentStatus.HEALTHY,
  DeploymentStatus.FAILED,
  DeploymentStatus.CANCELLED,
  DeploymentStatus.ROLLED_BACK,
];
// A stage running this long is worth an administrator's look: builds time out
// at 10 minutes by default, so 30 means something is stuck, not slow.
export const STUCK_AFTER_MS = 30 * 60_000;
const UNRESOLVED_WINDOW_MS = 30 * 86_400_000;

/**
 * Deployment activity for the overview: what is running now, the latest
 * results, and which projects' most recent attempt failed. A failure later
 * fixed by a successful deploy is history, not an open problem.
 */
export async function getDeploymentActivity({ now = new Date(), recentLimit = 10 } = {}) {
  const [inProgress, recent, unresolved] = await Promise.all([
    Deployment.find({ status: { $in: IN_PROGRESS } })
      .select('_id projectId status sequenceNumber createdAt updatedAt')
      .sort({ _id: -1 })
      .limit(20)
      .lean(),
    // Newest first by _id walks the primary index and stops early, instead of
    // sorting every finished deployment ever recorded.
    Deployment.find({ status: { $in: FINISHED } })
      .select('_id projectId status sequenceNumber failureCode updatedAt')
      .sort({ _id: -1 })
      .limit(recentLimit)
      .lean(),
    Deployment.aggregate([
      {
        $match: {
          status: { $in: [DeploymentStatus.HEALTHY, DeploymentStatus.FAILED] },
          _id: { $gte: objectIdAt(new Date(now.getTime() - UNRESOLVED_WINDOW_MS)) },
        },
      },
      { $sort: { projectId: 1, sequenceNumber: -1 } },
      {
        $group: {
          _id: '$projectId',
          status: { $first: '$status' },
          deploymentId: { $first: '$_id' },
          sequenceNumber: { $first: '$sequenceNumber' },
          failureCode: { $first: '$failureCode' },
          at: { $first: '$updatedAt' },
        },
      },
      { $match: { status: DeploymentStatus.FAILED } },
      { $limit: 50 },
    ]),
  ]);

  const projectIds = [
    ...new Set([...inProgress, ...recent, ...unresolved].map((d) => String(d.projectId ?? d._id))),
  ];
  const projects = await Project.find({ _id: { $in: projectIds } })
    .select('_id slug')
    .lean();
  const slugOf = (id) => projects.find((p) => String(p._id) === String(id))?.slug ?? 'unknown';
  const unresolvedProjects = new Set(unresolved.map((u) => String(u._id)));

  return {
    active: inProgress.map((d) => {
      const startedAt = d.createdAt ?? d._id.getTimestamp();
      const elapsedMs = now.getTime() - new Date(startedAt).getTime();
      return {
        project: slugOf(d.projectId),
        href: `/projects/${slugOf(d.projectId)}/deployments/${d._id}`,
        sequence: d.sequenceNumber,
        stage: d.status,
        elapsedSeconds: Math.max(0, Math.round(elapsedMs / 1000)),
        stuck: d.status !== DeploymentStatus.QUEUED && elapsedMs > STUCK_AFTER_MS,
      };
    }),
    recent: recent.map((d) => ({
      project: slugOf(d.projectId),
      href: `/projects/${slugOf(d.projectId)}/deployments/${d._id}`,
      sequence: d.sequenceNumber,
      status: d.status,
      failureCode: d.failureCode ?? null,
      finishedAt: d.updatedAt,
      // Failed, but the project has deployed successfully since.
      superseded:
        d.status === DeploymentStatus.FAILED &&
        now.getTime() - new Date(d.updatedAt).getTime() < UNRESOLVED_WINDOW_MS &&
        !unresolvedProjects.has(String(d.projectId)),
    })),
    unresolvedFailures: unresolved.map((u) => ({
      projectId: String(u._id),
      project: slugOf(u._id),
      href: `/projects/${slugOf(u._id)}/deployments/${u.deploymentId}`,
      sequence: u.sequenceNumber,
      failureCode: u.failureCode ?? null,
      at: u.at,
    })),
  };
}

function objectIdAt(date) {
  return mongoose.Types.ObjectId.createFromTime(Math.floor(date.getTime() / 1000));
}
