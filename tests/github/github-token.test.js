import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateKeyPairSync, createVerify } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.GITHUB_APP_ID = '99999';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
// A real developer .env may set a PATH, which env.js (via dotenv) would
// otherwise load ahead of process.env and take precedence over the inline
// key set above.
process.env.GITHUB_APP_PRIVATE_KEY_PATH = '';

const { generateAppJWT } = await import('../../apps/worker/src/git/github-token.js');

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

describe('generateAppJWT', () => {
  it('produces a three-segment RS256 JWT with the configured app ID as issuer', () => {
    const jwt = generateAppJWT();
    const [headerSeg, payloadSeg] = jwt.split('.');

    assert.equal(decodeSegment(headerSeg).alg, 'RS256');
    assert.equal(decodeSegment(payloadSeg).iss, '99999');
  });

  it('signs the header and payload with the configured private key', () => {
    const jwt = generateAppJWT();
    const [headerSeg, payloadSeg, signatureSeg] = jwt.split('.');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerSeg}.${payloadSeg}`);
    const valid = verifier.verify(publicKey, signatureSeg, 'base64url');

    assert.equal(valid, true);
  });
});
