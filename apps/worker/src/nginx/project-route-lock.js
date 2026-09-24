const projectRouteLocks = new Map();

/** Serialize route mutations for one project within the single-host V1 worker. */
export async function withProjectRouteLock(projectId, task) {
  const key = projectId.toString();
  const previous = projectRouteLocks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  projectRouteLocks.set(key, tail);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (projectRouteLocks.get(key) === tail) {
      projectRouteLocks.delete(key);
    }
  }
}
