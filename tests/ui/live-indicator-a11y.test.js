import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);
const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

// Screen readers announce "●" as "black circle"; the state must come from text,
// and changes to it (live, status, disconnected) must be announced.
describe('deployment log live indicator', () => {
  it('is a polite status region', () => {
    assert.match(deploymentDetail, /id="live-indicator"[^>]*role="status"/);
  });

  it('hides the dot glyph from assistive technology in the page', () => {
    assert.match(
      deploymentDetail,
      /id="live-indicator"[^>]*><span aria-hidden="true">●<\/span> Live/,
    );
  });

  it('hides the dot glyph when the script restores the live state', () => {
    assert.doesNotMatch(appJs, /indicator\.textContent = '● Live'/);
  });
});
