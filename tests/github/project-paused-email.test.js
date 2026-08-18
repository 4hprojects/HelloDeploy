import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildProjectPausedEmail } from '../../apps/web/src/services/email.service.js';

describe('project paused email', () => {
  it('escapes user-controlled values in HTML and strips subject newlines', () => {
    const email = buildProjectPausedEmail({
      to: 'owner@example.test',
      firstName: '<Admin>',
      projectName: 'Project\r\nBcc: attacker@example.test<script>',
      projectUrl: 'https://hellodeploy.example/projects/test?value="unsafe"',
    });

    assert.equal(email.html.includes('<Admin>'), false);
    assert.equal(email.html.includes('<script>'), false);
    assert.equal(email.html.includes('"unsafe"'), false);
    assert.match(email.html, /&lt;Admin&gt;/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.doesNotMatch(email.subject, /[\r\n]/);
  });
});
