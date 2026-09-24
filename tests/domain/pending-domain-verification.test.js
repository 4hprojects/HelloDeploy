import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  stashPendingDomainVerification,
  consumePendingDomainVerification,
} from '../../apps/web/src/utils/pending-domain-verification.js';

const HELLOPERA = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const HELLOUNIVERSITY = 'bbbbbbbbbbbbbbbbbbbbbbb2';

/** A request already through requireProjectRole, whose project is a lean POJO. */
function requestFor(projectId, session = {}) {
  return { project: { _id: { toString: () => projectId } }, session };
}

describe('pending domain verification', () => {
  it('stamps the stash with the project being viewed', () => {
    const req = requestFor(HELLOPERA);

    stashPendingDomainVerification(req, { hostname: 'hellopera.online', token: 'token-a' });

    assert.deepEqual(req.session.pendingDomainVerification, {
      projectId: HELLOPERA,
      hostname: 'hellopera.online',
      token: 'token-a',
    });
  });

  it('returns the token to the project that owns it', () => {
    const req = requestFor(HELLOPERA);
    stashPendingDomainVerification(req, { hostname: 'hellopera.online', token: 'token-a' });

    const pending = consumePendingDomainVerification(req);

    assert.deepEqual(pending, { token: 'token-a', hostname: 'hellopera.online' });
  });

  it('withholds another project’s token', () => {
    const adding = requestFor(HELLOPERA);
    stashPendingDomainVerification(adding, { hostname: 'hellopera.online', token: 'token-a' });

    const pending = consumePendingDomainVerification(requestFor(HELLOUNIVERSITY, adding.session));

    assert.deepEqual(pending, { token: null, hostname: null });
  });

  it('leaves another project’s token available for its own page', () => {
    const adding = requestFor(HELLOPERA);
    stashPendingDomainVerification(adding, { hostname: 'hellopera.online', token: 'token-a' });

    consumePendingDomainVerification(requestFor(HELLOUNIVERSITY, adding.session));

    assert.equal(adding.session.pendingDomainVerification.token, 'token-a');
  });

  it('clears the stash as it hands the value to the caller', () => {
    const req = requestFor(HELLOPERA);
    stashPendingDomainVerification(req, { hostname: 'hellopera.online', token: 'token-a' });

    consumePendingDomainVerification(req);

    assert.equal(req.session.pendingDomainVerification, undefined);
  });

  it('treats an empty session as nothing pending', () => {
    const pending = consumePendingDomainVerification(requestFor(HELLOPERA));

    assert.deepEqual(pending, { token: null, hostname: null });
  });
});
