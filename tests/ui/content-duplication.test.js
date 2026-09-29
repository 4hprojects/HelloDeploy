import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { docsPages } from '../../apps/web/src/config/docs-pages.js';
import { learnPages } from '../../apps/web/src/config/learn-pages.js';

const docsRoot = fileURLToPath(new URL('../../apps/web/content/docs/', import.meta.url));
const learnRoot = fileURLToPath(new URL('../../apps/web/content/learn/', import.meta.url));

const pages = [];
for (const page of docsPages) {
  pages.push({ path: `/docs/${page.slug}`, text: await readFile(docsRoot + page.file, 'utf8') });
}
for (const page of learnPages) {
  pages.push({ path: page.path, text: await readFile(learnRoot + page.file, 'utf8') });
}

/**
 * Overlapping five-word phrases, ignoring code blocks and link targets.
 *
 * The content spec forbids separate pages competing for one intent. Some
 * repetition is deliberate — the PORT rule appears wherever it is relevant,
 * because it is the most common deployment failure — so this guards against
 * wholesale duplication rather than any shared sentence at all.
 */
function phrases(text) {
  const words = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const out = new Set();
  for (let i = 0; i + 5 <= words.length; i += 1) {
    out.add(words.slice(i, i + 5).join(' '));
  }
  return out;
}

const sets = pages.map((page) => ({ path: page.path, set: phrases(page.text) }));

function containment(a, b) {
  let shared = 0;
  for (const phrase of a.set) {
    if (b.set.has(phrase)) {
      shared += 1;
    }
  }
  return shared / Math.min(a.set.size, b.set.size);
}

const overlaps = [];
for (let i = 0; i < sets.length; i += 1) {
  for (let j = i + 1; j < sets.length; j += 1) {
    overlaps.push({
      pair: `${sets[i].path} ~ ${sets[j].path}`,
      value: containment(sets[i], sets[j]),
    });
  }
}

describe('content duplication', () => {
  it('has no page that largely restates another', () => {
    assert.deepEqual(
      overlaps.filter((o) => o.value > 0.3).map((o) => o.pair),
      [],
    );
  });

  it('keeps deliberate repetition within bounds', () => {
    assert.deepEqual(
      overlaps.filter((o) => o.value > 0.2).map((o) => o.pair),
      [],
    );
  });

  it('compares every documentation and learn page', () => {
    assert.equal(sets.length, docsPages.length + learnPages.length);
  });
});
