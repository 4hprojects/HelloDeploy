/**
 * Plain-language translations for deployment `failureCode` values.
 *
 * The worker stamps a `failureCode` (and often a raw `failureSummary` — an
 * unmodified Docker/Node error message) on a deployment when it fails. Those
 * are accurate for debugging but meaningless to a non-technical project
 * owner. This table maps each code to a short, plain-language explanation
 * plus a concrete next action, for use as the primary failure text — with
 * the raw code/summary demoted to a secondary "technical details" view.
 *
 * @module @hellodeploy/contracts/failure-codes
 */

const TRY_AGAIN_ACTION =
  'This is usually temporary — try deploying again. Contact support if it keeps happening.';

const ASK_BUILDER_ACTION = 'Share the technical details below with the person who built the app.';

/** @type {Record<string, { message: string, action: string }>} */
export const DEPLOYMENT_FAILURE_COPY = Object.freeze({
  PORT_ALLOCATION_FAILED: {
    message: "HelloDeploy couldn't find a free slot to run your app right now.",
    action: TRY_AGAIN_ACTION,
  },
  NETWORK_SETUP_FAILED: {
    message: "HelloDeploy couldn't set up the connection your app needs to run.",
    action: TRY_AGAIN_ACTION,
  },
  SECRET_DECRYPTION_FAILED: {
    message:
      "HelloDeploy couldn't unlock one of your app's stored secrets (like a password or API key).",
    action: "Check your project's environment variables, or contact support.",
  },
  CONTAINER_START_FAILED: {
    message: "Your app couldn't be started.",
    action:
      'This is often a configuration issue — check your build and start settings, or contact support.',
  },
  CONTAINER_CRASHED_ON_STARTUP: {
    message: 'Your app started but immediately stopped running.',
    action: `Check your start command — it may be wrong, or your app may be crashing on launch. ${ASK_BUILDER_ACTION}`,
  },
  HEALTH_CHECK_FAILED: {
    message: "Your app started, but didn't respond in time to confirm it's working.",
    action: `Check your app's "working-page check" setting, or ${ASK_BUILDER_ACTION.toLowerCase()}`,
  },
  SUBDOMAIN_INVALID: {
    message: "The web address for your app isn't available.",
    action: 'Try a different project name, or contact support.',
  },
  NGINX_ROUTE_FAILED: {
    message: "HelloDeploy couldn't connect your app to its web address.",
    action: TRY_AGAIN_ACTION,
  },
  PROJECT_NOT_FOUND: {
    message: "HelloDeploy couldn't find this project.",
    action: 'Try refreshing the page. If this keeps happening, contact support.',
  },
  REPO_ACCESS_REVOKED: {
    message: 'HelloDeploy no longer has access to your code repository.',
    action:
      'Reconnect your repository in Settings, or check that the GitHub App is still installed.',
  },
  GITHUB_TOKEN_FAILED: {
    message: 'HelloDeploy could not connect to GitHub to get your code.',
    action: 'Try again shortly. If this keeps happening, check your GitHub connection in Settings.',
  },
  CLONE_FAILED: {
    message: "HelloDeploy couldn't download your code from GitHub.",
    action: 'Check that your repository and branch still exist, or contact support.',
  },
  BUILD_CONTEXT_INVALID: {
    message: "Something in your project's files isn't safe or supported for building.",
    action: ASK_BUILDER_ACTION,
  },
  DOCKERFILE_GENERATION_FAILED: {
    message: "HelloDeploy couldn't prepare your app for building.",
    action: `${ASK_BUILDER_ACTION} You can also contact support.`,
  },
  BUILD_FAILED: {
    message: 'Your app failed to build.',
    action: `This usually means there's an error in the code. ${ASK_BUILDER_ACTION}`,
  },
  ACTIVATION_ENQUEUE_FAILED: {
    message: "Your app was built, but HelloDeploy couldn't start the next step.",
    action: TRY_AGAIN_ACTION,
  },
  ROLLBACK_SOURCE_INVALID: {
    message: "HelloDeploy couldn't roll back to that version.",
    action: 'Choose a different version to roll back to, or contact support.',
  },
  QUEUE_UNAVAILABLE: {
    message: "HelloDeploy's deployment system is temporarily unavailable.",
    action: TRY_AGAIN_ACTION,
  },
});

const DEFAULT_FAILURE_COPY = Object.freeze({
  message: 'Something went wrong during deployment.',
  action: 'Check the technical details below, or contact support if this keeps happening.',
});

/**
 * Look up the plain-language copy for a deployment failureCode.
 * Always returns a usable entry — falls back to a generic message for any
 * code not in the table (e.g. one added later without updating this file).
 *
 * @param {string|null|undefined} code
 * @returns {{ message: string, action: string }}
 */
export function getFailureCopy(code) {
  return DEPLOYMENT_FAILURE_COPY[code] ?? DEFAULT_FAILURE_COPY;
}
