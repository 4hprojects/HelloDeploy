#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? findTests(path) : [path];
    })
    .filter((path) => path.endsWith('.test.js'))
    .sort();
}

const watch = process.argv.includes('--watch');
const testFiles = findTests('tests');

if (testFiles.length === 0) {
  process.stderr.write('No test files found under tests/.\n');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--test', ...(watch ? ['--watch'] : []), ...testFiles],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  },
);

if (result.error) {
  process.stderr.write(`Unable to start the Node.js test runner: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
