import { spawn } from 'node:child_process';

/**
 * Platform units whose state and cgroup usage the overview shows. Reading
 * them needs no privilege: `systemctl show` answers any local user.
 */
export const PLATFORM_UNITS = Object.freeze([
  { unit: 'hellodeploy-web.service', key: 'web', label: 'Web' },
  { unit: 'hellodeploy-worker.service', key: 'worker', label: 'Deployment worker' },
  { unit: 'hellodeploy-nginx-helper.service', key: 'nginxHelper', label: 'Nginx route helper' },
  { unit: 'nginx.service', key: 'nginx', label: 'Nginx' },
  { unit: 'redis-server.service', key: 'redis', label: 'Redis' },
  { unit: 'docker.service', key: 'docker', label: 'Docker' },
  { unit: 'cloudflared-hellodeploy.service', key: 'tunnel', label: 'Cloudflare tunnel (platform)' },
  { unit: 'cloudflared.service', key: 'tunnelApps', label: 'Cloudflare tunnel (apps)' },
]);

const PROPERTIES = 'Id,LoadState,ActiveState,SubState,MemoryCurrent,CPUUsageNSec,NRestarts';

export function parseSystemctlShow(output) {
  const units = new Map();
  for (const block of String(output ?? '').split(/\n\s*\n/)) {
    const values = {};
    for (const line of block.split('\n')) {
      const index = line.indexOf('=');
      if (index > 0) {
        values[line.slice(0, index)] = line.slice(index + 1);
      }
    }
    if (!values.Id) {
      continue;
    }
    const memory = Number(values.MemoryCurrent);
    const cpu = Number(values.CPUUsageNSec);
    const restarts = Number(values.NRestarts);
    units.set(values.Id, {
      loaded: values.LoadState === 'loaded',
      activeState: values.ActiveState ?? 'unknown',
      subState: values.SubState ?? 'unknown',
      memoryBytes: Number.isFinite(memory) ? memory : null,
      cpuUsageNs: Number.isFinite(cpu) ? cpu : null,
      restarts: Number.isFinite(restarts) ? restarts : null,
    });
  }
  return units;
}

export function readUnits(units = PLATFORM_UNITS, { spawnFn = spawn, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawnFn(
      'systemctl',
      ['show', `--property=${PROPERTIES}`, ...units.map((entry) => entry.unit)],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const chunks = [];
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('systemctl show timed out'));
    }, timeoutMs);
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(parseSystemctlShow(Buffer.concat(chunks).toString('utf8')));
      } else {
        reject(new Error(`systemctl show exited ${code}`));
      }
    });
  });
}

/**
 * CPU share of the whole host each unit used between two readings, from the
 * cgroup's cumulative CPU nanoseconds.
 */
export function computeUnitCpu(previous, current, seconds, cores) {
  if (!previous || !current || !(seconds > 0) || !(cores > 0)) {
    return null;
  }
  const delta = current.cpuUsageNs - previous.cpuUsageNs;
  if (!Number.isFinite(delta) || delta < 0) {
    return null;
  }
  return Math.round((delta / (seconds * 1e9 * cores)) * 1000) / 10;
}
