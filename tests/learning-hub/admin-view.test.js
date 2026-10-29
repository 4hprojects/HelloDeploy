import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import ejs from 'ejs';

const viewPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/admin/learning-hub.ejs', import.meta.url),
);

function render(comments, status = 'reported') {
  return ejs.renderFile(viewPath, {
    csrfToken: 'token',
    status,
    statusFilters: ['reported', 'published', 'hidden', 'removed', 'rejected'],
    listing: { comments, total: comments.length, page: 1, totalPages: 1 },
    settings: { submissionsPaused: true, pausedArticleIds: ['a1'] },
    articles: [{ id: 'a1', title: 'First guide' }],
    articleTitle: () => 'First guide',
    commentsFeatureEnabled: false,
    moderationProvider: 'none',
    contentErrors: [],
  });
}

const reported = {
  _id: '0123456789abcdef01234567',
  articleId: 'a1',
  displayName: '<i>Reader</i>',
  body: '<script>x</script>',
  status: 'published',
  authorType: 'guest',
  reports: { count: 4 },
  moderation: { decision: 'safe', reasons: [] },
  createdAt: new Date('2026-10-29T00:00:00Z'),
};

describe('Learning Hub admin view', () => {
  it('escapes comment text', async () => {
    const html = await render([reported]);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  });

  it('offers hide and remove for a published comment', async () => {
    const html = await render([reported]);
    assert.deepEqual(
      [/\/hide"/.test(html), /\/remove"/.test(html), /\/restore"/.test(html)],
      [true, true, false],
    );
  });

  it('offers restore for a hidden comment', async () => {
    const html = await render([{ ...reported, status: 'hidden' }], 'hidden');
    assert.match(html, /\/restore"/);
  });

  it('shows the pause switch as on when submissions are paused', async () => {
    const html = await render([]);
    assert.match(html, /name="submissionsPaused" checked/);
  });

  it('states that no moderation provider is configured', async () => {
    const html = await render([]);
    assert.match(html, /None configured — submissions refused/);
  });
});
