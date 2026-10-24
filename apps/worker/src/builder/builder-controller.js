import {
  AuditOutcome,
  BUILDER_LIMITS,
  BuilderControlAction,
  BuilderState,
  PlatformRole,
  evaluateBuilderAdmission,
  evaluateBuilderPressure,
} from '@hellodeploy/contracts';

import { redactLogLine } from '../deployment/log-capture.js';

/** A build the builder refused or cancelled; `code` is the deployment failure code. */
export class BuilderUnavailableError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BuilderUnavailableError';
    this.code = code;
  }
}

const START_POLL_MS = 2_000;
const START_TIMEOUT_MS = 90_000;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * The worker's owner of the on-demand builder. It is the only component that
 * starts or stops the builder service; the web reads the status it publishes
 * and queues requests through the builder-control queue.
 *
 * Guarantees:
 *   - Builds run only in READY, one at a time, after a fresh admission check.
 *   - A running build is cancelled when the host nears memory or disk
 *     exhaustion, when the service dies, or when its timeout plus grace passes.
 *   - Stop and idle shutdown never stop a running build; only Emergency Stop does.
 *
 * Every system boundary is injected so the behavior can be tested without a builder.
 */
export function createBuilderController({
  unitControl,
  verifyBuilder,
  verifyRegistry,
  readResources,
  readSettings,
  publishStatus,
  writeAudit,
  loadActorRole,
  logger,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setRepeating = (fn, ms) => setInterval(fn, ms),
  clearRepeating = (handle) => clearInterval(handle),
  startTimeoutMs = START_TIMEOUT_MS,
}) {
  const status = {
    state: BuilderState.STOPPED,
    lastError: null,
    stateChangedAt: new Date(now()).toISOString(),
    startedAt: null,
    lastActivityAt: null,
    idleMinutes: null,
    registry: null,
    resources: null,
  };
  let activeBuild = null;
  let monitorHandle = null;
  let isMonitoring = false;
  // Incremented by every stop, so an earlier start's readiness polling ends.
  let startGeneration = 0;
  let pendingStart = Promise.resolve();

  function setState(state, lastError = null) {
    status.state = state;
    status.lastError = lastError ? redactLogLine(String(lastError)).slice(0, 500) : null;
    status.stateChangedAt = new Date(now()).toISOString();
  }

  function snapshot() {
    const idleStopAt =
      status.state === BuilderState.READY && status.lastActivityAt && status.idleMinutes
        ? new Date(Date.parse(status.lastActivityAt) + status.idleMinutes * 60_000).toISOString()
        : null;
    return {
      ...status,
      idleStopAt,
      activeBuild: activeBuild
        ? {
            deploymentId: activeBuild.deploymentId,
            projectId: activeBuild.projectId,
            startedAt: new Date(activeBuild.startedAt).toISOString(),
          }
        : null,
      limits: BUILDER_LIMITS,
      updatedAt: new Date(now()).toISOString(),
    };
  }

  async function publish() {
    try {
      await publishStatus(snapshot());
    } catch (error) {
      logger.warn('Builder: could not publish status', { error: error.message });
    }
  }

  async function audit(action, outcome, actor, metadata = null) {
    await writeAudit({
      action,
      outcome,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
      targetType: 'builder',
      targetId: unitControl.unit,
      metadata,
    });
  }

  function cancelActiveBuild(reason) {
    if (activeBuild && !activeBuild.controller.signal.aborted) {
      activeBuild.controller.abort(new BuilderUnavailableError('BUILD_CANCELLED', reason));
      return activeBuild.deploymentId;
    }
    return null;
  }

  async function start(actor) {
    if ([BuilderState.STARTING, BuilderState.READY, BuilderState.BUILDING].includes(status.state)) {
      return { ok: true, message: 'The build service is already running.' };
    }
    if (status.state === BuilderState.STOPPING) {
      return { ok: false, message: 'The build service is stopping; try again shortly.' };
    }
    const reasons = evaluateBuilderAdmission(await readResources());
    if (reasons.length > 0) {
      status.lastError = `Not started: ${reasons.join(' ')}`;
      await audit('builder.start_refused', AuditOutcome.FAILURE, actor, { reasons });
      await publish();
      return { ok: false, message: status.lastError };
    }
    setState(BuilderState.STARTING);
    await publish();
    const generation = ++startGeneration;
    try {
      await unitControl.start();
    } catch (error) {
      setState(BuilderState.FAILED, error.message);
      await audit('builder.start_failed', AuditOutcome.FAILURE, actor, { error: error.message });
      await publish();
      return { ok: false, message: status.lastError };
    }
    // Readiness is polled outside the control job, so an Emergency Stop queued
    // right after this Start is handled at once.
    pendingStart = waitUntilReady(generation, actor);
    return { ok: true, message: 'The build service is starting.' };
  }

  async function waitUntilReady(generation, actor) {
    const deadline = now() + startTimeoutMs;
    let lastFailure = null;
    while (generation === startGeneration && status.state === BuilderState.STARTING) {
      try {
        await verifyBuilder();
        if (generation !== startGeneration || status.state !== BuilderState.STARTING) {
          return;
        }
        setState(BuilderState.READY);
        status.startedAt = new Date(now()).toISOString();
        status.lastActivityAt = status.startedAt;
        await audit('builder.started', AuditOutcome.SUCCESS, actor);
        await checkRegistry();
        return;
      } catch (error) {
        lastFailure = error;
      }
      if (now() >= deadline) {
        setState(
          BuilderState.FAILED,
          `The build service did not become ready: ${lastFailure?.message}`,
        );
        await unitControl.stop().catch(() => {});
        await audit('builder.start_failed', AuditOutcome.FAILURE, actor, {
          error: status.lastError,
        });
        await publish();
        return;
      }
      await sleep(START_POLL_MS);
    }
  }

  async function stop(actor, { isIdle = false } = {}) {
    if (activeBuild) {
      return {
        ok: false,
        message: 'A build is running. Wait for it to finish, or use Emergency Stop to cancel it.',
      };
    }
    if (status.state === BuilderState.STOPPED) {
      return { ok: true, message: 'The build service is already stopped.' };
    }
    startGeneration += 1;
    setState(BuilderState.STOPPING);
    await publish();
    try {
      await unitControl.stop();
      setState(BuilderState.STOPPED);
      status.startedAt = null;
      await audit(
        isIdle ? 'builder.idle_stopped' : 'builder.stopped',
        AuditOutcome.SUCCESS,
        actor,
        {
          ...(isIdle ? { idleMinutes: status.idleMinutes } : {}),
        },
      );
    } catch (error) {
      setState(BuilderState.FAILED, error.message);
      await audit('builder.stop_failed', AuditOutcome.FAILURE, actor, { error: status.lastError });
    }
    await publish();
    return status.state === BuilderState.STOPPED
      ? { ok: true, message: 'The build service stopped.' }
      : { ok: false, message: status.lastError };
  }

  async function emergencyStop(actor) {
    startGeneration += 1;
    const cancelledDeploymentId = cancelActiveBuild(
      'Stopped by an administrator (Emergency Stop) before the build finished.',
    );
    setState(BuilderState.STOPPING);
    await publish();
    const errors = [];
    await unitControl.kill().catch((error) => errors.push(error.message));
    await unitControl.stop().catch((error) => errors.push(error.message));
    // A unit that was never running cannot be killed; it is stopped all the same.
    const unitState = await unitControl.isActive().catch(() => 'unknown');
    const isStopped = ['inactive', 'failed'].includes(unitState);
    setState(
      isStopped ? BuilderState.STOPPED : BuilderState.FAILED,
      isStopped ? null : errors.join(' ') || `The build service is ${unitState}.`,
    );
    status.startedAt = null;
    await audit(
      'builder.emergency_stopped',
      isStopped ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      actor,
      { cancelledDeploymentId, unitState },
    );
    await publish();
    return isStopped
      ? { ok: true, message: 'The build service was stopped immediately.' }
      : { ok: false, message: status.lastError };
  }

  async function checkRegistry() {
    try {
      await verifyRegistry();
      status.registry = { ok: true, checkedAt: new Date(now()).toISOString(), error: null };
    } catch (error) {
      status.registry = {
        ok: false,
        checkedAt: new Date(now()).toISOString(),
        error: redactLogLine(error.message).slice(0, 300),
      };
    }
    await publish();
    return status.registry.ok
      ? { ok: true, message: 'The image registry answered.' }
      : { ok: false, message: status.registry.error };
  }

  /**
   * Reserve the builder for one build. Throws BuilderUnavailableError when the
   * builder is not ready or the host lacks headroom; the deployment then fails
   * at once and the live release is untouched.
   */
  async function acquireBuild({ deploymentId, projectId, timeoutMs }) {
    if (status.state !== BuilderState.READY || activeBuild) {
      throw new BuilderUnavailableError(
        'BUILDER_OFFLINE',
        status.state === BuilderState.BUILDING
          ? 'Another build is using the build service.'
          : 'The build service is not running. A platform administrator must start it.',
      );
    }
    try {
      await verifyBuilder();
    } catch (error) {
      setState(BuilderState.FAILED, error.message);
      await publish();
      throw new BuilderUnavailableError(
        'BUILDER_OFFLINE',
        'The build service is not answering. A platform administrator must check it.',
      );
    }
    const reasons = evaluateBuilderAdmission(await readResources());
    if (reasons.length > 0) {
      throw new BuilderUnavailableError('BUILDER_INSUFFICIENT_RESOURCES', reasons.join(' '));
    }
    // An Emergency Stop may have arrived while the checks above were waiting.
    if (status.state !== BuilderState.READY || activeBuild) {
      throw new BuilderUnavailableError(
        'BUILDER_OFFLINE',
        'The build service stopped before the build could start.',
      );
    }
    activeBuild = {
      deploymentId: String(deploymentId),
      projectId: String(projectId),
      startedAt: now(),
      timeoutMs,
      controller: new AbortController(),
    };
    setState(BuilderState.BUILDING);
    monitorHandle = setRepeating(() => void monitorBuild(), BUILDER_LIMITS.monitorIntervalMs);
    await publish();
    const lease = activeBuild;
    return { signal: lease.controller.signal, release: () => releaseBuild(lease) };
  }

  async function releaseBuild(lease) {
    if (activeBuild !== lease) {
      return;
    }
    clearRepeating(monitorHandle);
    monitorHandle = null;
    activeBuild = null;
    status.lastActivityAt = new Date(now()).toISOString();
    if (status.state === BuilderState.BUILDING) {
      setState(BuilderState.READY);
    }
    await publish();
  }

  async function monitorBuild() {
    const build = activeBuild;
    // A reading that is still pending is not started again.
    if (!build || build.controller.signal.aborted || isMonitoring) {
      return;
    }
    isMonitoring = true;
    try {
      const sample = await readResources();
      status.resources = sample;
      const reasons = evaluateBuilderPressure(sample);
      if (reasons.length > 0) {
        cancelActiveBuild(`Cancelled to protect running apps: ${reasons.join(' ')}`);
        await audit('builder.build_cancelled', AuditOutcome.FAILURE, null, {
          deploymentId: build.deploymentId,
          reasons,
        });
        await publish();
        return;
      }
      const unitState = await unitControl.isActive();
      if (unitState !== 'active') {
        cancelActiveBuild(`The build service stopped during the build (${unitState}).`);
        setState(BuilderState.FAILED, `The build service is ${unitState}.`);
        await audit('builder.failed', AuditOutcome.FAILURE, null, { unitState });
        await publish();
        return;
      }
      if (now() - build.startedAt > build.timeoutMs + BUILDER_LIMITS.watchdogGraceMs) {
        cancelActiveBuild('The build ran past its time limit and the build service was stopped.');
        await unitControl.kill().catch(() => {});
        setState(BuilderState.FAILED, 'Watchdog stopped a build that ran past its time limit.');
        await audit('builder.watchdog_killed', AuditOutcome.FAILURE, null, {
          deploymentId: build.deploymentId,
        });
      }
      await publish();
    } catch (error) {
      // Without a reading the build cannot be shown to be safe.
      cancelActiveBuild(`Cancelled because host resources could not be read: ${error.message}`);
      await publish();
    } finally {
      isMonitoring = false;
    }
  }

  /** Status refresh, service health, and idle shutdown; runs on a timer. */
  async function tick() {
    status.resources = await readResources().catch(() => status.resources);
    const settings = await readSettings().catch(() => null);
    status.idleMinutes = settings?.idleMinutes ?? status.idleMinutes;
    if ([BuilderState.READY, BuilderState.BUILDING].includes(status.state)) {
      const unitState = await unitControl.isActive().catch(() => 'unknown');
      if (unitState !== 'active') {
        cancelActiveBuild(`The build service stopped during the build (${unitState}).`);
        setState(BuilderState.FAILED, `The build service is ${unitState}.`);
        await audit('builder.failed', AuditOutcome.FAILURE, null, { unitState });
      }
    }
    const idleMs = (status.idleMinutes ?? 0) * 60_000;
    if (
      status.state === BuilderState.READY &&
      !activeBuild &&
      idleMs > 0 &&
      now() - Date.parse(status.lastActivityAt) >= idleMs
    ) {
      await stop(null, { isIdle: true });
      return;
    }
    await publish();
  }

  /** After a worker restart: adopt a running service, or record it as stopped. */
  async function reconcile() {
    const unitState = await unitControl.isActive().catch(() => 'unknown');
    if (unitState === 'active') {
      try {
        await verifyBuilder();
        setState(BuilderState.READY);
        status.startedAt = new Date(now()).toISOString();
        status.lastActivityAt = status.startedAt;
      } catch (error) {
        setState(BuilderState.FAILED, error.message);
      }
    } else {
      setState(BuilderState.STOPPED);
    }
    await tick();
  }

  /**
   * Process one builder-control queue job. The requester's current role is read
   * from the database, so a queued request from a demoted or forged session
   * does nothing.
   */
  async function handleControlJob(data) {
    const actor = parseActor(data);
    actor.actorRole = await loadActorRole(actor.actorId);
    const isSuperAdmin = actor.actorRole === PlatformRole.SUPER_ADMIN;
    const isAdmin = isSuperAdmin || actor.actorRole === PlatformRole.ADMIN;
    const isLifecycleAction = [
      BuilderControlAction.START,
      BuilderControlAction.STOP,
      BuilderControlAction.EMERGENCY_STOP,
    ].includes(data.action);
    if ((isLifecycleAction && !isSuperAdmin) || !isAdmin) {
      await audit('builder.control_refused', AuditOutcome.DENIED, actor, {
        action: String(data.action).slice(0, 40),
      });
      return {
        ok: false,
        message: 'Only a super administrator can start or stop the build service.',
      };
    }
    switch (data.action) {
      case BuilderControlAction.START:
        return start(actor);
      case BuilderControlAction.STOP:
        return stop(actor);
      case BuilderControlAction.EMERGENCY_STOP:
        return emergencyStop(actor);
      case BuilderControlAction.CHECK_REGISTRY:
        return checkRegistry();
      default:
        throw new Error(`Unknown builder control action: ${String(data?.action).slice(0, 40)}`);
    }
  }

  return {
    acquireBuild,
    handleControlJob,
    reconcile,
    tick,
    getSnapshot: snapshot,
    isReady: () => status.state === BuilderState.READY,
    whenStartSettles: () => pendingStart,
  };
}

function parseActor(data) {
  if (!OBJECT_ID_PATTERN.test(data?.actorId ?? '')) {
    throw new Error('Builder control jobs must name the administrator who requested them.');
  }
  return { actorId: data.actorId, actorRole: null };
}
