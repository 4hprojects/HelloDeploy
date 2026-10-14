import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProjectRole } from '@hellodeploy/contracts';

import {
  buildProjectNavigation,
  withSetupMarks,
} from '../../apps/web/src/config/project-navigation.js';

const navigation = buildProjectNavigation('sample-app', ProjectRole.OWNER, '/projects/sample-app');

function guide(doneKeys, nextKey) {
  const keys = ['project', 'source', 'check', 'environment', 'approval', 'deployment', 'live'];
  return {
    milestones: keys.map((key) => ({ key, done: doneKeys.includes(key) })),
    nextStepIndex: keys.indexOf(nextKey),
  };
}

function markFor(items, key) {
  return items.find((item) => item.key === key).setupMark;
}

describe('sidebar setup marks', () => {
  it('marks an item done when all of its setup steps are done', () => {
    const items = withSetupMarks(navigation, guide(['project', 'source'], 'check'));
    assert.equal(markFor(items, 'repository'), 'done');
  });

  it('marks the item where the next setup step lives', () => {
    const items = withSetupMarks(navigation, guide(['project', 'source'], 'check'));
    assert.equal(markFor(items, 'detection'), 'next');
  });

  it('leaves an item unmarked while only some of its steps are done', () => {
    const items = withSetupMarks(navigation, guide(['project', 'deployment'], 'check'));
    assert.equal(markFor(items, 'deployments'), null);
  });

  it('leaves non-setup items unmarked', () => {
    const items = withSetupMarks(navigation, guide(['project', 'source'], 'check'));
    assert.equal(markFor(items, 'domains'), null);
  });

  it('returns the navigation unchanged once setup is over', () => {
    assert.equal(withSetupMarks(navigation, null), navigation);
  });
});
