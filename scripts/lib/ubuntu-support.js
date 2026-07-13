export const SUPPORTED_UBUNTU_RELEASES = Object.freeze(['22.04', '24.04']);
export const CANDIDATE_UBUNTU_RELEASES = Object.freeze(['26.04']);

function readValue(content, name) {
  const match = content.match(new RegExp(`^${name}=(?:"([^"]*)"|(.*))$`, 'm'));
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

export function classifyUbuntuRelease(content, { allowCandidate = false } = {}) {
  const id = readValue(content, 'ID').toLowerCase();
  const version = readValue(content, 'VERSION_ID');

  if (id === 'ubuntu' && SUPPORTED_UBUNTU_RELEASES.includes(version)) {
    return {
      id,
      version,
      tier: 'supported',
      ok: true,
      detail: `Ubuntu ${version} supported`,
    };
  }

  if (id === 'ubuntu' && CANDIDATE_UBUNTU_RELEASES.includes(version)) {
    return {
      id,
      version,
      tier: 'candidate',
      ok: allowCandidate,
      detail: allowCandidate
        ? `Ubuntu ${version} candidate explicitly acknowledged`
        : `Ubuntu ${version} candidate requires --allow-candidate-os`,
    };
  }

  return {
    id,
    version,
    tier: 'unsupported',
    ok: false,
    detail: `Detected unsupported OS: ${id || 'unknown'} ${version || 'unknown'}`,
  };
}
