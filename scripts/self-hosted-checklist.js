#!/usr/bin/env node

const INSTALL_MODES = Object.freeze({
  local: {
    label: 'Local-only',
    summary: 'Use localhost or a LAN hostname without public ingress.',
    requires: ['MongoDB', 'Redis', 'Docker', 'Nginx optional for local reverse proxy'],
    dns: ['No public DNS required.'],
  },
  public_ip: {
    label: 'Public IP',
    summary: 'Expose Nginx directly on a server with public DNS records.',
    requires: [
      'MongoDB',
      'Redis',
      'Docker',
      'Nginx',
      'Public DNS A/AAAA records',
      'TLS automation',
    ],
    dns: [
      'Point platform domain to the server public IP.',
      'Point wildcard app domain to the server public IP.',
    ],
  },
  cloudflare_tunnel: {
    label: 'Cloudflare Tunnel',
    summary: 'Expose Nginx through Cloudflare Tunnel without opening inbound router ports.',
    requires: ['MongoDB', 'Redis', 'Docker', 'Nginx', 'Cloudflare Tunnel', 'Cloudflare DNS'],
    dns: [
      'Route platform hostname through the tunnel.',
      'Route wildcard app hostname through the tunnel.',
    ],
  },
});

export function buildSelfHostedChecklist({
  mode = 'cloudflare_tunnel',
  domain = 'hellodeploy.example.com',
} = {}) {
  const selected = INSTALL_MODES[mode] ?? INSTALL_MODES.cloudflare_tunnel;
  return {
    mode,
    label: selected.label,
    summary: selected.summary,
    domain,
    license: 'MIT',
    supportedUbuntu: ['22.04', '24.04'],
    requiredEnvironment: [
      'NODE_ENV',
      'PORT',
      'HOST',
      'PLATFORM_DOMAIN',
      'MONGODB_URI',
      'REDIS_HOST',
      'REDIS_PORT',
      'SESSION_SECRET',
      'HELLODEPLOY_MASTER_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_APP_ID',
      'GITHUB_APP_NAME',
      'GITHUB_APP_PRIVATE_KEY_PATH',
      'RESEND_API_KEY',
      'TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'BUILD_WORKSPACE_ROOT',
      'RELEASE_METADATA_ROOT',
      'PROJECT_VOLUME_ROOT',
      'NGINX_HELLODEPLOY_CONFIG_DIR',
      'NGINX_ENABLED',
      'WORKER_CONCURRENCY',
    ],
    prerequisites: selected.requires,
    dns: selected.dns,
    steps: [
      'Run node scripts/preflight.js on the target Ubuntu host.',
      'Run sudo bash infrastructure/install.sh or follow the manual install guide.',
      'Run node scripts/setup.js to create the production .env.',
      'Back up HELLODEPLOY_MASTER_KEY outside the server.',
      'Run node scripts/seed-super-admin.js once.',
      'Start the systemd web, worker, and Nginx helper services.',
      'Confirm systemd service status, /health, and /admin/server.',
      'Run infrastructure/backup.sh and test restore on a second machine before production use.',
    ],
  };
}

function renderMarkdown(checklist) {
  return [
    `# HelloDeploy Self-Hosted Checklist: ${checklist.label}`,
    '',
    checklist.summary,
    '',
    `- Domain: \`${checklist.domain}\``,
    `- License: ${checklist.license}`,
    `- Ubuntu support: ${checklist.supportedUbuntu.join(', ')}`,
    '',
    '## Prerequisites',
    ...checklist.prerequisites.map((item) => `- ${item}`),
    '',
    '## DNS',
    ...checklist.dns.map((item) => `- ${item}`),
    '',
    '## Required Environment Keys',
    ...checklist.requiredEnvironment.map((item) => `- \`${item}\``),
    '',
    '## Install Steps',
    ...checklist.steps.map((item, index) => `${index + 1}. ${item}`),
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { mode: 'cloudflare_tunnel', domain: 'hellodeploy.example.com', json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') {
      args.mode = argv[++i];
    } else if (argv[i] === '--domain') {
      args.domain = argv[++i];
    } else if (argv[i] === '--json') {
      args.json = true;
    } else if (argv[i] === '--help') {
      args.help = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node scripts/self-hosted-checklist.js [--mode local|public_ip|cloudflare_tunnel] [--domain example.com] [--json]\n',
    );
    return;
  }

  const checklist = buildSelfHostedChecklist(args);
  process.stdout.write(
    args.json ? `${JSON.stringify(checklist, null, 2)}\n` : renderMarkdown(checklist),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
