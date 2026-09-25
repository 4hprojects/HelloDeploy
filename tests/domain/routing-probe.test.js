import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyRoutingProbe } from '../../apps/web/src/services/domain.service.js';

const HOSTNAME = 'hellopera.online';

describe('classifyRoutingProbe', () => {
  it('reports a matching route header as live', () => {
    const { state } = classifyRoutingProbe({ status: 200, routeHeader: HOSTNAME }, HOSTNAME);
    assert.equal(state, 'LIVE');
  });

  it('treats an answer without the route header as a foreign server', () => {
    const { state } = classifyRoutingProbe({ status: 200, routeHeader: null }, HOSTNAME);
    assert.equal(state, 'FOREIGN');
  });

  it('treats another project answering as a foreign server', () => {
    const { state } = classifyRoutingProbe(
      { status: 200, routeHeader: 'someone-else.online' },
      HOSTNAME,
    );
    assert.equal(state, 'FOREIGN');
  });

  it('names the route that answered instead', () => {
    const { detail } = classifyRoutingProbe(
      { status: 200, routeHeader: 'someone-else.online' },
      HOSTNAME,
    );
    assert.match(detail, /someone-else\.online/);
  });

  it('reads HTTP 530 as a disconnected tunnel', () => {
    const { state } = classifyRoutingProbe({ status: 530 }, HOSTNAME);
    assert.equal(state, 'TUNNEL_DOWN');
  });

  it('reads a Cloudflare origin error as DNS not pointing here', () => {
    const { state } = classifyRoutingProbe({ status: 522 }, HOSTNAME);
    assert.equal(state, 'NOT_POINTED');
  });

  it('reads an unreachable hostname as DNS not pointing here', () => {
    const { state } = classifyRoutingProbe({ error: 'getaddrinfo ENOTFOUND' }, HOSTNAME);
    assert.equal(state, 'NOT_POINTED');
  });

  it('never claims a Cloudflare error page is a foreign server', () => {
    const { state } = classifyRoutingProbe({ status: 530, routeHeader: null }, HOSTNAME);
    assert.notEqual(state, 'FOREIGN');
  });
});
