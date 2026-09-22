import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { hasDeploySkipMarker } =
  await import('../../apps/web/src/controllers/webhook.controller.js');

describe('hasDeploySkipMarker', () => {
  it('lets an ordinary commit deploy', () => {
    assert.equal(hasDeploySkipMarker('fix: correct the retry bound'), false);
  });

  it('honours [skip deploy]', () => {
    assert.equal(hasDeploySkipMarker('docs: fix a typo [skip deploy]'), true);
  });

  it('honours [skip hellodeploy]', () => {
    assert.equal(hasDeploySkipMarker('chore: tidy comments [skip hellodeploy]'), true);
  });

  it('honours the reversed [hellodeploy skip]', () => {
    assert.equal(hasDeploySkipMarker('chore: tidy [hellodeploy skip]'), true);
  });

  it('ignores case, since commit style varies', () => {
    assert.equal(hasDeploySkipMarker('docs: note [Skip Deploy]'), true);
  });

  it('matches a marker placed at the start of the message', () => {
    assert.equal(hasDeploySkipMarker('[skip deploy] docs: reword the FAQ'), true);
  });

  it('treats an absent commit message as deployable rather than throwing', () => {
    assert.equal(hasDeploySkipMarker(null), false);
  });

  it('does not match a bare mention of skipping', () => {
    assert.equal(hasDeploySkipMarker('refactor: skip empty rows when parsing'), false);
  });
});
