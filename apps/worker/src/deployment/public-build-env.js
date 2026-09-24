/**
 * Selection of the environment variables a build is allowed to see.
 *
 * Runtime secrets are injected when the container starts and never reach
 * `docker build`. That is correct for a database URL or an API key, but it
 * breaks frontend frameworks outright: they read their public configuration at
 * build time and compile the values into the JavaScript bundle. A Next.js app
 * built without `NEXT_PUBLIC_SUPABASE_URL` does not fail — it ships a bundle
 * with `undefined` baked in, which only surfaces in the browser.
 *
 * These prefixes are each framework's own marker for "this value is compiled
 * into client code", so the values are already public to every visitor. That is
 * what makes them safe to pass as build arguments, which `docker history`
 * exposes. Nothing outside the list is eligible, whatever it is named.
 */
const PUBLIC_PREFIXES = ['NEXT_PUBLIC_', 'VITE_', 'REACT_APP_', 'VUE_APP_'];

/** Mirrors the EnvironmentSecret model's name validation. */
const VALID_NAME = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Narrow a project's environment variables to those safe to expose to the
 * build, keyed by name.
 *
 * SECURITY: the caller passes the full decrypted secret map. Every name that
 * does not carry a public prefix is dropped here and must never be handed to
 * `docker build`.
 *
 * @param {Record<string, string>} envVars — decrypted project environment
 * @returns {Record<string, string>} the public subset
 */
export function selectPublicBuildEnv(envVars) {
  const selected = {};
  for (const [name, value] of Object.entries(envVars ?? {})) {
    if (!VALID_NAME.test(name)) {
      continue;
    }
    if (PUBLIC_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      selected[name] = value;
    }
  }
  return selected;
}
