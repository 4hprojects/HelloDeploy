#!/usr/bin/env node
/**
 * HelloDeploy preflight checker.
 *
 * Verifies that the host machine meets the minimum requirements for running
 * HelloDeploy in production.  Exits 0 when all checks pass, 1 otherwise.
 *
 * Usage:
 *   node scripts/preflight.js
 *   node scripts/preflight.js --json    # machine-readable output
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statfsSync } from 'node:fs';
import os from 'node:os';

const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');

const MIN_NODE_MAJOR = 22;
const MIN_DISK_BYTES = 10 * 1024 ** 3; // 10 GB free
const MIN_RAM_BYTES = 2 * 1024 ** 3; // 2 GB total

// ─── helpers ──────────────────────────────────────────────────────────────────

const results = [];

function check(label, fn) {
  let ok = false;
  let detail = '';
  try {
    const result = fn();
    ok = result.ok;
    detail = result.detail ?? '';
  } catch (err) {
    detail = err.message;
  }
  results.push({ label, ok, detail });
  return ok;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

// ─── checks ───────────────────────────────────────────────────────────────────

check('OS: Ubuntu 22.04 or 24.04', () => {
  if (!existsSync('/etc/os-release')) {
    return { ok: false, detail: '/etc/os-release not found' };
  }
  const content = readFileSync('/etc/os-release', 'utf8');
  const id =
    content
      .match(/^ID=(.+)$/m)?.[1]
      ?.toLowerCase()
      .replace(/"/g, '') ?? '';
  const version = content.match(/^VERSION_ID="?(.+?)"?$/m)?.[1] ?? '';
  const ok = id === 'ubuntu' && (version === '22.04' || version === '24.04');
  return { ok, detail: ok ? `Ubuntu ${version}` : `Detected: ${id} ${version}` };
});

check(`Node.js >= ${MIN_NODE_MAJOR}`, () => {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  const ok = major >= MIN_NODE_MAJOR;
  return { ok, detail: `Found Node.js ${process.versions.node}` };
});

check('npm installed', () => {
  const r = run('npm', ['--version']);
  return { ok: r.ok, detail: r.ok ? `npm ${r.stdout}` : r.stderr };
});

check('Docker installed', () => {
  const r = run('docker', ['--version']);
  return { ok: r.ok, detail: r.ok ? r.stdout : 'docker not found in PATH' };
});

check('Docker daemon running', () => {
  const r = run('docker', ['info', '--format', '{{.ServerVersion}}']);
  return { ok: r.ok, detail: r.ok ? `Docker server ${r.stdout}` : 'Docker daemon not reachable' };
});

check('Nginx installed', () => {
  const r = run('nginx', ['-v']);
  const output = (r.stdout + r.stderr).trim();
  return { ok: r.ok || output.includes('nginx/'), detail: output || 'nginx not found in PATH' };
});

check('Redis installed (redis-cli)', () => {
  const r = run('redis-cli', ['--version']);
  return { ok: r.ok, detail: r.ok ? r.stdout : 'redis-cli not found in PATH' };
});

check('Redis accepting connections', () => {
  const r = run('redis-cli', ['ping']);
  const ok = r.stdout === 'PONG';
  return { ok, detail: ok ? 'PONG' : `Unexpected response: "${r.stdout || r.stderr}"` };
});

check(`Free disk space >= 10 GB`, () => {
  const stats = statfsSync('/var/lib');
  const freeBytes = stats.bfree * stats.bsize;
  const freeGb = (freeBytes / 1024 ** 3).toFixed(1);
  const ok = freeBytes >= MIN_DISK_BYTES;
  return { ok, detail: `${freeGb} GB free on /var/lib` };
});

check(`RAM >= 2 GB`, () => {
  const totalBytes = os.totalmem();
  const totalGb = (totalBytes / 1024 ** 3).toFixed(1);
  const ok = totalBytes >= MIN_RAM_BYTES;
  return { ok, detail: `${totalGb} GB total RAM` };
});

check('systemd available', () => {
  const r = run('systemctl', ['--version']);
  return {
    ok: r.ok,
    detail: r.ok ? r.stdout.split('\n')[0] : 'systemctl not found',
  };
});

// ─── output ───────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

if (JSON_OUTPUT) {
  process.stdout.write(JSON.stringify({ passed, failed, checks: results }, null, 2) + '\n');
} else {
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const YELLOW = '\x1b[33m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';

  console.log(`\n${BOLD}HelloDeploy Preflight Check${RESET}\n${'─'.repeat(50)}`);
  for (const { label, ok, detail } of results) {
    const icon = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const text = ok ? label : `${RED}${label}${RESET}`;
    const extra = detail ? `  ${YELLOW}→ ${detail}${RESET}` : '';
    console.log(`  ${icon}  ${text}${extra}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  if (failed === 0) {
    console.log(`${GREEN}${BOLD}All ${passed} checks passed. Ready to install.${RESET}\n`);
  } else {
    console.log(
      `${RED}${BOLD}${failed} check(s) failed. Resolve the issues above before installing.${RESET}\n`,
    );
  }
}

process.exit(failed > 0 ? 1 : 0);
