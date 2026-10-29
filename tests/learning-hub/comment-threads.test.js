import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const { ArticleComment } = await import('@hellodeploy/database');
const { listCommentThreads, resolveReplyTarget, commentPageForThread, VISIBLE_REPLIES } =
  await import('../../apps/web/src/services/learning-hub/comment.service.js');
const { parseCommentInput } =
  await import('../../apps/web/src/services/learning-hub/comment-input.js');

let clock = Date.parse('2026-10-01T00:00:00Z');

function comment(overrides = {}) {
  clock += 1000;
  return ArticleComment.create({
    articleId: 'a1',
    displayName: 'Reader',
    body: 'A thoughtful comment body.',
    status: 'published',
    createdAt: new Date(clock),
    ...overrides,
  });
}

async function reply(target, overrides = {}) {
  const thread = await resolveReplyTarget({
    articleId: overrides.articleId ?? 'a1',
    replyToCommentId: String(target._id),
  });
  return comment({ ...thread, ...overrides });
}

const VALID_INPUT = {
  displayName: 'Reader',
  body: 'A valid comment body.',
  submissionKey: 'abcdefghijklmnopqrstuvwx',
};

describe('Learning Hub comment threads', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('stores a reply under its root', async () => {
    const root = await comment();
    const child = await reply(root);
    assert.equal(String(child.parentId), String(root._id));
  });

  it('stores a reply to a reply under the same root, not one level deeper', async () => {
    const root = await comment();
    const child = await reply(root);
    const grandchild = await reply(child);
    assert.equal(String(grandchild.parentId), String(root._id));
  });

  it('keeps the actual reply target and its name on a reply to a reply', async () => {
    const root = await comment();
    const child = await reply(root, { displayName: 'Ana' });
    const grandchild = await reply(child);
    assert.deepEqual(
      [String(grandchild.replyToCommentId), grandchild.replyToDisplayName],
      [String(child._id), 'Ana'],
    );
  });

  it('refuses a reply to a comment on another article', async () => {
    const foreign = await comment({ articleId: 'other' });
    await assert.rejects(
      resolveReplyTarget({ articleId: 'a1', replyToCommentId: String(foreign._id) }),
      { code: 'REPLY_TARGET_UNAVAILABLE' },
    );
  });

  it('refuses a reply to a hidden comment', async () => {
    const hidden = await comment({ status: 'hidden' });
    await assert.rejects(
      resolveReplyTarget({ articleId: 'a1', replyToCommentId: String(hidden._id) }),
      { code: 'REPLY_TARGET_UNAVAILABLE' },
    );
  });

  it('refuses a reply to a comment that does not exist', async () => {
    await assert.rejects(
      resolveReplyTarget({ articleId: 'a1', replyToCommentId: '0123456789abcdef01234567' }),
      { code: 'REPLY_TARGET_UNAVAILABLE' },
    );
  });

  it('refuses a reply to a reply whose root was removed', async () => {
    const root = await comment();
    const child = await reply(root);
    await ArticleComment.updateOne({ _id: root._id }, { status: 'removed' });
    await assert.rejects(
      resolveReplyTarget({ articleId: 'a1', replyToCommentId: String(child._id) }),
      { code: 'REPLY_TARGET_UNAVAILABLE' },
    );
  });

  it('lists threads oldest first', async () => {
    const first = await comment({ displayName: 'First' });
    await comment({ displayName: 'Second' });
    const { threads } = await listCommentThreads({ articleId: 'a1' });
    assert.equal(threads[0].comment.id, String(first._id));
  });

  it('shows only published comments', async () => {
    await comment();
    await comment({ status: 'hidden' });
    await comment({ status: 'removed' });
    await comment({ status: 'rejected' });
    const { threads } = await listCommentThreads({ articleId: 'a1' });
    assert.equal(threads.length, 1);
  });

  it('hides the replies of a thread whose root is not published', async () => {
    const root = await comment();
    await reply(root);
    await ArticleComment.updateOne({ _id: root._id }, { status: 'hidden' });
    const { totalComments } = await listCommentThreads({ articleId: 'a1' });
    assert.equal(totalComments, 0);
  });

  it('counts visible roots and replies together', async () => {
    const root = await comment();
    await reply(root);
    const hiddenReply = await reply(root);
    await ArticleComment.updateOne({ _id: hiddenReply._id }, { status: 'hidden' });
    const { totalComments } = await listCommentThreads({ articleId: 'a1' });
    assert.equal(totalComments, 2);
  });

  it('keeps articles isolated from each other', async () => {
    await comment({ articleId: 'other' });
    const { threads } = await listCommentThreads({ articleId: 'a1' });
    assert.equal(threads.length, 0);
  });

  it('paginates roots in a stable order', async () => {
    const roots = [];
    for (let i = 0; i < 12; i += 1) {
      roots.push(await comment({ displayName: `Reader ${i}` }));
    }
    const { threads } = await listCommentThreads({ articleId: 'a1', page: 2 });
    assert.deepEqual(
      threads.map((thread) => thread.comment.id),
      roots.slice(10).map((root) => String(root._id)),
    );
  });

  it('caps visible replies and reports how many are hidden', async () => {
    const root = await comment();
    for (let i = 0; i < VISIBLE_REPLIES + 3; i += 1) {
      await reply(root);
    }
    const { threads } = await listCommentThreads({ articleId: 'a1' });
    assert.equal(threads[0].hiddenReplyCount, 3);
  });

  it('shows every reply of an expanded thread', async () => {
    const root = await comment();
    for (let i = 0; i < VISIBLE_REPLIES + 3; i += 1) {
      await reply(root);
    }
    const { threads } = await listCommentThreads({
      articleId: 'a1',
      expandThreadId: String(root._id),
    });
    assert.equal(threads[0].replies.length, VISIBLE_REPLIES + 3);
  });

  it('finds the discussion page holding a thread', async () => {
    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await comment();
    }
    assert.equal(await commentPageForThread({ articleId: 'a1', rootId: last._id }), 2);
  });
});

describe('Learning Hub comment input', () => {
  it('accepts a valid submission', () => {
    assert.deepEqual(parseCommentInput(VALID_INPUT).errors, {});
  });

  it('rejects a one-character display name', () => {
    assert.ok(parseCommentInput({ ...VALID_INPUT, displayName: 'A' }).errors.displayName);
  });

  it('rejects a display name over 60 characters', () => {
    assert.ok(
      parseCommentInput({ ...VALID_INPUT, displayName: 'x'.repeat(61) }).errors.displayName,
    );
  });

  it('rejects a display name made only of invisible characters', () => {
    const name = '​​⁠⁠';
    assert.ok(parseCommentInput({ ...VALID_INPUT, displayName: name }).errors.displayName);
  });

  it('rejects a body under 10 characters', () => {
    assert.ok(parseCommentInput({ ...VALID_INPUT, body: 'too short' }).errors.body);
  });

  it('rejects a body over 2,000 characters', () => {
    assert.ok(parseCommentInput({ ...VALID_INPUT, body: 'x'.repeat(2001) }).errors.body);
  });

  it('rejects a non-string body such as an array', () => {
    assert.ok(parseCommentInput({ ...VALID_INPUT, body: ['a', 'b'] }).errors.body);
  });

  it('strips bidi override characters', () => {
    const { value } = parseCommentInput({ ...VALID_INPUT, body: 'safe ‮txt.exe text' });
    assert.equal(value.body, 'safe txt.exe text');
  });

  it('keeps Filipino and other Unicode text intact', () => {
    const body = 'Salamat po! Gumana na ang deployment ko. ñ é 漢字 🚀';
    assert.equal(parseCommentInput({ ...VALID_INPUT, body }).value.body, body);
  });

  it('keeps HTML as literal text for escaped rendering', () => {
    const body = '<script>alert(1)</script> is in my logs';
    assert.equal(parseCommentInput({ ...VALID_INPUT, body }).value.body, body);
  });

  it('rejects a reply id that is not an object id', () => {
    assert.ok(parseCommentInput({ ...VALID_INPUT, replyTo: '{"$gt":""}' }).errors.replyTo);
  });

  it('requires a submission key', () => {
    assert.ok(parseCommentInput({ ...VALID_INPUT, submissionKey: '' }).errors.form);
  });
});
