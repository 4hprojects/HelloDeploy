process.stdout.write(
  process.env.ACCEPTANCE_PRIVATE_CANARY ? 'private-canary-present\n' : 'private-canary-absent\n',
);
