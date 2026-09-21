/**
 * Nginx configuration template generator for HelloDeploy platform subdomains.
 *
 * Each user project gets a single server block that proxies to a loopback port.
 * TLS termination is handled upstream by Cloudflare — Nginx only listens on HTTP.
 *
 * SECURITY: No user-supplied values are ever interpolated directly; all inputs
 * are validated before reaching this module.
 */

/**
 * Generate a complete Nginx server block for a project subdomain.
 *
 * @param {{
 *   subdomain: string,      - validated subdomain label (e.g. "my-app")
 *   domain: string,         - platform root domain (e.g. "hellodeploy.online")
 *   port: number,           - loopback port the container is listening on
 *   deploymentId: string,   - recorded for auditability
 *   generatedAt?: Date,
 * }} opts
 * @returns {string} nginx config block
 */
export function generateServerBlock({
  subdomain,
  domain,
  port,
  deploymentId,
  generatedAt = new Date(),
}) {
  return generateHostnameServerBlock({
    hostname: `${subdomain}.${domain}`,
    managedLabel: subdomain,
    port,
    deploymentId,
    generatedAt,
  });
}

export function isValidRouteHostname(hostname) {
  if (typeof hostname !== 'string' || hostname.length > 253 || !hostname.includes('.')) {
    return false;
  }
  return hostname.split('.').every((label) => {
    return (
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-')
    );
  });
}

/** Generate a server block for an already-normalized full hostname. */
export function generateHostnameServerBlock({
  hostname,
  managedLabel = hostname,
  port,
  deploymentId,
  generatedAt = new Date(),
}) {
  if (!isValidRouteHostname(hostname)) {
    throw new Error(`Invalid Nginx route hostname: "${hostname}"`);
  }
  const ts = generatedAt.toISOString();

  return `# hellodeploy-managed: ${managedLabel}
# generated: ${ts}
# deployment: ${deploymentId}
# WARNING: This file is auto-generated. Manual edits will be overwritten.

server {
    listen 80;
    server_name ${hostname};

    # Request limits
    client_max_body_size 10m;
    client_body_timeout 30s;

    # Proxy to container on loopback
    location / {
        proxy_pass http://127.0.0.1:${port};

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Allow WebSocket upgrades
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Do not buffer large responses
        proxy_buffering on;
        proxy_buffers 16 16k;
        proxy_buffer_size 32k;
    }
}
`;
}

const DEFAULT_MAINTENANCE_MESSAGE = 'Service temporarily unavailable.';

/**
 * Sanitizes an owner-supplied maintenance message for safe interpolation into
 * an Nginx `return` string literal. Strips quotes/control characters and caps
 * length rather than attempting to escape them, since this value ends up
 * inside a generated config file that `nginx -t` will parse.
 */
export function sanitizeMaintenanceMessage(message) {
  if (!message) {
    return DEFAULT_MAINTENANCE_MESSAGE;
  }

  const cleaned = String(message)
    .replace(/[\r\n"\\;{}]/g, '')
    .trim()
    .slice(0, 200);

  return cleaned || DEFAULT_MAINTENANCE_MESSAGE;
}

/**
 * Generate a maintenance server block for a suspended or maintenance-mode project.
 * Returns 503 with a Retry-After header.
 *
 * @param {{ subdomain: string, domain: string, message?: string }} opts
 * @returns {string}
 */
export function generateMaintenanceBlock({ subdomain, domain, message }) {
  return generateHostnameMaintenanceBlock({
    hostname: `${subdomain}.${domain}`,
    managedLabel: subdomain,
    message,
  });
}

/** Generate a maintenance server block for an already-normalized full hostname. */
export function generateHostnameMaintenanceBlock({ hostname, managedLabel = hostname, message }) {
  if (!isValidRouteHostname(hostname)) {
    throw new Error(`Invalid Nginx route hostname: "${hostname}"`);
  }
  const safeMessage = sanitizeMaintenanceMessage(message);

  return `# hellodeploy-maintenance: ${managedLabel}
server {
    listen 80;
    server_name ${hostname};

    location / {
        add_header Retry-After 300 always;
        return 503 "${safeMessage}";
    }
}
`;
}
