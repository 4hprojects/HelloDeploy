// The running alert engine, for the deployment pipeline to report outcomes
// to without importing the worker runtime. Null when monitoring is off.
let current = null;

export function setAlertReporter(reporter) {
  current = reporter;
}

/** Report a deployment outcome; does nothing when monitoring is not running. */
export function reportDeploymentOutcome(outcome) {
  if (!current) {
    return;
  }
  current(outcome).catch(() => {});
}
