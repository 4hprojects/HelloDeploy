/**
 * PM2 ecosystem configuration for HelloDeploy.
 *
 * Start:   pm2 start ecosystem.config.cjs
 * Stop:    pm2 stop ecosystem.config.cjs
 * Restart: pm2 restart ecosystem.config.cjs
 * Logs:    pm2 logs
 * Status:  pm2 status
 */
'use strict';

// PM2 creates these files as the invoking user. They were hardcoded under
// /var/log/hellodeploy, which belongs to the systemd service account and is
// mode 0750 — so a developer running this file unprivileged cannot start it at
// all, and the practical fallback is `pm2 start npm -- start`. That collapses
// web and worker into a single PM2 entry where concurrently survives on the web
// half, leaving PM2 reporting `online` while the worker crash-loops unseen.
// Default to PM2's own log directory; let a provisioned host opt into the
// shared one via HELLODEPLOY_LOG_DIR.
const logDir = process.env.HELLODEPLOY_LOG_DIR;

function logFiles(name) {
  if (!logDir) {
    return {};
  }
  return {
    error_file: `${logDir}/${name}-error.log`,
    out_file: `${logDir}/${name}-out.log`,
  };
}

module.exports = {
  apps: [
    {
      name: 'hellodeploy-web',
      script: './apps/web/src/server.js',
      cwd: __dirname,
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      ...logFiles('web'),
      merge_logs: true,
    },
    {
      name: 'hellodeploy-worker',
      script: './apps/worker/src/worker.js',
      cwd: __dirname,
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      ...logFiles('worker'),
      merge_logs: true,
    },
  ],
};
