if (process.env.ACCEPTANCE_PRIVATE_CANARY !== undefined) {
  process.stderr.write('unsupported private build-time secret detected\n');
  process.exitCode = 1;
} else {
  process.stdout.write('private-build-secret-absent\n');
}
