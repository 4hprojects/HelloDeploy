import http from 'node:http';
import https from 'node:https';

import { AppHealth } from '@hellodeploy/contracts';

const PROBE_TIMEOUT_MS = 3000;
const PUBLIC_TIMEOUT_MS = 5000;
const PROBE_CONCURRENCY = 3;
// A container younger than this that has not passed yet is still starting.
const STARTING_GRACE_MS = 60_000;

/**
 * One HTTP GET with a hard timeout and no redirects. Passes on any status
 * below 400, the same rule the deploy-time health check applies, so a
 * running app is judged by one standard before and after go-live.
 */
export function probeOnce(url, { timeoutMs = PROBE_TIMEOUT_MS, client } = {}) {
  const transport = client ?? (url.startsWith('https:') ? https : http);
  const started = Date.now();
  return new Promise((resolve) => {
    const request = transport.get(
      url,
      { timeout: timeoutMs, headers: { 'user-agent': 'HelloDeploy-monitor' } },
      (res) => {
        res.resume();
        resolve({
          ok: res.statusCode < 400,
          statusCode: res.statusCode,
          latencyMs: Date.now() - started,
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', (error) =>
      resolve({
        ok: false,
        statusCode: null,
        latencyMs: Date.now() - started,
        error: String(error.message).slice(0, 80),
      }),
    );
  });
}

/** Run `task` over `items` with at most `limit` in flight. */
export async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Probe every live release on its loopback port and keep per-project
 * consecutive pass/fail counts, so one dropped request never flips an app to
 * Unhealthy and one lucky response never declares it Healthy.
 */
export function createProbeTracker({ probe = probeOnce, now = () => new Date() } = {}) {
  const history = new Map();

  async function run(targets, { publicDomain = null, checkPublic = false } = {}) {
    const at = now().toISOString();
    await mapLimited(targets, PROBE_CONCURRENCY, async (target) => {
      const record = history.get(target.projectId) ?? {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        last: null,
        public: null,
      };
      const result = await probe(`http://127.0.0.1:${target.port}${target.path}`);
      record.last = { ...result, at };
      if (result.ok) {
        record.consecutiveSuccesses += 1;
        record.consecutiveFailures = 0;
        record.lastSuccessAt = at;
      } else {
        record.consecutiveFailures += 1;
        record.consecutiveSuccesses = 0;
        record.lastFailureAt = at;
      }
      if (checkPublic && publicDomain && target.subdomain) {
        const publicResult = await probe(
          `https://${target.subdomain}.${publicDomain}${target.path}`,
          {
            timeoutMs: PUBLIC_TIMEOUT_MS,
          },
        );
        record.public = { ...publicResult, at };
      } else if (!checkPublic) {
        record.public = null;
      }
      history.set(target.projectId, record);
    });
    // Forget projects that no longer have a live release.
    const live = new Set(targets.map((t) => t.projectId));
    for (const projectId of history.keys()) {
      if (!live.has(projectId)) {
        history.delete(projectId);
      }
    }
  }

  return { run, get: (projectId) => history.get(projectId) ?? null };
}

/**
 * Health of one application from its container state, probe history and
 * project status. Intentional states (maintenance, stopped, suspended) are
 * reported as such, not as outages, and nothing is Healthy without probes.
 */
export function deriveAppHealth({ project, container, probe, policy, probesEnabled, nowMs }) {
  if (project.maintenance) {
    return { status: AppHealth.MAINTENANCE, reason: 'Maintenance mode is on' };
  }
  if (project.status === 'SUSPENDED') {
    return { status: AppHealth.STOPPED, reason: 'Suspended by an administrator' };
  }
  if (!project.activeDeploymentId) {
    return { status: AppHealth.STOPPED, reason: 'No live release' };
  }
  if (!container) {
    return { status: AppHealth.UNHEALTHY, reason: 'The live release container is missing' };
  }
  if (container.restarting) {
    return { status: AppHealth.RESTARTING, reason: 'Docker is restarting the container' };
  }
  if (!container.running) {
    return {
      status: AppHealth.UNHEALTHY,
      reason: container.oomKilled ? 'Stopped: out of memory' : `Container ${container.status}`,
    };
  }
  if (!probesEnabled) {
    return { status: AppHealth.UNKNOWN, reason: 'Health probes are turned off' };
  }
  if (!probe?.last) {
    return { status: AppHealth.UNKNOWN, reason: 'Not probed yet' };
  }
  const { failuresBeforeUnhealthy, successesBeforeHealthy } = policy.probes;
  const startedMs = container.startedAt ? Date.parse(container.startedAt) : 0;
  if (probe.consecutiveFailures >= failuresBeforeUnhealthy) {
    return { status: AppHealth.UNHEALTHY, reason: describeFailure(probe.last) };
  }
  if (probe.consecutiveFailures > 0) {
    if (nowMs - startedMs < STARTING_GRACE_MS && !probe.lastSuccessAt) {
      return { status: AppHealth.STARTING, reason: 'Started recently, not answering yet' };
    }
    return {
      status: AppHealth.DEGRADED,
      reason: `${describeFailure(probe.last)} (${probe.consecutiveFailures} in a row)`,
    };
  }
  if (probe.consecutiveSuccesses >= successesBeforeHealthy) {
    return {
      status: AppHealth.HEALTHY,
      reason: `Answered ${probe.last.statusCode} in ${probe.last.latencyMs} ms`,
    };
  }
  return { status: AppHealth.STARTING, reason: 'Passing, not yet confirmed' };
}

function describeFailure(last) {
  if (last.statusCode) {
    return `Health check returned ${last.statusCode}`;
  }
  return `Health check failed: ${last.error ?? 'no response'}`;
}
