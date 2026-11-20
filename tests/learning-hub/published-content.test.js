import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createContentRepository } from '../../apps/web/src/services/learning-hub/content-repository.js';

const repository = createContentRepository();
const articles = repository.listPublished();

async function pngSize(publicPath) {
  const bytes = await readFile(new URL(`../../apps/web/public${publicPath}`, import.meta.url));
  return {
    isPng: bytes.readUInt32BE(0) === 0x89504e47,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('Published Learning Hub articles', () => {
  it('validate without errors', () => {
    assert.deepEqual(repository.errors, []);
  });

  it('include the launch tutorials and the cybersecurity series', () => {
    assert.deepEqual(articles.map((article) => article.slug).sort(), [
      'ai-agent-security-deployment',
      'ai-powered-cyberattacks',
      'backups-disaster-recovery-self-hosted',
      'github-actions-security',
      'host-website-old-laptop-ubuntu',
      'how-to-deploy-nodejs-app',
      'npm-supply-chain-security',
      'owasp-top-10-2025',
      'pm2-nginx-nodejs-production',
      'protect-environment-variables-api-keys',
      'secure-nginx-nodejs-ubuntu',
      'secure-nodejs-before-production',
      'self-hosting-vs-cloud-hosting',
      'what-is-devsecops',
      'zero-trust-security-developers',
    ]);
  });

  for (const article of articles) {
    it(`${article.slug} has a 1200×630 PNG social image`, async () => {
      assert.deepEqual(await pngSize(article.socialImage), {
        isPng: true,
        width: 1200,
        height: 630,
      });
    });

    it(`${article.slug} cites references`, () => {
      assert.ok(article.references.length >= 3);
    });

    it(`${article.slug} links to another guide`, () => {
      assert.ok(article.links.some((href) => /^\/blog\/[a-z0-9-]+$/.test(href)));
    });

    it(`${article.slug} has no ads enabled`, () => {
      assert.equal(article.adEligible, false);
    });
  }
});
