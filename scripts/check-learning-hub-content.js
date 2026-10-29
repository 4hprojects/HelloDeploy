#!/usr/bin/env node

import { createContentRepository } from '../apps/web/src/services/learning-hub/content-repository.js';

const repository = createContentRepository();
if (repository.errors.length > 0) {
  process.stderr.write(`${repository.errors.join('\n')}\n`);
  process.stderr.write(
    `Learning Hub content check failed with ${repository.errors.length} error(s).\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Learning Hub content verified: ${repository.listPublished().length} published article(s).\n`,
);
