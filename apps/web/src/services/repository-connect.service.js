/**
 * Connect a GitHub App repository to a project.
 *
 * Extracted so the guided setup wizard and the standalone Repository page share
 * one implementation: both must verify the repository is actually authorized
 * for the caller's installation, confirm the branch still exists, and reset
 * detection so stale results are never attributed to new code.
 */

import { Project, Repository } from '@hellodeploy/database';
import { AuditOutcome, RepositoryProvider, RepositorySourceType } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

import { getLatestCommit, listInstallationRepos } from './github.service.js';
import { DETECTION_RESET } from './detection.service.js';

/** Plain-language copy for the ways connecting can fail. */
export const CONNECT_ERROR_COPY = Object.freeze({
  NO_INSTALLATION: 'Connect your GitHub account before choosing a project.',
  LIST_FAILED: 'HelloDeploy could not reach GitHub to confirm access. Try again in a moment.',
  NOT_AUTHORIZED:
    'HelloDeploy cannot access this GitHub project. Reconnect GitHub or update which repositories it can see.',
  BRANCH_GONE: 'That branch no longer exists on GitHub. Choose another branch.',
  BRANCH_CHECK_FAILED: 'HelloDeploy could not read that branch from GitHub. Try again in a moment.',
});

/**
 * @param {{
 *   project: object,
 *   installationId: number|null,
 *   selection: { fullName: string, branch: string },
 *   actor: { id: string, sourceIp: string, correlationId: string },
 * }} params
 * @returns {Promise<{ success: boolean, error?: string, repository?: object }>}
 */
export async function connectGithubRepository({ project, installationId, selection, actor }) {
  if (!installationId) {
    return { success: false, error: CONNECT_ERROR_COPY.NO_INSTALLATION };
  }

  const { fullName, branch } = selection;
  if (!fullName) {
    return { success: false, error: CONNECT_ERROR_COPY.NOT_AUTHORIZED };
  }

  let repos;
  try {
    repos = await listInstallationRepos(installationId);
  } catch {
    return { success: false, error: CONNECT_ERROR_COPY.LIST_FAILED };
  }

  // Never trust the submitted repository details — only the installation's own
  // listing decides what this account may connect.
  const authorized = repos.find((candidate) => candidate.fullName === fullName);
  if (!authorized) {
    return { success: false, error: CONNECT_ERROR_COPY.NOT_AUTHORIZED };
  }

  const productionBranch = branch || authorized.defaultBranch;

  let latestCommit;
  try {
    latestCommit = await getLatestCommit(installationId, fullName, productionBranch);
  } catch (err) {
    return {
      success: false,
      error:
        err.status === 404
          ? CONNECT_ERROR_COPY.BRANCH_GONE
          : CONNECT_ERROR_COPY.BRANCH_CHECK_FAILED,
    };
  }

  const repoData = {
    sourceType: RepositorySourceType.GITHUB_APP,
    provider: RepositoryProvider.GITHUB,
    canonicalCloneUrl: null,
    projectId: project._id,
    installationId,
    githubRepoId: authorized.id,
    nodeId: authorized.nodeId,
    fullName,
    name: authorized.name,
    ownerLogin: authorized.ownerLogin,
    defaultBranch: authorized.defaultBranch,
    visibility: authorized.visibility ?? (authorized.private ? 'private' : 'public'),
    accessStatus: 'ACTIVE',
    lastCommitSha: latestCommit?.sha ?? null,
    lastCommitMessage: latestCommit?.message ?? null,
    lastCommitAt: latestCommit ? new Date() : null,
    connectedAt: new Date(),
    revokedAt: null,
  };

  const existing = await Repository.findOne({ projectId: project._id });
  let repository;
  if (existing) {
    Object.assign(existing, repoData);
    repository = await existing.save();
  } else {
    repository = await Repository.create(repoData);
  }

  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        repositoryId: repository._id,
        productionBranch,
        runtimeType: null,
        // Detection describes a specific commit. Pointing at new code invalidates
        // whatever was detected before. Uses the shared reset shape so no field
        // is silently dropped back to its schema default.
        detection: DETECTION_RESET,
        configurationVersion: (project.configurationVersion ?? 0) + 1,
      },
    },
  );

  await writeAuditEvent({
    action: 'project.repository_connected',
    outcome: AuditOutcome.SUCCESS,
    actorId: actor.id,
    targetType: 'project',
    targetId: project._id.toString(),
    sourceIp: actor.sourceIp,
    correlationId: actor.correlationId,
    metadata: { fullName, productionBranch },
  });

  return { success: true, repository };
}
