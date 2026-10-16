#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORED_TEST_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'out']);

export function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return IGNORED_TEST_DIRECTORIES.has(entry.name) ? [] : findTests(path);
      }
      return [path];
    })
    .filter((path) => path.endsWith('.test.js'))
    .sort();
}

function main() {
  const watch = process.argv.includes('--watch');
  const coverage = process.argv.includes('--coverage');
  const testFiles = findTests('tests');

  if (testFiles.length === 0) {
    process.stderr.write('No test files found under tests/.\n');
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [
      '--test',
      ...(watch ? ['--watch'] : []),
      ...(coverage ? ['--experimental-test-coverage'] : []),
      ...testFiles,
    ],
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
