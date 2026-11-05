#!/usr/bin/env node
/**
 * Measure what the admin operations collector costs on this host. Runs real
 * collection cycles (read-only: /proc, statfs, docker ps/inspect/stats,
 * systemctl show) without Redis or Mongo writes and reports per-cycle wall
 * time, this process's CPU and memory, and the CPU Docker itself spent
 * answering, read from the docker and containerd cgroups.
 *
 * Usage: node scripts/measure-monitoring-overhead.js [--cycles 8] [--interval 15] [--json]
 */
import { spawnSync } from 'node:child_process';
import { cpus } from 'node:os';

import { createMonitoringCollector } from '../apps/worker/src/monitoring/collector.js';
import { readDockerDiskUsage } from '../apps/worker/src/monitoring/docker.js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const cycles = option('cycles', 8);
const intervalSeconds = option('interval', 15);
const asJson = args.includes('--json');

function unitCpuNs(unit) {
  const result = spawnSync('systemctl', ['show', '--property=CPUUsageNSec', '--value', unit], {
    encoding: 'utf8',
  });
  const value = Number(result.stdout?.trim());
  return Number.isFinite(value) ? value : null;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const collector = createMonitoringCollector({
  redis: null,
  logger: {
    info() {},
    warn: (msg, meta) => process.stderr.write(`${msg} ${JSON.stringify(meta)}\n`),
    error() {},
  },
  workspacePath: process.env.BUILD_WORKSPACE_ROOT ?? '/var/lib/hellodeploy/builds',
  deps: {
    loadRecords: async () => ({ projects: [], deployments: [] }),
    // Measure the default policy, but leave the slow background df out of the
    // per-cycle numbers; it is measured once separately below.
    loadPolicy: async () => ({ collectors: { dockerDiskUsage: false } }),
  },
});

const rssStart = process.memoryUsage().rss;
const dockerStart = (unitCpuNs('docker.service') ?? 0) + (unitCpuNs('containerd.service') ?? 0);
const durations = [];
const cpuPerCycleMs = [];
const startedAt = Date.now();
for (let i = 0; i < cycles; i += 1) {
  const cpuBefore = process.cpuUsage();
  const t0 = performance.now();
  await collector.collect();
  durations.push(performance.now() - t0);
  const cpu = process.cpuUsage(cpuBefore);
  cpuPerCycleMs.push((cpu.user + cpu.system) / 1000);
  if (i < cycles - 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000 - durations.at(-1)));
  }
}
const elapsedSeconds = (Date.now() - startedAt) / 1000;
const dockerEnd = (unitCpuNs('docker.service') ?? 0) + (unitCpuNs('containerd.service') ?? 0);
const cores = cpus().length;

const dfStart = performance.now();
const dfOk = await readDockerDiskUsage().then(
  () => true,
  () => false,
);
const dfWallMs = Math.round(performance.now() - dfStart);

const ownCpuMs = cpuPerCycleMs.reduce((a, b) => a + b, 0);
const report = {
  host: { cores },
  cycles,
  intervalSeconds,
  cycleWallMs: {
    p50: Math.round(percentile(durations, 50)),
    p95: Math.round(percentile(durations, 95)),
  },
  collectorCpuMsPerCycle: Math.round(ownCpuMs / cycles),
  collectorCpuPercentOfHost: Math.round((ownCpuMs / 1000 / (elapsedSeconds * cores)) * 10000) / 100,
  dockerDaemonCpuPercentOfHost:
    dockerEnd && dockerStart
      ? Math.round(((dockerEnd - dockerStart) / 1e9 / (elapsedSeconds * cores)) * 10000) / 100
      : null,
  rssDeltaMiB: Math.round(((process.memoryUsage().rss - rssStart) / 1048576) * 10) / 10,
  dockerSystemDf: { ok: dfOk, wallMs: dfWallMs },
};

process.stdout.write(
  asJson ? `${JSON.stringify(report)}\n` : `${JSON.stringify(report, null, 2)}\n`,
);
