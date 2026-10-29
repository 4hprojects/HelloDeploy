import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDiscussion } from '../../apps/web/src/services/learning-hub/discussion.js';

const ARTICLE = { id: 'a1', commentsEnabled: true };
const OPEN = { submissionsPaused: false, pausedArticleIds: [], readable: true };
const EMPTY = { threads: [], totalComments: 0, page: 1, totalPages: 1 };
const hang = () => new Promise(() => {});

function discussion(overrides = {}) {
  return createDiscussion({
    featureEnabled: true,
    turnstileSiteKey: 'site',
    isTurnstileConfigured: true,
    isModerationConfigured: true,
    getSettings: async () => OPEN,
    listThreads: async () => EMPTY,
    findComment: async () => null,
    timeoutMs: 30,
    ...overrides,
  });
}

describe('Learning Hub discussion loading', () => {
  it('closes submissions when the settings read hangs', async () => {
    const availability = await discussion({ getSettings: hang }).getAvailability(ARTICLE);
    assert.equal(availability.accepting, false);
  });

  it('reports the discussion unavailable when the comment store hangs', async () => {
    const state = await discussion({ listThreads: hang }).load(ARTICLE);
    assert.equal(state.unavailable, true);
  });

  it('finds a reply target that is not on the loaded page', async () => {
    const target = { id: '0123456789abcdef01234567', displayName: 'Ana' };
    const state = await discussion({ findComment: async () => target }).load(ARTICLE, {
      replyTo: target.id,
    });
    assert.equal(state.replyTarget.displayName, 'Ana');
  });

  it('ignores a reply target that is not an object id', async () => {
    let looked = false;
    const state = await discussion({
      findComment: async () => {
        looked = true;
        return null;
      },
    }).load(ARTICLE, { replyTo: '{"$ne":null}' });
    assert.deepEqual([state.replyTarget, looked], [null, false]);
  });
});
