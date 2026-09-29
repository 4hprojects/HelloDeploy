/**
 * Subdomain rules moved to @hellodeploy/contracts so the web app can reject a
 * bad or reserved address while the owner is choosing it, rather than letting
 * the worker fail the deployment later.
 *
 * Re-exported here so existing worker call sites keep their import path.
 */
export { isReservedSubdomain, isValidSubdomainLabel } from '@hellodeploy/contracts';
