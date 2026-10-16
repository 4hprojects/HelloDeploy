import { spawn } from 'node:child_process';

const MAX_REPORTED_IDS = 5;

function runTrivy(args, env) {
  return new Promise((resolve) => {
    const stdout = [];
    const stderr = [];
    const proc = spawn('trivy', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
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

/**
 * Scan an owner image for fixable critical vulnerabilities with Trivy.
 *
 * @param {string} imageRef digest-pinned reference
 * @param {{ dockerConfigDir?: string, run?: Function }} options
 * @returns {Promise<{ criticalCount: number, ids: string[] }>}
 */
export async function scanImage(imageRef, { dockerConfigDir, run = runTrivy } = {}) {
  const result = await run(
    [
      'image',
      '--quiet',
      '--no-progress',
      '--severity',
      'CRITICAL',
      '--ignore-unfixed',
      '--format',
      'json',
      imageRef,
    ],
    dockerConfigDir ? { DOCKER_CONFIG: dockerConfigDir } : {},
  );
  if (result.code !== 0) {
    throw new Error(`The image scanner could not run: ${result.stderr.trim().slice(0, 300)}`);
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error('The image scanner returned a report that is not JSON.');
  }
  const ids = (report.Results ?? []).flatMap((entry) =>
    (entry.Vulnerabilities ?? []).map((vulnerability) => vulnerability.VulnerabilityID),
  );
  return { criticalCount: ids.length, ids: [...new Set(ids)].slice(0, MAX_REPORTED_IDS) };
}
