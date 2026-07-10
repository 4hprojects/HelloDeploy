import { createConnection } from 'node:net';

import { env } from '../config/env.js';

const MAX_RESPONSE_BYTES = 64 * 1024;

function requestHelper(payload, socketPath = env.NGINX_HELPER_SOCKET) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = '';
    let settled = false;

    const finish = (err, value) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve(value);
    };

    socket.setTimeout(env.NGINX_HELPER_TIMEOUT_MS);
    socket.on('connect', () => socket.end(`${JSON.stringify(payload)}\n`));
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) {
        finish(new Error('Nginx helper returned an oversized response.'));
      }
    });
    socket.on('timeout', () => finish(new Error('Nginx helper request timed out.')));
    socket.on('error', (err) => finish(new Error(`Nginx helper unavailable: ${err.message}`)));
    socket.on('end', () => {
      try {
        const parsed = JSON.parse(response.trim());
        if (!parsed.ok) {
          finish(new Error(parsed.error || 'Nginx helper rejected the request.'));
          return;
        }
        finish(null, parsed);
      } catch {
        finish(new Error('Nginx helper returned an invalid response.'));
      }
    });
  });
}

export async function activateRoute({ slug, configContent }) {
  await requestHelper({ action: 'activate', slug, configContent });
}

export async function removeRoute({ slug }) {
  await requestHelper({ action: 'remove', slug });
}

export async function validateNginxConfig() {
  await requestHelper({ action: 'validate' });
}

export { requestHelper };
