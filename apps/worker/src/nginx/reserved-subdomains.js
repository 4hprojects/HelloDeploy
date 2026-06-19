/**
 * Reserved subdomain names that cannot be claimed by user projects.
 * Covers platform infrastructure, common service names, and attack surfaces.
 */

const RESERVED = new Set([
  // Platform-critical
  'www', 'api', 'admin', 'app', 'dashboard', 'console', 'panel', 'portal',
  'login', 'auth', 'signup', 'register', 'logout', 'oauth', 'sso', 'saml',
  'hellodeploy', 'hello', 'platform', 'deploy', 'deployments',

  // Network/DNS infrastructure
  'ns', 'ns1', 'ns2', 'dns', 'dns1', 'dns2',
  'mx', 'mx1', 'mx2', 'mail', 'smtp', 'imap', 'pop', 'pop3',

  // Web services
  'ftp', 'sftp', 'ssh', 'vpn', 'proxy', 'relay', 'gateway',
  'cdn', 'static', 'assets', 'media', 'files', 'uploads', 'downloads',

  // Dev / staging environments
  'dev', 'develop', 'development', 'staging', 'stage', 'test', 'testing',
  'beta', 'alpha', 'preview', 'demo', 'sandbox', 'qa', 'uat',

  // Ops / monitoring
  'status', 'health', 'metrics', 'monitor', 'monitoring', 'logs', 'logging',
  'alerts', 'alerting', 'grafana', 'prometheus', 'kibana', 'splunk',
  'dashboard', 'ops', 'devops', 'sre',

  // Source control / CI
  'git', 'github', 'gitlab', 'bitbucket', 'webhook', 'webhooks', 'hooks',
  'ci', 'cd', 'pipeline', 'registry', 'docker', 'containers',

  // Documentation / marketing
  'docs', 'documentation', 'help', 'support', 'blog', 'news', 'landing',
  'marketing', 'jobs', 'careers', 'about', 'contact', 'legal', 'privacy',
  'terms', 'tos',

  // Reserved hostnames
  'localhost', 'local', 'internal', 'intranet', 'loopback', 'broadcasthost',
  'ip6-localhost', 'ip6-loopback', 'ip6-localnet',

  // Potential confusion
  'account', 'accounts', 'billing', 'payment', 'payments', 'store',
  'shop', 'marketplace', 'exchange',
]);

/**
 * Returns true if the given subdomain label is reserved by the platform.
 * Input must be already lowercased.
 *
 * @param {string} label - The subdomain label (e.g. "my-app", not "my-app.hellodeploy.online")
 * @returns {boolean}
 */
export function isReservedSubdomain(label) {
  return RESERVED.has(label.toLowerCase());
}

/**
 * Returns true if the label is a syntactically valid DNS label suitable for
 * use as a subdomain. Does not check reservation status.
 *
 * Rules: 1–63 chars, a-z0-9 and hyphens, must not start or end with a hyphen.
 *
 * @param {string} label
 * @returns {boolean}
 */
export function isValidSubdomainLabel(label) {
  if (!label || label.length > 63) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(label);
}
