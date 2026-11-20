import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isSafeLink,
  renderArticleMarkdown,
} from '../../apps/web/src/services/learning-hub/markdown.js';

describe('Learning Hub Markdown rendering', () => {
  it('escapes raw HTML instead of rendering it', () => {
    const { html } = renderArticleMarkdown('<script>alert(1)</script>');
    assert.equal(html.trim(), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapes HTML inside fenced code', () => {
    const { html } = renderArticleMarkdown('```html\n<img src=x onerror=alert(1)>\n```');
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  for (const href of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'java&#115;cript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example',
  ]) {
    it(`does not render a link to ${href}`, () => {
      const { html } = renderArticleMarkdown(`[click](${href})`);
      assert.doesNotMatch(html, /<a /);
    });
  }

  it('marks external links noopener noreferrer', () => {
    const { html } = renderArticleMarkdown('[Node](https://nodejs.org/)');
    assert.match(html, /<a href="https:\/\/nodejs.org\/" rel="noopener noreferrer">/);
  });

  it('accepts same-site paths and anchors', () => {
    assert.deepEqual(['/blog/a', '#setup', 'mailto:a@example.com'].map(isSafeLink), [
      true,
      true,
      true,
    ]);
  });

  it('gives duplicate headings distinct ids', () => {
    const { headings } = renderArticleMarkdown('## Setup\n\n## Setup\n\n## Setup 2\n');
    assert.deepEqual(
      headings.map((h) => h.id),
      ['setup', 'setup-2', 'setup-2-2'],
    );
  });

  it('collects H2 and H3 headings for the table of contents', () => {
    const { headings } = renderArticleMarkdown('## One\n\n### Two\n\n#### Three\n');
    assert.deepEqual(
      headings.map((h) => h.level),
      [2, 3],
    );
  });

  it('lazy-loads images', () => {
    const { html } = renderArticleMarkdown('![Diagram of a proxy](/assets/blog/proxy.png)');
    assert.match(html, /loading="lazy"/);
  });

  it('wraps tables in a scrollable, focusable region', () => {
    const { html } = renderArticleMarkdown('| a |\n|---|\n| b |\n');
    assert.match(html, /^<div class="article-table" tabindex="0"><table>/);
  });

  it('renders identically for the same input', () => {
    const source = '## A\n\nText with `code`.\n\n```sh\nnpm start\n```\n';
    assert.equal(renderArticleMarkdown(source).html, renderArticleMarkdown(source).html);
  });
});
