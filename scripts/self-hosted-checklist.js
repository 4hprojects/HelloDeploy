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
  const resolvedMode = Object.hasOwn(INSTALL_MODES, mode) ? mode : 'cloudflare_tunnel';
  const selected = INSTALL_MODES[resolvedMode];
  return {
    mode: resolvedMode,
    label: selected.label,
    summary: selected.summary,
    domain,
    license: 'MIT',
    supportedUbuntu: ['22.04', '24.04'],
    startupBlockingEnvironment: [
      'NODE_ENV',
      'MONGODB_URI',
      'REDIS_URL (rediss:// for managed Redis) or local REDIS_HOST/REDIS_PORT',
      'SESSION_SECRET',
      'HELLODEPLOY_MASTER_KEY',
      'NGINX_ENABLED',
    ],
    integrationEnvironment: [
      {
        name: 'GitHub App (required for repository connection and deployments)',
        keys: [
          'GITHUB_APP_ID',
          'GITHUB_APP_NAME',
          'GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_APP_PRIVATE_KEY',
          'GITHUB_WEBHOOK_SECRET',
        ],
      },
      {
        name: 'Cloudflare Turnstile (optional; both keys or neither)',
        keys: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
      },
      {
        name: 'Resend email (optional)',
        keys: ['RESEND_API_KEY', 'EMAIL_FROM'],
      },
    ],
    prerequisites: selected.requires,
    dns: selected.dns,
    steps: [
      'Run node scripts/preflight.js on the target Ubuntu host.',
      'Set HELLODEPLOY_RELEASE_REF to a reviewed immutable tag or commit, then run sudo bash infrastructure/install.sh or follow the manual install guide.',
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
    '## Startup-Blocking Environment Keys',
    ...checklist.startupBlockingEnvironment.map((item) => `- \`${item}\``),
    '',
    'Defaults exist for other runtime settings. Review them before production use.',
    '',
    '## Integration Environment Groups',
    ...checklist.integrationEnvironment.flatMap((group) => [
      `### ${group.name}`,
      ...group.keys.map((item) => `- \`${item}\``),
      '',
    ]),
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
