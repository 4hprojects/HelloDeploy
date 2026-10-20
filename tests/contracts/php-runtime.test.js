import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BuildStrategy,
  DEFAULT_PHP_VERSION,
  RuntimeType,
  getBuildStrategyRuntime,
  isPhpBuildStrategy,
  isPilotStrategyEnabledFor,
  resolvePhpVersion,
  satisfiesComposerConstraint,
  validatePhpDocumentRoot,
} from '@hellodeploy/contracts';

describe('PHP build strategies', () => {
  it('recognizes the plain PHP and Laravel strategies', () => {
    assert.deepEqual(
      [BuildStrategy.PHP_PLAIN_V1, BuildStrategy.PHP_LARAVEL_V1].map(isPhpBuildStrategy),
      [true, true],
    );
  });

  it('requires the PHP runtime', () => {
    assert.equal(getBuildStrategyRuntime(BuildStrategy.PHP_LARAVEL_V1), RuntimeType.PHP);
  });

  it('enables PHP strategies only through the PHP pilot', () => {
    const pilots = {
      next: { enabled: true, projectIds: new Set(['p1']) },
      python: { enabled: true, projectIds: new Set(['p1']) },
      php: { enabled: false, projectIds: new Set(['p1']) },
    };
    assert.equal(isPilotStrategyEnabledFor(BuildStrategy.PHP_PLAIN_V1, 'p1', pilots), false);
  });
});

describe('satisfiesComposerConstraint', () => {
  it('accepts a caret range within the major version', () => {
    assert.equal(satisfiesComposerConstraint('8.4', '^8.2'), true);
  });

  it('rejects a version below a caret range', () => {
    assert.equal(satisfiesComposerConstraint('8.3', '^8.4'), false);
  });

  it('treats a two-part tilde as a minimum within the major version', () => {
    assert.equal(satisfiesComposerConstraint('8.4', '~8.3'), true);
  });

  it('treats a three-part tilde as a minimum within the minor version', () => {
    assert.equal(satisfiesComposerConstraint('8.4', '~8.3.1'), false);
  });

  it('combines AND ranges and OR alternatives', () => {
    assert.equal(satisfiesComposerConstraint('8.3', '>=8.1 <8.4 || ^9.0'), true);
  });

  it('honors an exclusive upper bound', () => {
    assert.equal(satisfiesComposerConstraint('8.4', '>=8.2,<8.4'), false);
  });

  it('accepts a hyphen range', () => {
    assert.equal(satisfiesComposerConstraint('8.3', '8.1 - 8.3'), true);
  });

  it('rejects a version above a hyphen range', () => {
    assert.equal(satisfiesComposerConstraint('8.4', '8.1 - 8.3'), false);
  });

  // CodeQL js/polynomial-redos: whitespace runs must stay linear.
  it('evaluates a constraint with long whitespace runs in linear time', () => {
    const started = performance.now();
    satisfiesComposerConstraint('8.3', `>=8.1${' '.repeat(200_000)}-`);
    assert.ok(performance.now() - started < 100);
  });

  it('matches a wildcard minor version', () => {
    assert.equal(satisfiesComposerConstraint('8.3', '8.3.*'), true);
  });
});

describe('resolvePhpVersion', () => {
  it('uses the default version without composer.json', () => {
    assert.deepEqual(resolvePhpVersion(null), { version: DEFAULT_PHP_VERSION, error: null });
  });

  it('chooses the newest approved version the constraint allows', () => {
    assert.deepEqual(resolvePhpVersion(JSON.stringify({ require: { php: '^8.2' } })), {
      version: '8.4',
      error: null,
    });
  });

  it('chooses an older approved version when the constraint caps it', () => {
    assert.deepEqual(resolvePhpVersion(JSON.stringify({ require: { php: '>=8.1 <8.4' } })), {
      version: '8.3',
      error: null,
    });
  });

  it('explains a constraint no approved version satisfies', () => {
    assert.match(
      resolvePhpVersion(JSON.stringify({ require: { php: '^7.4' } })).error,
      /8\.3, 8\.4/,
    );
  });

  it('rejects composer.json that is not valid JSON', () => {
    assert.match(resolvePhpVersion('{').error, /composer\.json is not valid JSON/);
  });
});

describe('validatePhpDocumentRoot', () => {
  it('accepts the repository root and public folder', () => {
    assert.deepEqual(['.', 'public'].map(validatePhpDocumentRoot), [null, null]);
  });

  it('rejects any other folder', () => {
    assert.match(validatePhpDocumentRoot('web'), /\. or public/);
  });
});
