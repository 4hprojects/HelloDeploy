import { MonitoringIncident, Project } from '@hellodeploy/database';
import {
  ADMIN_OPS_EVENT_CHANNEL,
  AppHealth,
  IncidentState,
  OPEN_INCIDENT_STATES,
  isNotificationMuted,
} from '@hellodeploy/contracts';

const LAST_SEEN_WRITE_MS = 60_000;
// A condition that comes back this soon after recovering reopens the same
// incident (one more occurrence) instead of starting a new one.
const REOPEN_WINDOW_MS = 30 * 60_000;
const RESOLVED_RETENTION_MS = 90 * 86_400_000;
const QUEUE_STALL_SECONDS = 600;

/**
 * Deterministic rule observations from one snapshot. Each observation says
 * which level the reading is at now (`level`), whether it is back below the
 * recovery threshold (`clear`), or that there is no reading (`unknown`), in
 * which case nothing opens and nothing resolves.
 */
export function observe(snapshot, policy) {
  const observations = [];
  const metric = (key) => snapshot.metrics?.find((m) => m.key === key)?.value ?? null;
  const t = policy.thresholds;
  const threshold = (rule, value, extra = {}) => {
    if (typeof value !== 'number') {
      return { unknown: true };
    }
    let level = null;
    if (value >= rule.critical) {
      level = 'critical';
    } else if (value >= rule.warning) {
      level = 'warning';
    }
    return {
      level,
      clear: value < rule.clear,
      value,
      sustainSeconds: rule.sustainSeconds,
      ...extra,
    };
  };

  const cpu = metric('host.cpu.utilization');
  const cores = metric('host.cpu.cores');
  const load1 = metric('host.load.1m');
  const cpuObservation = threshold(t.cpu, cpu, { unit: '%', threshold: t.cpu.warning });
  // A busy CPU is only critical when work is queuing for it, not at one spike.
  if (cpuObservation.level === 'critical' && !(load1 !== null && cores && load1 / cores >= 1)) {
    cpuObservation.level = 'warning';
  }
  observations.push({
    fingerprint: 'host:cpu',
    rule: 'host.cpu',
    scope: 'host',
    title: 'Host CPU is high',
    detail:
      cpu === null ? null : `${cpu}% of all cores, load ${load1 ?? '?'} on ${cores ?? '?'} cores`,
    href: '/admin',
    ...cpuObservation,
  });

  const memory = metric('host.memory.usedPercent');
  const pressure = metric('host.memory.pressureSome60');
  const memoryObservation = threshold(t.memory, memory, { unit: '%', threshold: t.memory.warning });
  if (
    memoryObservation.level === 'critical' &&
    pressure !== null &&
    pressure < policy.memoryPressureCritical
  ) {
    memoryObservation.level = 'warning';
  }
  observations.push({
    fingerprint: 'host:memory',
    rule: 'host.memory',
    scope: 'host',
    title: 'Host memory is running low',
    detail:
      memory === null
        ? null
        : `${memory}% used${pressure === null ? '' : `, pressure ${pressure}%`}`,
    href: '/admin',
    ...memoryObservation,
  });

  // Policy reserve: available memory has fallen into the share held back
  // for the OS, platform and builds.
  const memTotal = metric('host.memory.total');
  const memAvailable = metric('host.memory.available');
  if (memTotal && memAvailable !== null) {
    const availablePercent = Math.round((memAvailable / memTotal) * 1000) / 10;
    const reservePercent = policy.capacity.memoryReservePercent;
    observations.push({
      fingerprint: 'capacity:memory:reserve',
      rule: 'capacity.memory',
      scope: 'host',
      title: 'Memory headroom is inside the policy reserve',
      detail: `${availablePercent}% available, reserve is ${reservePercent}%`,
      href: '/admin',
      level: reservePercent > 0 && availablePercent < reservePercent ? 'warning' : null,
      clear: availablePercent >= reservePercent + 5,
      value: availablePercent,
      unit: '%',
      threshold: reservePercent,
      sustainSeconds: t.memory.sustainSeconds,
    });
  }

  for (const disk of snapshot.disks ?? []) {
    observations.push({
      fingerprint: `host:disk:${disk.key}`,
      rule: 'host.disk',
      scope: 'host',
      entityId: disk.key,
      entityLabel: disk.label,
      title: `${disk.label} is filling up`,
      detail: `${disk.usedPercent}% used`,
      href: '/admin',
      ...threshold(t.disk, disk.usedPercent, { unit: '%', threshold: t.disk.warning }),
    });
  }

  for (const app of snapshot.apps ?? []) {
    const percent =
      typeof app.memoryBytes === 'number' && app.memoryLimitBytes
        ? Math.round((app.memoryBytes / app.memoryLimitBytes) * 1000) / 10
        : null;
    if (app.memoryLimitBytes && app.containerState === 'running') {
      observations.push({
        fingerprint: `container:memory:${app.projectId}`,
        rule: 'container.memory',
        scope: 'project',
        entityId: app.projectId,
        entityLabel: app.slug,
        title: `${app.slug} is near its memory limit`,
        detail:
          percent === null
            ? null
            : `${percent}% of its ${Math.round(app.memoryLimitBytes / 1048576)} MiB limit`,
        href: `/projects/${app.slug}`,
        ...threshold(t.containerMemory, percent, {
          unit: '%',
          threshold: t.containerMemory.warning,
        }),
      });
    }

    const base = {
      fingerprint: `app:health:${app.projectId}`,
      rule: 'app.health',
      scope: 'project',
      entityId: app.projectId,
      entityLabel: app.slug,
      href: `/projects/${app.slug}`,
      detail: app.reason,
      // Probes already require consecutive failures before Unhealthy.
      sustainSeconds: 0,
    };
    if (app.health === AppHealth.UNHEALTHY || app.health === AppHealth.RESTARTING) {
      observations.push({ ...base, level: 'critical', title: `${app.slug} is ${app.health}` });
    } else if (app.health === AppHealth.DEGRADED) {
      observations.push({ ...base, level: 'warning', title: `${app.slug} is degraded` });
    } else if (app.health === AppHealth.HEALTHY) {
      observations.push({ ...base, level: null, clear: true, title: `${app.slug} recovered` });
    } else if (app.health === AppHealth.STOPPED || app.health === AppHealth.MAINTENANCE) {
      // Intentional: any open outage for it is closed as cleared, not recovered.
      observations.push({
        ...base,
        level: null,
        clear: true,
        intentional: true,
        title: `${app.slug} stopped`,
      });
    } else {
      observations.push({ ...base, unknown: true, title: `${app.slug}` });
    }
  }

  const sourceRule = (key, source, title, href) => {
    const state = snapshot.sources?.[source];
    if (!state) {
      return;
    }
    observations.push({
      fingerprint: `monitoring:${key}`,
      rule: `monitoring.${key}`,
      scope: 'platform',
      title,
      detail: state.ok ? null : state.reason,
      href,
      level: state.ok ? null : 'warning',
      clear: state.ok,
      sustainSeconds: (snapshot.intervals?.resourceSeconds ?? 15) * 2,
    });
  };
  sourceRule('host', 'host', 'Host metrics cannot be read', '/admin');
  sourceRule('docker', 'docker', 'Docker is not answering the monitor', '/admin');
  if (snapshot.nginx) {
    observations.push({
      fingerprint: 'service:nginx:config',
      rule: 'service.nginx',
      scope: 'platform',
      title: 'Nginx configuration check failed',
      detail: snapshot.nginx.ok ? null : snapshot.nginx.reason,
      href: '/admin/server',
      level: snapshot.nginx.ok ? null : 'critical',
      clear: snapshot.nginx.ok,
      sustainSeconds: 0,
    });
  }
  for (const service of snapshot.services ?? []) {
    if (!service.installed || service.key === 'web') {
      continue;
    }
    const down = service.activeState !== 'active';
    observations.push({
      fingerprint: `service:${service.key}`,
      rule: 'service.unit',
      scope: 'platform',
      entityId: service.key,
      entityLabel: service.label,
      title: `${service.label} is not running`,
      detail: `systemd ${service.activeState} (${service.subState})`,
      href: '/admin/server',
      level: down ? 'critical' : null,
      clear: !down,
      sustainSeconds: (snapshot.intervals?.serviceSeconds ?? 30) * 2,
    });
  }

  const queue = snapshot.queue;
  if (queue) {
    const stalled = queue.waiting > 0 && queue.active === 0 && !queue.paused;
    observations.push({
      fingerprint: 'queue:stalled',
      rule: 'queue.stalled',
      scope: 'platform',
      title: 'Deployments are waiting but none is running',
      detail: `${queue.waiting} waiting, 0 active`,
      href: '/admin/server',
      level: stalled ? 'warning' : null,
      clear: !stalled,
      sustainSeconds: QUEUE_STALL_SECONDS,
    });
  }
  return observations;
}

/**
 * Turns observations into incident lifecycle changes, with sustain timers on
 * the way in and the recovery threshold on the way out. Writes to Mongo only
 * when something changes, plus at most one `lastSeen` update per minute.
 */
export function createAlertEngine({
  model = MonitoringIncident,
  findSlug = async (projectId) =>
    (await Project.findById(projectId).select('slug').lean())?.slug ?? null,
  redis = null,
  logger,
  now = () => new Date(),
}) {
  const open = new Map();
  const timers = new Map();
  let loaded = false;

  async function load() {
    const docs = await model.find({ state: { $in: OPEN_INCIDENT_STATES } }).lean();
    for (const doc of docs) {
      open.set(doc.fingerprint, { ...doc, lastWriteAt: now().getTime() });
    }
    loaded = true;
  }

  function publish(doc, policy) {
    if (!redis || redis.status !== 'ready') {
      return;
    }
    redis
      .publish(
        ADMIN_OPS_EVENT_CHANNEL,
        JSON.stringify({
          type: 'incident',
          id: String(doc._id),
          fingerprint: doc.fingerprint,
          severity: doc.severity,
          state: doc.state,
          title: doc.title,
          at: now().toISOString(),
          muted: isNotificationMuted(policy, now()),
        }),
      )
      .catch(() => {});
  }

  async function openIncident(observation, level, policy) {
    const at = now();
    const fields = {
      rule: observation.rule,
      scope: observation.scope,
      entityId: observation.entityId ?? null,
      entityLabel: observation.entityLabel ?? null,
      href: observation.href ?? null,
      severity: level,
      title: observation.title,
      detail: observation.detail ?? null,
      lastSeen: at,
      measurement: {
        value: observation.value ?? null,
        unit: observation.unit ?? null,
        threshold: observation.threshold ?? null,
      },
      policyRevision: policy.revision,
    };
    const recent = await model
      .findOneAndUpdate(
        {
          fingerprint: observation.fingerprint,
          state: IncidentState.RESOLVED,
          resolvedAt: { $gte: new Date(at.getTime() - REOPEN_WINDOW_MS) },
        },
        {
          $set: {
            ...fields,
            state: IncidentState.ACTIVE,
            resolvedAt: null,
            resolution: null,
            expiresAt: null,
            acknowledgedAt: null,
            acknowledgedBy: null,
          },
          $inc: { occurrences: 1 },
        },
        { new: true, sort: { resolvedAt: -1 } },
      )
      .lean()
      .catch((error) => {
        // Another open incident with this fingerprint already exists.
        if (error?.code === 11000) {
          return null;
        }
        throw error;
      });
    let doc = recent;
    if (!doc) {
      try {
        doc = (
          await model.create({
            ...fields,
            fingerprint: observation.fingerprint,
            state: IncidentState.ACTIVE,
            firstSeen: at,
            occurrences: 1,
          })
        ).toObject();
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }
        doc = await model
          .findOne({ fingerprint: observation.fingerprint, state: { $in: OPEN_INCIDENT_STATES } })
          .lean();
      }
    }
    if (doc) {
      open.set(observation.fingerprint, { ...doc, lastWriteAt: now().getTime() });
      publish(doc, policy);
      logger?.info('Monitoring: incident opened', {
        fingerprint: observation.fingerprint,
        severity: level,
      });
    }
  }

  async function resolveIncident(fingerprint, resolution, policy) {
    const current = open.get(fingerprint);
    const at = now();
    const doc = await model
      .findOneAndUpdate(
        { _id: current._id, state: { $in: OPEN_INCIDENT_STATES } },
        {
          $set: {
            state: IncidentState.RESOLVED,
            resolvedAt: at,
            resolution,
            lastSeen: at,
            expiresAt: new Date(at.getTime() + RESOLVED_RETENTION_MS),
          },
        },
        { new: true },
      )
      .lean();
    open.delete(fingerprint);
    timers.delete(fingerprint);
    if (doc) {
      publish(doc, policy);
    }
  }

  async function refreshIncident(fingerprint, observation, level, policy) {
    const current = open.get(fingerprint);
    const severityChanged = current.severity !== level;
    if (!severityChanged && now().getTime() - current.lastWriteAt < LAST_SEEN_WRITE_MS) {
      return;
    }
    const update = {
      lastSeen: now(),
      detail: observation.detail ?? current.detail,
      'measurement.value': observation.value ?? null,
      ...(severityChanged ? { severity: level, title: observation.title } : {}),
      // An acknowledged warning that turns critical needs attention again.
      ...(severityChanged && level === 'critical' && current.state === IncidentState.ACKNOWLEDGED
        ? { state: IncidentState.ACTIVE, acknowledgedAt: null, acknowledgedBy: null }
        : {}),
    };
    const doc = await model
      .findOneAndUpdate(
        { _id: current._id, state: { $in: OPEN_INCIDENT_STATES } },
        { $set: update },
        { new: true },
      )
      .lean();
    if (!doc) {
      // Resolved or removed elsewhere; forget it so a new breach can open fresh.
      open.delete(fingerprint);
      return;
    }
    open.set(fingerprint, { ...doc, lastWriteAt: now().getTime() });
    if (severityChanged) {
      publish(doc, policy);
    }
  }

  /** Evaluate one snapshot. Rule failures are logged and never thrown. */
  async function evaluate(snapshot, policy) {
    try {
      if (!loaded) {
        await load();
      }
      const nowMs = now().getTime();
      const seen = new Set();
      for (const observation of observe(snapshot, policy)) {
        seen.add(observation.fingerprint);
        await step(observation, policy, nowMs);
      }
      // A project or disk that is gone has nothing left to alert on.
      for (const fingerprint of [...open.keys()]) {
        const rule = open.get(fingerprint).rule;
        if (
          !seen.has(fingerprint) &&
          ['app.health', 'container.memory', 'host.disk'].includes(rule)
        ) {
          await resolveIncident(fingerprint, 'cleared', policy);
        }
      }
    } catch (error) {
      logger?.warn('Monitoring: alert evaluation failed', { error: error.message });
    }
  }

  async function step(observation, policy, nowMs) {
    if (observation.unknown) {
      return;
    }
    const timer = timers.get(observation.fingerprint) ?? {
      warningSince: null,
      criticalSince: null,
      clearSince: null,
    };
    const level = observation.level;
    timer.criticalSince = level === 'critical' ? (timer.criticalSince ?? nowMs) : null;
    timer.warningSince = level ? (timer.warningSince ?? nowMs) : null;
    timer.clearSince = observation.clear ? (timer.clearSince ?? nowMs) : null;
    timers.set(observation.fingerprint, timer);

    const sustainMs = (observation.sustainSeconds ?? 0) * 1000;
    let effective = null;
    if (timer.criticalSince !== null && nowMs - timer.criticalSince >= sustainMs) {
      effective = 'critical';
    } else if (timer.warningSince !== null && nowMs - timer.warningSince >= sustainMs) {
      effective = 'warning';
    }

    const current = open.get(observation.fingerprint);
    if (effective && !current) {
      await openIncident(observation, effective, policy);
    } else if (effective && current) {
      // While the condition holds, severity follows it: critical can step
      // back to warning, but only a full recovery resolves.
      await refreshIncident(observation.fingerprint, observation, effective, policy);
    } else if (current && observation.intentional) {
      await resolveIncident(observation.fingerprint, 'cleared', policy);
    } else if (current && timer.clearSince !== null) {
      const recoverMs = Math.min(60_000, sustainMs);
      if (nowMs - timer.clearSince >= recoverMs) {
        await resolveIncident(observation.fingerprint, 'recovered', policy);
      }
    }
  }

  /**
   * A deployment outcome, reported by the pipeline: a failure opens (or adds
   * an occurrence to) the project's deployment incident; a successful deploy
   * resolves it.
   */
  async function recordDeployment(
    { projectId, slug, deploymentId, sequenceNumber, status, failureCode },
    policy,
  ) {
    try {
      if (!loaded) {
        await load();
      }
      if (!slug && status === 'FAILED') {
        slug = await findSlug(projectId).catch(() => null);
      }
      const fingerprint = `deployment:failed:${projectId}`;
      if (status === 'FAILED') {
        const current = open.get(fingerprint);
        const observation = {
          fingerprint,
          rule: 'deployment.failed',
          scope: 'project',
          entityId: String(projectId),
          entityLabel: slug ?? null,
          title: `Latest deployment of ${slug ?? 'a project'} failed`,
          detail: `#${sequenceNumber ?? '?'}${failureCode ? `: ${String(failureCode).replaceAll('_', ' ').toLowerCase()}` : ''}`,
          href: slug ? `/projects/${slug}/deployments/${deploymentId}` : null,
        };
        if (current) {
          const doc = await model
            .findOneAndUpdate(
              { _id: current._id, state: { $in: OPEN_INCIDENT_STATES } },
              {
                $set: { lastSeen: now(), detail: observation.detail, href: observation.href },
                $inc: { occurrences: 1 },
              },
              { new: true },
            )
            .lean();
          if (doc) {
            open.set(fingerprint, { ...doc, lastWriteAt: now().getTime() });
          }
        } else {
          await openIncident(observation, 'warning', policy);
        }
      } else if (status === 'HEALTHY' && open.has(fingerprint)) {
        await resolveIncident(fingerprint, 'recovered', policy);
      }
    } catch (error) {
      logger?.warn('Monitoring: deployment incident update failed', { error: error.message });
    }
  }

  return { evaluate, recordDeployment, openFingerprints: () => [...open.keys()] };
}
