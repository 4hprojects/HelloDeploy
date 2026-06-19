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
      error_file: '/var/log/hellodeploy/web-error.log',
      out_file: '/var/log/hellodeploy/web-out.log',
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
      error_file: '/var/log/hellodeploy/worker-error.log',
      out_file: '/var/log/hellodeploy/worker-out.log',
      merge_logs: true,
    },
  ],
};
