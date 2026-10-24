import { spawn } from 'node:child_process';

/**
 * Start and stop the one systemd unit that runs the isolated builder. The
 * worker may manage only this unit (a polkit rule installed with the builder
 * enforces that); it never touches dockerd, app containers, or nginx. The unit
 * name comes from validated configuration, never from a request.
 *
 * @param {{ unit: string, run?: (args: string[]) => Promise<{ code: number, stdout: string, stderr: string }> }} options
 */
export function createUnitControl({ unit, run = runSystemctl }) {
  async function systemctl(args, label) {
    // --no-ask-password: a missing polkit rule fails at once instead of waiting.
    const result = await run(['--no-ask-password', ...args, unit]);
    if (result.code !== 0) {
      throw new Error(
        `Could not ${label} ${unit}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`,
      );
    }
    return result;
  }

  return {
    unit,
    // --no-block returns once systemd accepts the job; readiness is polled.
    start: () => systemctl(['start', '--no-block'], 'start'),
    stop: () => systemctl(['stop'], 'stop'),
    kill: () => systemctl(['kill', '--signal=SIGKILL'], 'kill'),
    async isActive() {
      const result = await run(['--no-ask-password', 'is-active', unit]);
      return result.stdout.trim() || 'unknown';
    },
  };
}

function runSystemctl(args) {
  return new Promise((resolve) => {
    const stdout = [];
    const stderr = [];
    const proc = spawn('systemctl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
    proc.on('error', (error) => resolve({ code: -1, stdout: '', stderr: error.message }));
  });
}
