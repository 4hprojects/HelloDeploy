import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { canTransition, isTerminal, isActive, buildImageTag } =
  await import('../../packages/deployment-core/src/index.js');

describe('canTransition', () => {
  it('QUEUED → VALIDATING is valid', () => {
    assert.equal(canTransition('QUEUED', 'VALIDATING'), true);
  });
  it('QUEUED → CANCELLED is valid', () => {
    assert.equal(canTransition('QUEUED', 'CANCELLED'), true);
  });
  it('VALIDATING → BUILDING is valid', () => {
    assert.equal(canTransition('VALIDATING', 'BUILDING'), true);
  });
  it('VALIDATING → FAILED is valid', () => {
    assert.equal(canTransition('VALIDATING', 'FAILED'), true);
  });
  it('BUILDING → DEPLOYING is valid', () => {
    assert.equal(canTransition('BUILDING', 'DEPLOYING'), true);
  });
  it('DEPLOYING → HEALTHY is valid', () => {
    assert.equal(canTransition('DEPLOYING', 'HEALTHY'), true);
  });
  it('HEALTHY → ROLLED_BACK is valid', () => {
    assert.equal(canTransition('HEALTHY', 'ROLLED_BACK'), true);
  });
  it('QUEUED → HEALTHY is invalid (skip)', () => {
    assert.equal(canTransition('QUEUED', 'HEALTHY'), false);
  });
  it('FAILED → QUEUED is invalid (terminal)', () => {
    assert.equal(canTransition('FAILED', 'QUEUED'), false);
  });
  it('CANCELLED → BUILDING is invalid (terminal)', () => {
    assert.equal(canTransition('CANCELLED', 'BUILDING'), false);
  });
  it('ROLLED_BACK → anything is invalid (terminal)', () => {
    assert.equal(canTransition('ROLLED_BACK', 'HEALTHY'), false);
  });
  it('unknown status returns false', () => {
    assert.equal(canTransition('UNKNOWN_STATUS', 'QUEUED'), false);
  });
});

describe('isTerminal', () => {
  it('HEALTHY is terminal', () => assert.equal(isTerminal('HEALTHY'), true));
  it('FAILED is terminal', () => assert.equal(isTerminal('FAILED'), true));
  it('CANCELLED is terminal', () => assert.equal(isTerminal('CANCELLED'), true));
  it('ROLLED_BACK is terminal', () => assert.equal(isTerminal('ROLLED_BACK'), true));
  it('QUEUED is not terminal', () => assert.equal(isTerminal('QUEUED'), false));
  it('BUILDING is not terminal', () => assert.equal(isTerminal('BUILDING'), false));
});

describe('isActive', () => {
  it('QUEUED is active', () => assert.equal(isActive('QUEUED'), true));
  it('VALIDATING is active', () => assert.equal(isActive('VALIDATING'), true));
  it('BUILDING is active', () => assert.equal(isActive('BUILDING'), true));
  it('DEPLOYING is active', () => assert.equal(isActive('DEPLOYING'), true));
  it('HEALTHY is not active', () => assert.equal(isActive('HEALTHY'), false));
  it('FAILED is not active', () => assert.equal(isActive('FAILED'), false));
});

describe('buildImageTag', () => {
  it('produces lowercase tag with expected structure', () => {
    const tag = buildImageTag('my-project', 'abc1234def567890', 3);
    assert.equal(tag, 'hellodeploy-my-project-abc1234-3');
  });
  it('replaces non-alphanumeric chars in slug with hyphens', () => {
    const tag = buildImageTag('My_Project!', 'abc1234def', 1);
    assert.match(tag, /^hellodeploy-my-project-/);
  });
  it('uses first 7 chars of commitSha', () => {
    const tag = buildImageTag('test', '1234567890abcdef', 1);
    assert.ok(tag.includes('1234567'), `expected 1234567 in ${tag}`);
    assert.ok(!tag.includes('1234567890abcdef'));
  });
});
