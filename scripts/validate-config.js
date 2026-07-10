#!/usr/bin/env node

const json = process.argv.includes('--json');
const componentFlag = process.argv.indexOf('--component');
const selectedComponent = componentFlag >= 0 ? process.argv[componentFlag + 1] : null;
const results = [];

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
    await import(modulePath);
    results.push({ component, ok: true });
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
    process.stdout.write(
      result.ok ? `  ✓ ${result.component}: valid\n` : `  ✗ ${result.component}: ${result.error}\n`,
    );
  }
}

process.exit(results.every((result) => result.ok) ? 0 : 1);
