/**
 * Readiness for the guided setup's final step.
 *
 * Wraps assessInitialApprovalReadiness, whose findings are accurate but written
 * for someone who knows the platform ("Run Check my app", "Advanced build
 * settings"), and adds the checks that guided setup introduced: required
 * settings, the chosen address, and whether a deployment is already running.
 *
 * Every failing check carries an action pointing at the field that fixes it, so
 * the owner is never told what is wrong without being told where to go.
 *
 * Checks nothing that is not actually measured. There is deliberately no
 * "server capacity" line: nothing in HelloDeploy measures it today, and a green
 * tick for an unmeasured thing is worse than no line at all.
 */

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus, ProjectStatus } from '@hellodeploy/contracts';

import { assessInitialApprovalReadiness } from './approval-readiness.service.js';
import { checkAddressAvailability } from './website-address.service.js';

export const CHECK_STATUS = Object.freeze({
  PASS: 'PASS',
  BLOCKING: 'BLOCKING',
  WARNING: 'WARNING',
});

const IN_FLIGHT_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
];

/**
 * Plain-language replacements for the approval findings, plus where to fix each.
 * A code missing from here keeps its original message, so a new finding still
 * renders rather than vanishing.
 */
const FINDING_COPY = Object.freeze({
  repository_access: {
    label: 'Your code',
    pass: 'HelloDeploy can reach your GitHub project.',
    blocked: 'HelloDeploy cannot reach your GitHub project any more.',
    action: { label: 'Reconnect GitHub', step: 'repository' },
  },
  production_branch: {
    label: 'Branch',
    pass: null,
    blocked: 'Choose which branch HelloDeploy should publish.',
    action: { label: 'Choose a branch', step: 'repository' },
  },
  repository_commit: {
    label: 'Current version',
    pass: null,
    blocked: 'HelloDeploy could not work out which version of your code to publish.',
    action: { label: 'Check your project', step: 'repository' },
  },
  supported_runtime: {
    label: 'Technology',
    pass: null,
    blocked: 'HelloDeploy could not work out how to run this project.',
    action: { label: 'Check your project', step: 'analyze' },
  },
  successful_detection: {
    label: 'Project check',
    pass: 'Your project passed its checks.',
    blocked: 'Your project has not passed its checks yet.',
    action: { label: 'Check your project', step: 'analyze' },
  },
  current_detection: {
    label: 'Checked version',
    pass: 'The checks match your latest code.',
    blocked: 'Your code changed since the last check.',
    action: { label: 'Check again', step: 'analyze' },
  },
  runtime_configuration: {
    label: 'Build and start settings',
    pass: 'Your build and start settings are ready.',
    blocked: 'Some build or start settings are still missing.',
    action: { label: 'Review settings', step: 'analyze' },
  },
  deployment_mode: {
    label: 'Publishing',
    pass: null,
    blocked: 'Choose manual or automatic publishing.',
    action: { label: 'Open settings', step: null },
  },
});

/**
 * @param {{
 *   project: object,
 *   repository: object|null,
 *   missingEnvKeys?: string[],
 * }} params
 * @returns {Promise<{
 *   isReady: boolean,
 *   checks: Array<{ key: string, label: string, status: string, message: string, action: object|null }>,
 *   blocking: string[],
 *   summary: object,
 * }>}
 */
export async function assessDeploymentReadiness({ project, repository, missingEnvKeys = [] }) {
  const base = assessInitialApprovalReadiness({ project, repository });
  const checks = base.findings.map((finding) => translateFinding(project, finding));

  checks.push(await buildEnvironmentCheck(project, missingEnvKeys));
  checks.push(await buildAddressCheck(project));
  checks.push(await buildInFlightCheck(project));

  const blocking = checks.filter((check) => check.status === CHECK_STATUS.BLOCKING);

  return {
    isReady: blocking.length === 0,
    checks,
    blocking: blocking.map((check) => check.key),
    summary: buildSummary(project, repository),
  };
}

function stepHref(project, step) {
  return step ? `/projects/${project.slug}/setup/${step}` : `/projects/${project.slug}/settings`;
}

function translateFinding(project, finding) {
  const copy = FINDING_COPY[finding.code];
  const isPass = finding.status === 'PASS';

  if (!copy) {
    // An unmapped finding keeps its own wording rather than disappearing.
    return {
      key: finding.code,
      label: finding.label,
      status: finding.status,
      message: finding.message,
      action: isPass ? null : { label: 'Review settings', href: stepHref(project, null) },
    };
  }

  const message = (isPass ? copy.pass : copy.blocked) ?? finding.message;

  return {
    key: finding.code,
    label: copy.label,
    status: finding.status,
    message,
    action: isPass ? null : { label: copy.action.label, href: stepHref(project, copy.action.step) },
  };
}

async function buildEnvironmentCheck(project, missingEnvKeys) {
  if (missingEnvKeys.length === 0) {
    return {
      key: 'environment',
      label: 'Settings',
      status: CHECK_STATUS.PASS,
      message: 'Everything your website needs is in place.',
      action: null,
    };
  }

  const [first] = missingEnvKeys;
  return {
    key: 'environment',
    label: 'Settings',
    status: CHECK_STATUS.BLOCKING,
    message:
      missingEnvKeys.length === 1
        ? `${first} is required before this website can start.`
        : `${missingEnvKeys.join(', ')} are required before this website can start.`,
    action: {
      label: missingEnvKeys.length === 1 ? `Add ${first}` : 'Add your settings',
      href: stepHref(project, 'environment'),
    },
  };
}

async function buildAddressCheck(project) {
  const address = project.platformSubdomain ?? project.slug;
  const availability = await checkAddressAvailability(address, { excludeProjectId: project._id });

  return {
    key: 'website_address',
    label: 'Website address',
    status: availability.isAvailable ? CHECK_STATUS.PASS : CHECK_STATUS.BLOCKING,
    message: availability.isAvailable ? 'Your web address is ready to use.' : availability.message,
    action: availability.isAvailable
      ? null
      : { label: 'Choose another address', href: stepHref(project, 'identity') },
  };
}

async function buildInFlightCheck(project) {
  const active = await Deployment.findOne({
    projectId: project._id,
    status: { $in: IN_FLIGHT_STATUSES },
  }).lean();

  if (!active) {
    return {
      key: 'no_active_deployment',
      label: 'Ready to start',
      status: CHECK_STATUS.PASS,
      message: 'Nothing else is publishing right now.',
      action: null,
    };
  }

  return {
    key: 'no_active_deployment',
    label: 'Ready to start',
    status: CHECK_STATUS.BLOCKING,
    message: 'This website is already being published. Wait for that to finish first.',
    action: {
      label: 'See what is happening',
      href: `/projects/${project.slug}/deployments/${active._id}`,
    },
  };
}

/** The at-a-glance panel above the checks. */
function buildSummary(project, repository) {
  return {
    name: project.name,
    address: project.platformSubdomain ?? project.slug,
    branch: project.productionBranch ?? repository?.defaultBranch ?? null,
    source: repository?.fullName ?? null,
    needsReview: project.status !== ProjectStatus.ACTIVE,
  };
}
