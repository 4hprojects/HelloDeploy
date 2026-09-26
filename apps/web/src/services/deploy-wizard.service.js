/**
 * Guided setup ("Deploy a Website") step machine.
 *
 * The current step is derived from what is persisted about the project, never
 * from the session, so a refresh, a new tab, or returning days later on another
 * device all resume in the same place.
 *
 * Two kinds of input decide a step:
 *   - derived facts — a connected repository, detection status, stored secrets
 *   - explicit confirmations — `project.setup.confirmedSteps`, for steps that
 *     have nothing observable to check because they always hold a value
 *
 * This module is pure. Callers load the facts and pass them in.
 */

import { DetectionConfidence, DetectionStatus, ProjectStatus } from '@hellodeploy/contracts';

/** Steps that operate on an existing project, in order. */
export const WIZARD_STEPS = Object.freeze([
  'repository',
  'analyze',
  'identity',
  'environment',
  'readiness',
]);

const STEP_LABELS = Object.freeze({
  repository: 'Choose your website',
  analyze: 'Check your project',
  identity: 'Name your website',
  environment: 'Add your settings',
  readiness: 'Publish',
});

export const STEP_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  CURRENT: 'CURRENT',
  UPCOMING: 'UPCOMING',
});

// Detection confident enough to apply without asking the owner to review it.
const TRUSTED_CONFIDENCE = new Set([DetectionConfidence.HIGH, DetectionConfidence.MEDIUM]);

function hasConfirmed(project, step) {
  return (project.setup?.confirmedSteps ?? []).includes(step);
}

/**
 * Is this step satisfied? Each answer leans on observable state first and falls
 * back to an explicit confirmation only where nothing is observable.
 *
 * @param {string} step
 * @param {{ project: object, repository: object|null, missingEnvKeys: string[] }} facts
 * @returns {boolean}
 */
function isSatisfied(step, { project, repository, missingEnvKeys }) {
  switch (step) {
    case 'repository':
      return Boolean(project.repositoryId && repository);

    case 'analyze': {
      if (project.detection?.status !== DetectionStatus.READY) {
        return false;
      }
      // Weakly-evidenced settings need a human glance; confident ones do not.
      return (
        TRUSTED_CONFIDENCE.has(project.detection?.confidence) || hasConfirmed(project, 'analyze')
      );
    }

    // Name and address always hold a generated value, so there is nothing to
    // observe — only the owner accepting them.
    case 'identity':
      return hasConfirmed(project, 'identity');

    // Missing required values block regardless of confirmation; once none are
    // missing, an explicit pass is still wanted so optional values get a look.
    case 'environment':
      return missingEnvKeys.length === 0 && hasConfirmed(project, 'environment');

    case 'readiness':
      return project.status === ProjectStatus.ACTIVE;

    default:
      return false;
  }
}

/**
 * Build the full guided-setup state for a project.
 *
 * @param {{
 *   project: object,
 *   repository?: object|null,
 *   missingEnvKeys?: string[],
 * }} params
 * @returns {{
 *   steps: Array<{ key: string, label: string, status: string, href: string, position: number }>,
 *   currentStep: string|null,
 *   isComplete: boolean,
 *   nextHref: string,
 * }}
 */
export function resolveWizardState({ project, repository = null, missingEnvKeys = [] }) {
  const facts = { project, repository, missingEnvKeys };
  const satisfied = WIZARD_STEPS.map((step) => isSatisfied(step, facts));

  // The current step is the first unsatisfied one. Everything before it is
  // complete even if a later step happens to be satisfied, so the owner is
  // never sent past something they still have to do.
  const currentIndex = satisfied.indexOf(false);
  const isComplete = currentIndex === -1;
  const base = `/projects/${project.slug}/setup`;

  const steps = WIZARD_STEPS.map((step, index) => {
    let status = STEP_STATUS.UPCOMING;
    if (isComplete || index < currentIndex) {
      status = STEP_STATUS.COMPLETE;
    } else if (index === currentIndex) {
      status = STEP_STATUS.CURRENT;
    }

    return {
      key: step,
      label: STEP_LABELS[step],
      status,
      href: `${base}/${step}`,
      position: index + 1,
    };
  });

  const currentStep = isComplete ? null : WIZARD_STEPS[currentIndex];

  return {
    steps,
    currentStep,
    isComplete,
    nextHref: isComplete ? `/projects/${project.slug}` : `${base}/${currentStep}`,
  };
}

/**
 * May the owner open this step directly?
 *
 * Completed steps stay open so settings can be revisited, and the current step
 * is obviously open. Later steps are not, because they depend on decisions not
 * yet made — a deep link to one redirects to `nextHref` rather than rendering
 * a form over missing data.
 *
 * @param {string} step
 * @param {{ steps: Array<{ key: string, status: string }> }} state
 * @returns {boolean}
 */
export function canEnterStep(step, state) {
  const entry = state.steps.find((candidate) => candidate.key === step);
  return Boolean(entry) && entry.status !== STEP_STATUS.UPCOMING;
}

/**
 * Record that the owner confirmed a step, without duplicating it.
 * Returns the new confirmed list for the caller to persist.
 *
 * @param {object} project
 * @param {string} step
 * @returns {string[]}
 */
export function withConfirmedStep(project, step) {
  const confirmed = project.setup?.confirmedSteps ?? [];
  return confirmed.includes(step) ? [...confirmed] : [...confirmed, step];
}
