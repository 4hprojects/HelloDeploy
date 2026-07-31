export const PRODUCTION_NODE_MAJOR = 22;

export function classifyProductionNodeVersion(version) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  const ok = Number.isInteger(major) && major === PRODUCTION_NODE_MAJOR;

  return {
    ok,
    detail: ok
      ? `Found supported Node.js ${version}`
      : `Found Node.js ${version}; production requires major ${PRODUCTION_NODE_MAJOR}`,
  };
}
