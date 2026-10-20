import { IMAGE_REGISTRIES } from '@hellodeploy/contracts';

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const REQUEST_TIMEOUT_MS = 15_000;

/** An owner image reference could not be resolved to a digest. */
export class ImageResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageResolutionError';
    this.code = 'IMAGE_RESOLUTION_FAILED';
  }
}

/**
 * Resolve a tag to the immutable manifest digest the registry serves now, so
 * the deployment records and later rolls back to exactly that image.
 *
 * @param {{ registry: string, repository: string, tag: string }} reference
 * @param {{ credential?: { username: string, token: string } | null, fetchImpl?: typeof fetch }} options
 */
export async function resolveImageDigest(
  { registry, repository, tag },
  { credential = null, fetchImpl = fetch } = {},
) {
  const apiBase = IMAGE_REGISTRIES[registry]?.apiBase;
  if (!apiBase) {
    throw new ImageResolutionError(`${registry} is not an approved registry.`);
  }
  const manifestUrl = `${apiBase}/v2/${repository}/manifests/${encodeURIComponent(tag)}`;
  const requestManifest = (authorization) =>
    fetchImpl(manifestUrl, {
      method: 'HEAD',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: MANIFEST_ACCEPT,
        ...(authorization ? { Authorization: authorization } : {}),
      },
    });

  let response = await requestManifest(null);
  if (response.status === 401) {
    const token = await requestRegistryToken({
      registry,
      repository,
      challenge: response.headers.get('www-authenticate'),
      credential,
      fetchImpl,
    });
    response = await requestManifest(`Bearer ${token}`);
  }
  if (response.status === 404) {
    throw new ImageResolutionError(`The image ${registry}/${repository}:${tag} was not found.`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ImageResolutionError(
      `The registry refused access to ${registry}/${repository}. Check the saved registry credentials.`,
    );
  }
  if (!response.ok) {
    throw new ImageResolutionError(
      `The registry answered ${response.status} for ${registry}/${repository}:${tag}.`,
    );
  }
  const digest = response.headers.get('docker-content-digest');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? '')) {
    throw new ImageResolutionError('The registry did not return a sha256 manifest digest.');
  }
  return digest;
}

async function requestRegistryToken({ registry, repository, challenge, credential, fetchImpl }) {
  const parameters = Object.fromEntries(
    [...String(challenge ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
  if (!/^Bearer\s/i.test(challenge ?? '') || !parameters.realm) {
    throw new ImageResolutionError('The registry asked for an unsupported kind of sign-in.');
  }
  let realm;
  try {
    realm = new URL(parameters.realm);
  } catch {
    throw new ImageResolutionError('The registry returned an invalid sign-in address.');
  }
  if (
    realm.protocol !== 'https:' ||
    !IMAGE_REGISTRIES[registry].tokenHosts.includes(realm.hostname)
  ) {
    throw new ImageResolutionError(
      'The registry asked for credentials at an unexpected address, so HelloDeploy did not send them.',
    );
  }
  if (parameters.service) {
    realm.searchParams.set('service', parameters.service);
  }
  realm.searchParams.set('scope', `repository:${repository}:pull`);
  const response = await fetchImpl(realm, {
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: credential
      ? {
          Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.token}`).toString('base64')}`,
        }
      : {},
  });
  if (!response.ok) {
    throw new ImageResolutionError(
      `The registry refused access to ${registry}/${repository} (${response.status}). Check the saved registry credentials.`,
    );
  }
  const body = await response.json();
  const token = body.token ?? body.access_token;
  if (typeof token !== 'string' || !token) {
    throw new ImageResolutionError('The registry did not return an access token.');
  }
  return token;
}
