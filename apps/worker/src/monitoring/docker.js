import { spawn } from 'node:child_process';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export class DockerReadError extends Error {
  constructor(message) {
    super(message);
    this.code = 'DOCKER_READ_FAILED';
  }
}

/**
 * Run a read-only docker command with a hard timeout and output cap. The
 * collector shares the host with hosted apps, so a hung daemon call must
 * never pile up processes or memory.
 */
export function runDockerRead(args, { timeoutMs = 10_000, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawnFn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      finish(new DockerReadError(`docker ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) {
        proc.kill('SIGKILL');
        finish(new DockerReadError(`docker ${args[0]} output exceeded the cap`));
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.resume();
    proc.on('error', (error) =>
      finish(new DockerReadError(`docker spawn failed: ${error.message}`)),
    );
    proc.on('close', (code) => {
      if (code === 0) {
        finish(null, Buffer.concat(chunks).toString('utf8'));
      } else {
        finish(new DockerReadError(`docker ${args[0]} exited ${code}`));
      }
    });
  });
}

const SIZE_UNITS = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
};

/** "112.5MiB", "1.57GB", "0B" → bytes; null when unparseable. */
export function parseDockerSize(text) {
  const match = /^\s*([\d.]+)\s*([a-zA-Z]+)\s*$/.exec(String(text ?? ''));
  if (!match) {
    return null;
  }
  const factor = SIZE_UNITS[match[2].toLowerCase()];
  const value = Number(match[1]);
  return factor && Number.isFinite(value) ? Math.round(value * factor) : null;
}

function parsePair(text) {
  const [left, right] = String(text ?? '').split('/');
  return [parseDockerSize(left), parseDockerSize(right)];
}

function parsePercent(text) {
  const value = Number(
    String(text ?? '')
      .replace('%', '')
      .trim(),
  );
  return Number.isFinite(value) && String(text ?? '').trim() !== '--' ? value : null;
}

/** `docker stats --no-stream --no-trunc --format '{{json .}}'` → rows by full container id. */
export function parseDockerStats(output) {
  const rows = new Map();
  for (const line of String(output ?? '').split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const [memoryBytes, memoryLimitBytes] = parsePair(row.MemUsage);
    const [netRxBytes, netTxBytes] = parsePair(row.NetIO);
    const [blockReadBytes, blockWriteBytes] = parsePair(row.BlockIO);
    const pids = Number(row.PIDs);
    rows.set(row.ID, {
      // Docker reports CPU relative to one core: 200% is two cores busy.
      cpuPercentOfCore: parsePercent(row.CPUPerc),
      memoryBytes,
      memoryLimitBytes,
      netRxBytes,
      netTxBytes,
      blockReadBytes,
      blockWriteBytes,
      pids: Number.isFinite(pids) ? pids : null,
    });
  }
  return rows;
}

export const INSPECT_FORMAT =
  '{"id":{{json .Id}},"name":{{json .Name}},"state":{{json .State}},"restartCount":{{.RestartCount}},"memory":{{.HostConfig.Memory}},"nanoCpus":{{.HostConfig.NanoCpus}},"labels":{{json .Config.Labels}}}';

/**
 * One line per container from `docker inspect --format INSPECT_FORMAT`.
 * Only state, limits and HelloDeploy labels are kept: environment, command
 * lines and mounts never leave this function.
 */
export function parseDockerInspect(output) {
  const rows = [];
  for (const line of String(output ?? '').split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const labels = row.labels ?? {};
    const startedAt = new Date(row.state?.StartedAt);
    rows.push({
      id: row.id,
      name: String(row.name ?? '').replace(/^\//, ''),
      status: row.state?.Status ?? 'unknown',
      running: Boolean(row.state?.Running),
      restarting: Boolean(row.state?.Restarting),
      oomKilled: Boolean(row.state?.OOMKilled),
      exitCode: Number.isInteger(row.state?.ExitCode) ? row.state.ExitCode : null,
      dockerHealth: row.state?.Health?.Status ?? null,
      startedAt: startedAt.getTime() > 0 ? startedAt.toISOString() : null,
      restartCount: Number.isInteger(row.restartCount) ? row.restartCount : null,
      // 0 means Docker enforces no limit.
      memoryLimitBytes: row.memory > 0 ? row.memory : null,
      cpuLimitCores: row.nanoCpus > 0 ? row.nanoCpus / 1e9 : null,
      managed: labels['hellodeploy.managed'] === 'true',
      projectId: labels['hellodeploy.project'] ?? null,
      deploymentId: labels['hellodeploy.deployment'] ?? null,
    });
  }
  return rows;
}

/** `docker system df --format '{{json .}}'` → bytes per type. */
export function parseDockerDiskUsage(output) {
  const usage = {};
  for (const line of String(output ?? '').split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const row = JSON.parse(line);
      const key = {
        Images: 'images',
        Containers: 'containers',
        'Local Volumes': 'volumes',
        'Build Cache': 'buildCache',
      }[row.Type];
      if (key) {
        usage[key] = {
          sizeBytes: parseDockerSize(row.Size),
          reclaimableBytes: parseDockerSize(String(row.Reclaimable ?? '').split(' ')[0]),
        };
      }
    } catch {
      // A malformed line drops only that type; the rest stays usable.
    }
  }
  return usage;
}

export async function listContainerIds(deps = {}) {
  const run = deps.runDockerRead ?? runDockerRead;
  const output = await run(['ps', '-a', '-q', '--no-trunc']);
  return output
    .split('\n')
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function inspectContainers(ids, deps = {}) {
  if (ids.length === 0) {
    return [];
  }
  const run = deps.runDockerRead ?? runDockerRead;
  return parseDockerInspect(await run(['inspect', '--format', INSPECT_FORMAT, ...ids]));
}

export async function readContainerStats(deps = {}) {
  const run = deps.runDockerRead ?? runDockerRead;
  return parseDockerStats(
    await run(['stats', '--no-stream', '--no-trunc', '--format', '{{json .}}'], {
      timeoutMs: 12_000,
    }),
  );
}

export async function readDockerDiskUsage(deps = {}) {
  const run = deps.runDockerRead ?? runDockerRead;
  return parseDockerDiskUsage(
    await run(['system', 'df', '--format', '{{json .}}'], { timeoutMs: 30_000 }),
  );
}
