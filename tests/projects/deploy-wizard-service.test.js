import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DetectionConfidence, DetectionStatus, ProjectStatus } from '@hellodeploy/contracts';

import {
  WIZARD_STEPS,
  needsAnalysisReview,
  STEP_STATUS,
  resolveWizardState,
  canEnterStep,
  withConfirmedStep,
} from '../../apps/web/src/services/deploy-wizard.service.js';

const repository = { _id: 'r1', fullName: 'henson/hellouniversity', defaultBranch: 'main' };

/** A project at the very start of guided setup. */
function project(overrides = {}) {
  return {
    _id: 'p1',
    slug: 'hellouniversity',
    status: ProjectStatus.DRAFT,
    repositoryId: null,
    detection: { status: DetectionStatus.NOT_RUN, confidence: DetectionConfidence.LEGACY },
    setup: { confirmedSteps: [] },
    ...overrides,
  };
}

/** A project whose repository is connected and confidently detected. */
function analyzed(overrides = {}) {
  return project({
    repositoryId: 'r1',
    detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.HIGH },
    ...overrides,
  });
}

const stateOf = (p, extras = {}) =>
  resolveWizardState({ project: p, repository: p.repositoryId ? repository : null, ...extras });

describe('guided setup step order', () => {
  it('runs from repository through to publish', () => {
    assert.deepEqual(WIZARD_STEPS, [
      'repository',
      'analyze',
      'identity',
      'environment',
      'readiness',
    ]);
  });

  it('numbers the steps for display', () => {
    assert.deepEqual(
      stateOf(project()).steps.map((step) => step.position),
      [1, 2, 3, 4, 5],
    );
  });
});

describe('guided setup current step', () => {
  it('starts a fresh project at the repository step', () => {
    assert.equal(stateOf(project()).currentStep, 'repository');
  });

  it('moves to analysis once a repository is connected', () => {
    assert.equal(stateOf(project({ repositoryId: 'r1' })).currentStep, 'analyze');
  });

  it('keeps the owner on analysis while detection needs attention', () => {
    const p = project({
      repositoryId: 'r1',
      detection: {
        status: DetectionStatus.NEEDS_ATTENTION,
        confidence: DetectionConfidence.HIGH,
      },
    });

    assert.equal(stateOf(p).currentStep, 'analyze');
  });

  it('passes analysis without asking when detection is confident', () => {
    assert.equal(stateOf(analyzed()).currentStep, 'identity');
  });

  it('asks the owner to review weakly-evidenced detection', () => {
    const p = analyzed({
      detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.LOW },
    });

    assert.equal(stateOf(p).currentStep, 'analyze');
  });

  it('accepts reviewed low-confidence detection once confirmed', () => {
    const p = analyzed({
      detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.LOW },
      setup: { confirmedSteps: ['analyze'] },
    });

    assert.equal(stateOf(p).currentStep, 'identity');
  });

  it('moves to settings once the name is accepted', () => {
    const p = analyzed({ setup: { confirmedSteps: ['identity'] } });
    assert.equal(stateOf(p).currentStep, 'environment');
  });

  it('holds at settings while a required value is missing', () => {
    const p = analyzed({ setup: { confirmedSteps: ['identity', 'environment'] } });
    assert.equal(stateOf(p, { missingEnvKeys: ['DATABASE_URL'] }).currentStep, 'environment');
  });

  it('reaches publish once every setting is in place', () => {
    const p = analyzed({ setup: { confirmedSteps: ['identity', 'environment'] } });
    assert.equal(stateOf(p).currentStep, 'readiness');
  });

  it('finishes when the project goes active', () => {
    const p = analyzed({
      status: ProjectStatus.ACTIVE,
      setup: { confirmedSteps: ['identity', 'environment'] },
    });

    assert.equal(stateOf(p).isComplete, true);
  });

  it('sends a finished project to its overview', () => {
    const p = analyzed({
      status: ProjectStatus.ACTIVE,
      setup: { confirmedSteps: ['identity', 'environment'] },
    });

    assert.equal(stateOf(p).nextHref, '/projects/hellouniversity');
  });
});

describe('guided setup resumes from persisted state alone', () => {
  it('returns the same step for the same project every time', () => {
    const p = analyzed({ setup: { confirmedSteps: ['identity'] } });
    assert.equal(stateOf(p).currentStep, stateOf(p).currentStep);
  });

  it('does not treat a connected repository as unconnected without the record', () => {
    // A dangling repositoryId with no repository row must not count as done.
    const p = project({ repositoryId: 'r1' });
    const state = resolveWizardState({ project: p, repository: null });

    assert.equal(state.currentStep, 'repository');
  });
});

describe('guided setup step marking', () => {
  it('marks earlier steps complete', () => {
    const p = analyzed({ setup: { confirmedSteps: ['identity'] } });
    const repositoryStep = stateOf(p).steps.find((step) => step.key === 'repository');

    assert.equal(repositoryStep.status, STEP_STATUS.COMPLETE);
  });

  it('marks later steps upcoming', () => {
    const readiness = stateOf(project()).steps.find((step) => step.key === 'readiness');
    assert.equal(readiness.status, STEP_STATUS.UPCOMING);
  });

  it('marks every step complete once setup is finished', () => {
    const p = analyzed({
      status: ProjectStatus.ACTIVE,
      setup: { confirmedSteps: ['identity', 'environment'] },
    });

    assert.ok(stateOf(p).steps.every((step) => step.status === STEP_STATUS.COMPLETE));
  });
});

describe('guided setup step access', () => {
  it('allows the current step', () => {
    assert.equal(canEnterStep('repository', stateOf(project())), true);
  });

  it('allows revisiting a completed step', () => {
    const p = analyzed({ setup: { confirmedSteps: ['identity'] } });
    assert.equal(canEnterStep('repository', stateOf(p)), true);
  });

  it('refuses a step that depends on decisions not yet made', () => {
    assert.equal(canEnterStep('readiness', stateOf(project())), false);
  });

  it('refuses an unknown step', () => {
    assert.equal(canEnterStep('nonsense', stateOf(project())), false);
  });
});

describe('guided setup confirmations', () => {
  it('records a newly confirmed step', () => {
    assert.deepEqual(withConfirmedStep(project(), 'identity'), ['identity']);
  });

  it('does not duplicate an already confirmed step', () => {
    const p = project({ setup: { confirmedSteps: ['identity'] } });
    assert.deepEqual(withConfirmedStep(p, 'identity'), ['identity']);
  });

  it('keeps earlier confirmations', () => {
    const p = project({ setup: { confirmedSteps: ['analyze'] } });
    assert.deepEqual(withConfirmedStep(p, 'identity'), ['analyze', 'identity']);
  });
});

/**
 * The analyse step's gate and the button that satisfies it must agree for every
 * confidence value. When they were decided separately, LEGACY — the default for
 * every project predating confidence tracking — reached a step whose only way
 * forward was never rendered, and "Continue" bounced straight back to it.
 */
describe('the analysis gate and its confirmation cannot disagree', () => {
  for (const confidence of Object.values(DetectionConfidence)) {
    it(`offers a way forward for ${confidence} detection`, () => {
      const p = project({
        repositoryId: 'r1',
        detection: { status: DetectionStatus.READY, confidence },
      });
      const state = resolveWizardState({ project: p, repository, missingEnvKeys: [] });

      // Either the step passes on its own, or the owner is asked to confirm it.
      const passesUnaided = state.currentStep !== 'analyze';
      assert.equal(passesUnaided || needsAnalysisReview(p), true);
    });
  }

  it('does not strand a project detected before confidence was recorded', () => {
    const p = project({
      repositoryId: 'r1',
      detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.LEGACY },
    });

    assert.equal(needsAnalysisReview(p), true);
  });

  it('lets a legacy project continue once the owner confirms', () => {
    const p = project({
      repositoryId: 'r1',
      detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.LEGACY },
      setup: { confirmedSteps: ['analyze'] },
    });
    const state = resolveWizardState({ project: p, repository, missingEnvKeys: [] });

    assert.equal(state.currentStep, 'identity');
  });

  it('asks nothing of a confidently detected project', () => {
    const p = project({
      repositoryId: 'r1',
      detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.HIGH },
    });

    assert.equal(needsAnalysisReview(p), false);
  });

  it('asks the owner to confirm settings they set by hand', () => {
    const p = project({
      repositoryId: 'r1',
      detection: { status: DetectionStatus.READY, confidence: DetectionConfidence.MANUAL },
    });

    assert.equal(needsAnalysisReview(p), true);
  });

  it('treats a project with no recorded confidence as needing a look', () => {
    const p = project({ repositoryId: 'r1', detection: { status: DetectionStatus.READY } });
    assert.equal(needsAnalysisReview(p), true);
  });
});
