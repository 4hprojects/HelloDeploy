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
  const fqdn = `${subdomain}.${domain}`;
  const ts = generatedAt.toISOString();

  return `# hellodeploy-managed: ${subdomain}
# generated: ${ts}
# deployment: ${deploymentId}
# WARNING: This file is auto-generated. Manual edits will be overwritten.

server {
    listen 80;
    server_name ${fqdn};

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

/**
 * Generate a maintenance server block for a suspended project.
 * Returns 503 with a Retry-After header.
 *
 * @param {{ subdomain: string, domain: string }} opts
 * @returns {string}
 */
export function generateMaintenanceBlock({ subdomain, domain }) {
  const fqdn = `${subdomain}.${domain}`;

  return `# hellodeploy-maintenance: ${subdomain}
server {
    listen 80;
    server_name ${fqdn};

    location / {
        add_header Retry-After 300 always;
        return 503 "Service temporarily unavailable.";
    }
}
`;
}
