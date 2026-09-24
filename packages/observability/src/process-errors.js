function safeErrorDetails(error) {
  const name = error instanceof Error ? error.name : 'NonErrorFailure';
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : undefined;

  const details = code ? { errorType: name, errorCode: code } : { errorType: name };

  // ConfigurationError messages are authored by our own startup validation from
  // env var names and platform constants, so they carry no credentials. Every
  // other message may (a driver reporting a failed `redis://user:pass@host`),
  // and stacks leak topology, so both stay out. Without this, a misconfigured
  // worker exits with nothing but `{"errorType":"Error"}` and crash-loops
  // invisibly — which it did, for days.
  if (name === 'ConfigurationError' && typeof error.message === 'string') {
    details.message = error.message;
  }

  return details;
}

/**
 * Install last-resort handlers that log only safe error classifications before
 * terminating. Messages and stacks are excluded unless the error is a
 * ConfigurationError — see `safeErrorDetails`.
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
