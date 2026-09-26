/**
 * Plain-language labels for deployment stages.
 *
 * The worker records a `DeploymentStage` at each real boundary of a release.
 * This table turns those into the progress list a project owner reads, so the
 * default deployment view needs no build logs. Advanced views may show the
 * underlying status and log stream instead.
 *
 * @module @hellodeploy/contracts/deployment-stages
 */

import { DeploymentStage } from './enums.js';

/**
 * Stages in the order a deployment passes through them. Use this for rendering
 * a progress list — never `Object.values()`, which carries no ordering promise.
 */
export const DEPLOYMENT_STAGE_ORDER = Object.freeze([
  DeploymentStage.PREPARING,
  DeploymentStage.BUILDING,
  DeploymentStage.CONFIGURING,
  DeploymentStage.STARTING,
  DeploymentStage.CHECKING,
  DeploymentStage.PUBLISHING,
]);

/** @type {Record<string, { label: string, activeLabel: string, description: string }>} */
export const DEPLOYMENT_STAGE_COPY = Object.freeze({
  [DeploymentStage.PREPARING]: {
    label: 'Prepare your files',
    activeLabel: 'Preparing your files',
    description: 'Downloading your code and checking it is safe to build.',
  },
  [DeploymentStage.BUILDING]: {
    label: 'Install and build',
    activeLabel: 'Installing and building',
    description: 'Fetching the packages your website needs, then building it.',
  },
  [DeploymentStage.CONFIGURING]: {
    label: 'Set up your website',
    activeLabel: 'Setting up your website',
    description: 'Reserving a slot for your website and loading your settings.',
  },
  [DeploymentStage.STARTING]: {
    label: 'Start your website',
    activeLabel: 'Starting your website',
    description: 'Launching your website for the first time.',
  },
  [DeploymentStage.CHECKING]: {
    label: 'Check it responds',
    activeLabel: 'Checking it responds',
    description: 'Confirming your website answers before sending visitors to it.',
  },
  [DeploymentStage.PUBLISHING]: {
    label: 'Publish',
    activeLabel: 'Publishing',
    description: 'Pointing your web address at the new version.',
  },
});

const DEFAULT_STAGE_COPY = Object.freeze({
  label: 'Working',
  activeLabel: 'Working',
  description: 'HelloDeploy is working on your website.',
});

/**
 * Look up the plain-language copy for a deployment stage.
 * Always returns a usable entry, so a stage added later without updating this
 * table still renders.
 *
 * @param {string|null|undefined} stage
 * @returns {{ label: string, activeLabel: string, description: string }}
 */
export function getStageCopy(stage) {
  return DEPLOYMENT_STAGE_COPY[stage] ?? DEFAULT_STAGE_COPY;
}
