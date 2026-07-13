#!/usr/bin/env node
/**
 * Capture a sanitized, read-only host baseline before in-place productionization.
 * This command never prints environment values, hostnames, addresses, credentials,
 * process command lines, tunnel identifiers, or configuration file contents.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { classifyUbuntuRelease } from './lib/ubuntu-support.js';

const args = process.argv.slice(2);
let jsonOutput = false;
let webPortRaw = '3000';
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--json') {
    jsonOutput = true;
    continue;
  }
  if (arg === '--web-port' && args[index + 1]) {
    webPortRaw = args[index + 1];
    index += 1;
    continue;
  }
  process.stderr.write(`Unknown or incomplete baseline argument: ${arg}\n`);
  process.exit(2);
}

const webPort = Number(webPortRaw);
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
  process.stderr.write('Baseline web port must be an integer from 1 to 65535.\n');
  process.exit(2);
}

function run(command, commandArgs = []) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
  };
}

function commandExists(command) {
  return run('which', [command]).ok;
}

function serviceActive(service) {
  return run('systemctl', ['is-active', '--quiet', service]).ok;
}

function userExists(user) {
  return run('id', ['-u', user]).ok;
}

async function httpStatus(path) {
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2500),
    });
    return response.status;
  } catch {
    return 0;
  }
}

function readTunnelShape() {
  const configPath = '/etc/cloudflared/hellodeploy.yml';
  if (!existsSync(configPath)) {
    return { configured: false, dashboardRoute: false, wildcardRoute: false };
  }
  try {
    const source = readFileSync(configPath, 'utf8');
    const hostnames = [...source.matchAll(/^\s*-?\s*hostname:\s*(\S+)\s*$/gm)].map(
      (match) => match[1],
    );
    return {
      configured: true,
      dashboardRoute: hostnames.some((hostname) => !hostname.startsWith('*.')),
      wildcardRoute: hostnames.some((hostname) => hostname.startsWith('*.')),
    };
  } catch {
    return { configured: true, dashboardRoute: false, wildcardRoute: false };
  }
}

const osRelease = existsSync('/etc/os-release') ? readFileSync('/etc/os-release', 'utf8') : '';
const platform = classifyUbuntuRelease(osRelease);
const commitResult = run('git', ['rev-parse', '--verify', 'HEAD']);
const statusResult = run('git', ['status', '--porcelain']);
const tunnel = readTunnelShape();
const healthStatus = await httpStatus('/health');
const readinessStatus = await httpStatus('/ready');

const baseline = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  platform: {
    id: platform.id || 'unknown',
    version: platform.version || 'unknown',
    tier: platform.tier,
  },
  release: {
    commit: commitResult.ok ? commitResult.stdout : null,
    clean: statusResult.ok && statusResult.stdout === '',
  },
  prerequisites: {
    node: commandExists('node'),
    npm: commandExists('npm'),
    dockerCli: commandExists('docker'),
    dockerSocket: existsSync('/var/run/docker.sock'),
    nginx: commandExists('nginx'),
    redisCli: commandExists('redis-cli'),
    systemd: commandExists('systemctl'),
    cloudflared: commandExists('cloudflared'),
  },
  services: {
    nginx: serviceActive('nginx'),
    redis: serviceActive('redis-server'),
    cloudflared: serviceActive('cloudflared'),
    web: serviceActive('hellodeploy-web'),
    worker: serviceActive('hellodeploy-worker'),
    nginxHelper: serviceActive('hellodeploy-nginx-helper'),
  },
  identities: {
    web: userExists('hellodeploy-web'),
    worker: userExists('hellodeploy-worker'),
  },
  routing: {
    tunnelConfigured: tunnel.configured,
    dashboardTunnelRoute: tunnel.dashboardRoute,
    wildcardTunnelRoute: tunnel.wildcardRoute,
    helperSocket: existsSync('/run/hellodeploy/nginx-helper.sock'),
    managedRouteDirectory: existsSync('/etc/nginx/hellodeploy.d'),
  },
  health: {
    livenessHttpStatus: healthStatus,
    readinessHttpStatus: readinessStatus,
  },
};

const blockers = [];
if (baseline.platform.tier === 'candidate') {
  blockers.push('OS_CANDIDATE');
}
if (baseline.platform.tier === 'unsupported') {
  blockers.push('OS_UNSUPPORTED');
}
if (!baseline.release.commit) {
  blockers.push('RELEASE_UNKNOWN');
}
if (!baseline.release.clean) {
  blockers.push('RELEASE_DIRTY');
}
if (!baseline.prerequisites.dockerCli) {
  blockers.push('DOCKER_CLI_MISSING');
}
if (!baseline.prerequisites.dockerSocket) {
  blockers.push('DOCKER_SOCKET_MISSING');
}
if (!baseline.identities.web || !baseline.identities.worker) {
  blockers.push('SERVICE_IDENTITIES_MISSING');
}
if (!baseline.services.web || !baseline.services.worker || !baseline.services.nginxHelper) {
  blockers.push('HELLODEPLOY_UNITS_INACTIVE');
}
if (!baseline.routing.helperSocket) {
  blockers.push('HELPER_SOCKET_MISSING');
}
if (!baseline.routing.managedRouteDirectory) {
  blockers.push('ROUTE_DIRECTORY_MISSING');
}
if (!baseline.routing.wildcardTunnelRoute) {
  blockers.push('WILDCARD_INGRESS_MISSING');
}
if (healthStatus !== 200) {
  blockers.push('LIVENESS_FAILED');
}
if (readinessStatus !== 200) {
  blockers.push('READINESS_FAILED');
}
baseline.blockers = blockers;

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
} else {
  process.stdout.write('HelloDeploy sanitized host baseline\n');
  process.stdout.write(`Platform tier: ${baseline.platform.tier}\n`);
  process.stdout.write(`Release clean: ${baseline.release.clean}\n`);
  process.stdout.write(`Liveness HTTP status: ${healthStatus}\n`);
  process.stdout.write(`Readiness HTTP status: ${readinessStatus}\n`);
  process.stdout.write(`Blockers: ${blockers.length === 0 ? 'none' : blockers.join(', ')}\n`);
}

process.exit(blockers.length === 0 ? 0 : 1);
