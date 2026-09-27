import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DeploymentMode,
  DeploymentStatus,
  DomainRoutingState,
  DomainStatus,
  ProjectStatus,
} from '@hellodeploy/contracts';

import {
  buildOverviewCards,
  relativeTime,
  CARD_STATE,
} from '../../apps/web/src/services/project-overview-cards.service.js';

const project = (overrides = {}) => ({
  slug: 'hellouniversity',
  name: 'HelloUniversity',
  status: ProjectStatus.ACTIVE,
  productionBranch: 'main',
  deploymentMode: DeploymentMode.MANUAL,
  maintenanceMode: { enabled: false },
  ...overrides,
});

const repository = { fullName: 'henson/hellouniversity', defaultBranch: 'main' };
const healthy = { status: DeploymentStatus.HEALTHY };

const cardFor = (cards, key) => cards.find((card) => card.key === key);
const build = (params) => buildOverviewCards({ project: project(), ...params });

describe('overview cards — is my website up', () => {
  it('says online when a healthy release is serving', () => {
    const cards = build({ activeDeployment: healthy });
    assert.equal(cardFor(cards, 'website_status').value, 'Online');
  });

  it('says not published when nothing is live', () => {
    const cards = build({});
    assert.equal(cardFor(cards, 'website_status').value, 'Not published yet');
  });

  it('says paused during maintenance', () => {
    const cards = buildOverviewCards({
      project: project({ maintenanceMode: { enabled: true } }),
      activeDeployment: healthy,
    });

    assert.equal(cardFor(cards, 'website_status').value, 'Paused');
  });

  it('explains what visitors see during maintenance', () => {
    const cards = buildOverviewCards({
      project: project({ maintenanceMode: { enabled: true } }),
      activeDeployment: healthy,
    });

    assert.match(cardFor(cards, 'website_status').detail, /maintenance page/);
  });

  it('flags a suspended website as needing attention', () => {
    const cards = buildOverviewCards({
      project: project({ status: ProjectStatus.SUSPENDED }),
      activeDeployment: healthy,
    });

    assert.equal(cardFor(cards, 'website_status').state, CARD_STATE.ATTENTION);
  });
});

describe('overview cards — did the last publish work', () => {
  it('reports a successful publish', () => {
    const cards = build({ latestDeployment: healthy });
    assert.equal(cardFor(cards, 'latest_publish').value, 'Successful');
  });

  it('reports one still running', () => {
    const cards = build({ latestDeployment: { status: DeploymentStatus.BUILDING } });
    assert.equal(cardFor(cards, 'latest_publish').state, CARD_STATE.WORKING);
  });

  it('reports a failure without platform vocabulary', () => {
    const cards = build({ latestDeployment: { status: DeploymentStatus.FAILED } });
    assert.equal(cardFor(cards, 'latest_publish').value, 'Did not finish');
  });

  it('says where to look after a failure', () => {
    const cards = build({ latestDeployment: { status: DeploymentStatus.FAILED } });
    assert.match(cardFor(cards, 'latest_publish').detail, /see what stopped/);
  });
});

describe('overview cards — where the code comes from', () => {
  it('names the repository', () => {
    const cards = build({ repository });
    assert.equal(cardFor(cards, 'source').value, 'henson/hellouniversity');
  });

  it('names the branch being published', () => {
    const cards = build({ repository });
    assert.equal(cardFor(cards, 'source').detail, 'on main');
  });

  it('flags a website with no code connected', () => {
    const cards = build({});
    assert.equal(cardFor(cards, 'source').state, CARD_STATE.ATTENTION);
  });
});

describe('overview cards — automatic publishing', () => {
  it('reports it on', () => {
    const cards = buildOverviewCards({
      project: project({ deploymentMode: DeploymentMode.AUTOMATIC }),
    });

    assert.equal(cardFor(cards, 'automatic_publishing').value, 'On');
  });

  it('explains what off means', () => {
    const cards = build({});
    assert.match(cardFor(cards, 'automatic_publishing').detail, /publish each change yourself/);
  });

  it('avoids webhook vocabulary', () => {
    const cards = build({});
    assert.doesNotMatch(cardFor(cards, 'automatic_publishing').detail, /webhook|hook/i);
  });
});

describe('overview cards — your domain', () => {
  it('names a connected domain', () => {
    const cards = build({
      domains: [
        {
          status: DomainStatus.ACTIVE,
          hostnameNormalized: 'hellouniversity.online',
          routingState: DomainRoutingState.LIVE,
        },
      ],
    });

    assert.equal(cardFor(cards, 'domain').value, 'hellouniversity.online');
  });

  it('invites the owner to connect one when there is none', () => {
    const cards = build({});
    assert.match(cardFor(cards, 'domain').detail, /your own web address/);
  });

  it('reports a domain still being set up as in progress', () => {
    const cards = build({ domains: [{ status: DomainStatus.PENDING_VERIFICATION }] });
    assert.equal(cardFor(cards, 'domain').state, CARD_STATE.WORKING);
  });

  it('does not report a failed domain as still connecting', () => {
    // It has given up; waiting longer will not help.
    const cards = build({
      domains: [{ status: DomainStatus.FAILED, hostnameNormalized: 'hellouniversity.online' }],
    });

    assert.equal(cardFor(cards, 'domain').state, CARD_STATE.ATTENTION);
  });

  it('names the failed domain rather than describing it vaguely', () => {
    const cards = build({
      domains: [{ status: DomainStatus.FAILED, hostnameNormalized: 'hellouniversity.online' }],
    });

    assert.equal(cardFor(cards, 'domain').value, 'hellouniversity.online');
  });

  it('says where to go about a failed domain', () => {
    const cards = build({
      domains: [{ status: DomainStatus.FAILED, hostnameNormalized: 'hellouniversity.online' }],
    });

    assert.match(cardFor(cards, 'domain').detail, /did not finish/);
  });

  it('still reports a genuinely in-progress domain as in progress', () => {
    const cards = build({ domains: [{ status: DomainStatus.VERIFYING }] });
    assert.equal(cardFor(cards, 'domain').state, CARD_STATE.WORKING);
  });

  it('does not let an old failure hide a domain still being set up', () => {
    // A failure left unremoved must not outrank work in progress.
    const cards = build({
      domains: [
        { status: DomainStatus.VERIFYING, hostnameNormalized: 'new.example' },
        { status: DomainStatus.FAILED, hostnameNormalized: 'old.example' },
      ],
    });

    assert.equal(cardFor(cards, 'domain').state, CARD_STATE.WORKING);
  });

  it('still prefers a connected domain over any other', () => {
    const cards = build({
      domains: [
        { status: DomainStatus.ACTIVE, hostnameNormalized: 'live.example', routingState: 'LIVE' },
        { status: DomainStatus.FAILED, hostnameNormalized: 'old.example' },
      ],
    });

    assert.equal(cardFor(cards, 'domain').value, 'live.example');
  });

  it('names the navigation item the owner will actually look for', () => {
    const cards = build({
      domains: [{ status: DomainStatus.FAILED, hostnameNormalized: 'old.example' }],
    });

    assert.match(cardFor(cards, 'domain').detail, /Open Domains/);
  });

  it('does not claim a routed domain is reachable when DNS points elsewhere', () => {
    // Routing being ACTIVE inside nginx says nothing about public DNS.
    const cards = build({
      domains: [
        {
          status: DomainStatus.ACTIVE,
          hostnameNormalized: 'hellouniversity.online',
          routingState: DomainRoutingState.NOT_POINTED,
        },
      ],
    });

    assert.equal(cardFor(cards, 'domain').state, CARD_STATE.ATTENTION);
  });

  it('explains that the domain is not pointing here yet', () => {
    const cards = build({
      domains: [
        {
          status: DomainStatus.ACTIVE,
          hostnameNormalized: 'hellouniversity.online',
          routingState: DomainRoutingState.NOT_POINTED,
        },
      ],
    });

    assert.match(cardFor(cards, 'domain').detail, /not pointing here/);
  });
});

describe('overview cards — vocabulary', () => {
  it('never names a container, port or proxy', () => {
    const cards = build({
      repository,
      activeDeployment: healthy,
      latestDeployment: healthy,
      domains: [
        { status: DomainStatus.ACTIVE, hostnameNormalized: 'x.test', routingState: 'LIVE' },
      ],
    });

    const text = cards.map((card) => `${card.label} ${card.value} ${card.detail ?? ''}`).join(' ');
    assert.doesNotMatch(text, /container|nginx|proxy|port|pm2|certificate/i);
  });
});

describe('relative publish time', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('says just now for the last minute', () => {
    assert.equal(relativeTime(new Date('2026-09-26T11:59:30Z'), now), 'just now');
  });

  it('counts minutes', () => {
    assert.equal(relativeTime(new Date('2026-09-26T11:58:00Z'), now), '2 minutes ago');
  });

  it('uses the singular for one hour', () => {
    assert.equal(relativeTime(new Date('2026-09-26T11:00:00Z'), now), '1 hour ago');
  });

  it('counts days', () => {
    assert.equal(relativeTime(new Date('2026-09-24T12:00:00Z'), now), '2 days ago');
  });

  it('says nothing when there is no timestamp', () => {
    assert.equal(relativeTime(null, now), null);
  });
});
