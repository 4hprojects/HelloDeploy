function safeErrorDetails(error) {
  const name = error instanceof Error ? error.name : 'NonErrorFailure';
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : undefined;

  return code ? { errorType: name, errorCode: code } : { errorType: name };
}

/**
 * Install last-resort handlers that log only safe error classifications before
 * terminating. Error messages and stacks may contain credentials or topology,
 * so they are intentionally excluded.
 */
export function installFatalProcessHandlers({ service, logger, processRef = process }) {
  let terminating = false;

  function handle(event, error) {
    if (terminating) {
      return;
    }
    terminating = true;
    logger.error(`${service}: fatal process failure`, {
      event,
      ...safeErrorDetails(error),
    });
    processRef.exit(1);
  }

  const onUncaughtException = (error) => handle('uncaughtException', error);
  const onUnhandledRejection = (reason) => handle('unhandledRejection', reason);

  processRef.on('uncaughtException', onUncaughtException);
  processRef.on('unhandledRejection', onUnhandledRejection);

  return {
    handle,
    uninstall() {
      processRef.removeListener('uncaughtException', onUncaughtException);
      processRef.removeListener('unhandledRejection', onUnhandledRejection);
    },
  };
}
