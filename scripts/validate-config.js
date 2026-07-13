#!/usr/bin/env node

const json = process.argv.includes('--json');
const requireProduction = process.argv.includes('--require-production');
const componentFlag = process.argv.indexOf('--component');
const selectedComponent = componentFlag >= 0 ? process.argv[componentFlag + 1] : null;
const results = [];

function groupStatus(fields) {
  const present = fields.filter(Boolean).length;
  if (present === 0) {
    return 'disabled';
  }
  if (present === fields.length) {
    return 'configured';
  }
  return 'incomplete';
}

function componentChecks(component, config) {
  const common = [
    {
      name: 'runtime',
      status: process.env.NODE_ENV === 'production' ? 'production' : 'non-production',
    },
    { name: 'mongodb', status: process.env.MONGODB_URI ? 'configured' : 'default' },
    { name: 'redis', status: config.REDIS_MODE },
    {
      name: 'encryption',
      status: process.env.HELLODEPLOY_MASTER_KEY ? 'configured' : 'development-default',
    },
  ];

  if (component === 'web') {
    return [
      ...common,
      {
        name: 'session',
        status: process.env.SESSION_SECRET ? 'configured' : 'development-default',
      },
      {
        name: 'github-app',
        status: groupStatus([
          process.env.GITHUB_APP_ID,
          process.env.GITHUB_APP_NAME,
          process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY,
          process.env.GITHUB_WEBHOOK_SECRET,
        ]),
      },
      {
        name: 'turnstile',
        status: groupStatus([process.env.TURNSTILE_SITE_KEY, process.env.TURNSTILE_SECRET_KEY]),
      },
      { name: 'email', status: process.env.RESEND_API_KEY ? 'configured' : 'disabled' },
    ];
  }

  return [
    ...common,
    {
      name: 'routing',
      status: process.env.NGINX_ENABLED === 'true' ? 'local-nginx-helper' : 'external-router',
    },
    {
      name: 'github-app',
      status: groupStatus([
        process.env.GITHUB_APP_ID,
        process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY,
      ]),
    },
    { name: 'email', status: process.env.RESEND_API_KEY ? 'configured' : 'disabled' },
  ];
}

const components = [
  ['web', '../apps/web/src/config/env.js'],
  ['worker', '../apps/worker/src/config/env.js'],
].filter(([component]) => !selectedComponent || component === selectedComponent);

if (components.length === 0) {
  process.stderr.write('Component must be "web" or "worker".\n');
  process.exit(1);
}

for (const [component, modulePath] of components) {
  try {
    const { env: config } = await import(modulePath);
    if (requireProduction && process.env.NODE_ENV !== 'production') {
      results.push({
        component,
        ok: false,
        error: 'NODE_ENV must be production for this validation.',
      });
      continue;
    }
    results.push({ component, ok: true, checks: componentChecks(component, config) });
  } catch (err) {
    results.push({ component, ok: false, error: err.message });
  }
}

if (json) {
  process.stdout.write(
    `${JSON.stringify({ ok: results.every((result) => result.ok), results })}\n`,
  );
} else {
  process.stdout.write('HelloDeploy configuration validation\n');
  for (const result of results) {
    if (!result.ok) {
      process.stdout.write(`  ✗ ${result.component}: ${result.error}\n`);
      continue;
    }
    process.stdout.write(`  ✓ ${result.component}: valid\n`);
    for (const check of result.checks) {
      process.stdout.write(`      ${check.name}: ${check.status}\n`);
    }
  }
}

process.exit(results.every((result) => result.ok) ? 0 : 1);
