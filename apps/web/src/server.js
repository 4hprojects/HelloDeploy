import { installFatalProcessHandlers, logger } from '@hellodeploy/observability';

const fatalProcess = installFatalProcessHandlers({ service: '[web]', logger });

import('./runtime.js').catch((error) => fatalProcess.handle('startup', error));
