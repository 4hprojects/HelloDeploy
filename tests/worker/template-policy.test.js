import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ImageTemplateVersion,
  parseImageTemplateVersion,
  parseOptimizedProjectIds,
  resolveImageTemplateVersion,
} from '../../apps/worker/src/deployment/template-policy.js';

describe('user image template policy', () => {
  it('accepts only the supported template versions', () => {
    assert.equal(parseImageTemplateVersion('legacy'), ImageTemplateVersion.LEGACY);
    assert.equal(parseImageTemplateVersion('optimized-v1'), ImageTemplateVersion.OPTIMIZED_V1);
    assert.throws(() => parseImageTemplateVersion('latest'), /USER_IMAGE_TEMPLATE_VERSION/);
  });

  it('parses, deduplicates, and normalizes the canary project allowlist', () => {
    assert.deepEqual(
      parseOptimizedProjectIds(
        'ABCDEFABCDEFABCDEFABCDEF, abcdefabcdefabcdefabcdef, 0123456789abcdef01234567',
      ),
      ['abcdefabcdefabcdefabcdef', '0123456789abcdef01234567'],
    );
  });

  it('rejects malformed project identifiers', () => {
    assert.throws(
      () => parseOptimizedProjectIds('not-an-object-id'),
      /USER_IMAGE_OPTIMIZED_PROJECT_IDS/,
    );
  });

  it('selects optimized-v1 only for an allowlisted project when legacy is default', () => {
    const projectId = '0123456789abcdef01234567';
    assert.equal(
      resolveImageTemplateVersion({
        defaultVersion: ImageTemplateVersion.LEGACY,
        optimizedProjectIds: [projectId],
        projectId,
      }),
      ImageTemplateVersion.OPTIMIZED_V1,
    );
    assert.equal(
      resolveImageTemplateVersion({
        defaultVersion: ImageTemplateVersion.LEGACY,
        optimizedProjectIds: [],
        projectId,
      }),
      ImageTemplateVersion.LEGACY,
    );
  });
});
