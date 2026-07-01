#!/usr/bin/env node
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import { statfsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

function parseArgs(argv) {
  const args = {
    url: null,
    requests: 20,
    concurrency: 2,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') {
      args.url = argv[++i];
    } else if (arg === '--requests') {
      args.requests = parseInt(argv[++i], 10);
    } else if (arg === '--concurrency') {
      args.concurrency = parseInt(argv[++i], 10);
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help') {
      args.help = true;
    }
  }

  return args;
}

export function createLoadPlan({ requests, concurrency }) {
  const safeRequests = Math.max(1, Math.min(Number.isFinite(requests) ? requests : 20, 1000));
  const safeConcurrency = Math.max(
    1,
    Math.min(Number.isFinite(concurrency) ? concurrency : 2, safeRequests, 50),
  );
  return { requests: safeRequests, concurrency: safeConcurrency };
}

export function summarizeDurations(durationsMs) {
  if (durationsMs.length === 0) {
    return null;
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return {
    minMs: Math.round(sorted[0]),
    p50Ms: Math.round(percentile(0.5)),
    p95Ms: Math.round(percentile(0.95)),
    maxMs: Math.round(sorted[sorted.length - 1]),
  };
}

function collectHostSnapshot() {
  const total = totalmem();
  const free = freemem();
  const disk = statfsSync(process.cwd());
  const diskFreeBytes = disk.bfree * disk.bsize;
  const diskTotalBytes = disk.blocks * disk.bsize;

  return {
    collectedAt: new Date().toISOString(),
    cpu: {
      cores: cpus().length,
      load1: loadavg()[0],
      load5: loadavg()[1],
      load15: loadavg()[2],
    },
    memory: {
      totalMb: Math.round(total / 1024 / 1024),
      freeMb: Math.round(free / 1024 / 1024),
      usedPercent: Math.round(((total - free) / total) * 100),
    },
    disk: {
      path: process.cwd(),
      totalGb: Number((diskTotalBytes / 1024 ** 3).toFixed(1)),
      freeGb: Number((diskFreeBytes / 1024 ** 3).toFixed(1)),
      usedPercent: Math.round(((diskTotalBytes - diskFreeBytes) / diskTotalBytes) * 100),
    },
    uptimeSeconds: Math.floor(uptime()),
  };
}

async function runHttpSample(url, plan) {
  const durations = [];
  const statuses = new Map();
  let completed = 0;
  let next = 0;
  let failures = 0;

  async function worker() {
    while (next < plan.requests) {
      next++;
      const started = performance.now();
      try {
        const response = await fetch(url, { redirect: 'manual' });
        durations.push(performance.now() - started);
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      } catch {
        failures++;
      } finally {
        completed++;
      }
    }
  }

  await Promise.all(Array.from({ length: plan.concurrency }, () => worker()));

  return {
    url,
    requests: plan.requests,
    concurrency: plan.concurrency,
    completed,
    failures,
    statuses: Object.fromEntries(statuses),
    latency: summarizeDurations(durations),
  };
}

function renderText(report) {
  const lines = [
    'HelloDeploy Capacity Measurement',
    `Collected: ${report.host.collectedAt}`,
    `CPU: ${report.host.cpu.cores} cores, load1 ${report.host.cpu.load1.toFixed(2)}`,
    `Memory: ${report.host.memory.usedPercent}% used (${report.host.memory.freeMb} MB free)`,
    `Disk: ${report.host.disk.usedPercent}% used (${report.host.disk.freeGb} GB free)`,
  ];

  if (report.http) {
    lines.push(
      `HTTP: ${report.http.completed}/${report.http.requests} completed, ${report.http.failures} failures`,
      `HTTP statuses: ${JSON.stringify(report.http.statuses)}`,
      `HTTP latency: ${JSON.stringify(report.http.latency)}`,
    );
  } else {
    lines.push('HTTP: skipped (pass --url to sample a local endpoint)');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node scripts/measure-capacity.js [--json] [--url http://127.0.0.1:3000/health] [--requests 50] [--concurrency 5]\n',
    );
    return;
  }

  const plan = createLoadPlan(args);
  const report = {
    host: collectHostSnapshot(),
    http: args.url ? await runHttpSample(args.url, plan) : null,
  };

  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}
