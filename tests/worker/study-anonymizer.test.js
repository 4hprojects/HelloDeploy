import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anonymizeLine,
  buildIdentifierReplacements,
} from '../../apps/worker/src/deployment/study-anonymizer.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
// Built at runtime so the fake credential never appears literally in source.
const FAKE_GITHUB_TOKEN = ['ghp', '_', 'x'.repeat(36)].join('');
const replacements = buildIdentifierReplacements({
  domains: ['events.example.org'],
  repoFullName: 'acme-labs/helloeventhub',
  repoOwner: 'acme-labs',
  repoName: 'helloeventhub',
  slug: 'helloeventhub',
  subdomain: 'helloeventhub',
  ownerName: 'Ada Lovelace',
  ownerEmail: 'ada@acme.test',
  commitShas: [SHA],
});

describe('study anonymizer — this deployment’s identifiers', () => {
  it('replaces the repository before its owner or name', () => {
    assert.equal(anonymizeLine('Cloning acme-labs/helloeventhub', replacements), 'Cloning [repo]');
  });

  it('replaces the project slug inside container and image names', () => {
    assert.equal(
      anonymizeLine('Started container hd-helloeventhub-12', replacements),
      'Started container hd-[project]-12',
    );
  });

  it('replaces a custom domain', () => {
    assert.equal(
      anonymizeLine('Routing events.example.org to port 10001', replacements),
      'Routing [domain] to port 10001',
    );
  });

  it('replaces the owner name', () => {
    assert.equal(anonymizeLine('Requested by Ada Lovelace', replacements), 'Requested by [owner]');
  });

  it('replaces the short form of the deployed commit', () => {
    assert.equal(
      anonymizeLine('Deploying 0123456 to production', replacements),
      'Deploying [sha] to production',
    );
  });

  it('does not replace identifiers shorter than four characters', () => {
    const short = buildIdentifierReplacements({ slug: 'app' });
    assert.equal(anonymizeLine('COPY app /app/node_modules', short), 'COPY app /app/node_modules');
  });
});

describe('study anonymizer — patterns in any log', () => {
  it('still redacts secrets first', () => {
    assert.doesNotMatch(anonymizeLine(`using ${FAKE_GITHUB_TOKEN}`), /x{36}/);
  });

  it('replaces email addresses', () => {
    assert.equal(
      anonymizeLine('npm notice contact someone@example.com'),
      'npm notice contact [email]',
    );
  });

  it('replaces private URL hosts', () => {
    assert.equal(
      anonymizeLine('GET https://api.internal-corp.example/v1 failed'),
      'GET https://[host]/v1 failed',
    );
  });

  it('keeps public registry hosts so dependency failures stay studyable', () => {
    assert.equal(
      anonymizeLine('npm ERR! 404 https://registry.npmjs.org/left-pad'),
      'npm ERR! 404 https://registry.npmjs.org/left-pad',
    );
  });

  it('replaces IPv4 addresses', () => {
    assert.equal(
      anonymizeLine('connect ECONNREFUSED 10.0.3.7:5432'),
      'connect ECONNREFUSED [ip]:5432',
    );
  });

  it('leaves clock times alone', () => {
    assert.equal(anonymizeLine('Build finished at 12:34:56'), 'Build finished at 12:34:56');
  });

  it('replaces home directory user names', () => {
    assert.equal(
      anonymizeLine('ENOENT /home/henz/project/.env'),
      'ENOENT /home/[user]/project/.env',
    );
  });

  it('replaces commit hashes, image digests, and database ids', () => {
    const line = `sha ${'a'.repeat(40)} digest ${'b'.repeat(64)} id ${'c'.repeat(24)}`;
    assert.equal(anonymizeLine(line), 'sha [sha] digest [digest] id [id]');
  });
});
