// Recognize common, owner-fixable startup failures in an app's own output so
// the deployment can name the cause instead of a generic "didn't respond".
// Rules are deliberately narrow: a wrong diagnosis is worse than none.

const LOCAL_CONNECTION_REFUSED = /ECONNREFUSED\s+((?:127\.0\.0\.1|::1|localhost)(?::\d+)?)/;
const LISTEN_PORT_PATTERNS = [
  /"port"\s*:\s*(\d{2,5})\b/i,
  /\bport\s+(\d{2,5})\b/i,
  /(?:localhost|0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d{2,5})\b/,
];
const MISSING_MODULE = /Cannot find module '([^']+)'/;

/**
 * @param {string[]} lines  captured app output, oldest first
 * @param {{ appPort: number }} context
 * @returns {{ failureCode: string, detail: string } | null}
 */
export function diagnoseAppOutput(lines, { appPort }) {
  for (const line of lines) {
    const match = line.match(LOCAL_CONNECTION_REFUSED);
    if (match) {
      return {
        failureCode: 'APP_DATABASE_UNREACHABLE',
        detail: `Your app tried to connect to ${match[1]}, which is the app's own container, not a database. Set the database address on the Environment page to an online database.`,
      };
    }
  }

  for (const line of lines) {
    if (!/listen/i.test(line)) {
      continue;
    }
    const port = findListenPort(line);
    if (port !== null && port !== appPort) {
      return {
        failureCode: 'APP_PORT_MISMATCH',
        detail: `Your app is listening on port ${port}, but HelloDeploy expects port ${appPort} (the application port in Settings).`,
      };
    }
  }

  for (const line of lines) {
    const match = line.match(MISSING_MODULE);
    if (match || line.includes('MODULE_NOT_FOUND')) {
      const missing = match ? ` (${match[1]})` : '';
      return {
        failureCode: 'APP_BUILD_OUTPUT_MISSING',
        detail: `Your app is missing a file it needs to start${missing}. It probably needs a build command in Settings.`,
      };
    }
  }

  return null;
}

function findListenPort(line) {
  for (const pattern of LISTEN_PORT_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}
