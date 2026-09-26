/**
 * Environment variables HelloDeploy sets itself at run time.
 *
 * The runtime injects these when it starts a container, so a value stored
 * against the project is either ignored or actively harmful — binding to a
 * fixed PORT, for instance, makes the health check fail and the release roll
 * back. They are refused in Simple mode and allowed with a warning in Advanced,
 * because an app that genuinely reads a fixed port is unusual but not wrong.
 *
 * @module @hellodeploy/contracts/platform-env
 */

/** @type {Record<string, string>} */
export const PLATFORM_MANAGED_ENV = Object.freeze({
  PORT: 'HelloDeploy chooses the port your website listens on each time it starts.',
  NODE_ENV: 'HelloDeploy runs your website in production mode.',
  HOST: 'HelloDeploy decides which address your website binds to inside the server.',
  HOSTNAME: 'HelloDeploy decides which address your website binds to inside the server.',
});

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isPlatformManagedEnv(name) {
  return Object.hasOwn(PLATFORM_MANAGED_ENV, String(name ?? '').toUpperCase());
}

/**
 * Why HelloDeploy manages this variable, for showing next to the field.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function platformManagedReason(name) {
  return PLATFORM_MANAGED_ENV[String(name ?? '').toUpperCase()] ?? null;
}
