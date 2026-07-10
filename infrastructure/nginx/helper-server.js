#!/usr/bin/env node

import 'dotenv/config';
import { createServer } from 'node:net';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  activateRoute,
  removeRoute,
  validateNginxConfig,
} from '../../apps/worker/src/nginx/route-manager.js';

const socketPath = process.env.NGINX_HELPER_SOCKET || '/run/hellodeploy/nginx-helper.sock';
const configDir = process.env.NGINX_HELLODEPLOY_CONFIG_DIR || '/etc/nginx/hellodeploy.d';
const nginxBinary = process.env.NGINX_BINARY_PATH || '/usr/sbin/nginx';
const maxRequestBytes = 1024 * 1024;
let operationQueue = Promise.resolve();

function respond(socket, payload) {
  socket.end(`${JSON.stringify(payload)}\n`);
}

async function handleRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Request must be an object.');
  }

  switch (request.action) {
    case 'activate':
      if (typeof request.slug !== 'string' || typeof request.configContent !== 'string') {
        throw new Error('Activate requires string slug and configContent fields.');
      }
      await activateRoute({
        configDir,
        slug: request.slug,
        configContent: request.configContent,
        nginxBinary,
      });
      return;
    case 'remove':
      if (typeof request.slug !== 'string') {
        throw new Error('Remove requires a string slug field.');
      }
      await removeRoute({ configDir, slug: request.slug, nginxBinary });
      return;
    case 'validate':
      await validateNginxConfig(nginxBinary);
      return;
    default:
      throw new Error('Unsupported Nginx helper action.');
  }
}

await mkdir(dirname(socketPath), { recursive: true, mode: 0o750 });
await rm(socketPath, { force: true });

const server = createServer({ allowHalfOpen: true }, (socket) => {
  let body = '';
  let handled = false;

  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body) > maxRequestBytes) {
      handled = true;
      respond(socket, { ok: false, error: 'Request exceeds the 1 MiB limit.' });
    }
  });
  socket.on('end', async () => {
    if (handled) {
      return;
    }
    handled = true;
    try {
      const request = JSON.parse(body.trim());
      const operation = operationQueue.then(() => handleRequest(request));
      operationQueue = operation.catch(() => {});
      await operation;
      respond(socket, { ok: true });
    } catch (err) {
      process.stderr.write(`[nginx-helper] ${err.message}\n`);
      respond(socket, { ok: false, error: err.message.slice(0, 500) });
    }
  });
  socket.on('error', (err) => {
    process.stderr.write(`[nginx-helper] socket error: ${err.message}\n`);
  });
});

server.listen(socketPath, async () => {
  await chmod(socketPath, 0o660);
  process.stdout.write(`[nginx-helper] listening on ${socketPath}\n`);
});

async function shutdown() {
  server.close(async () => {
    await rm(socketPath, { force: true });
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
