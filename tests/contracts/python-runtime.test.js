import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BuildStrategy,
  DEFAULT_PYTHON_VERSION,
  RuntimeType,
  getBuildStrategyRuntime,
  isPythonBuildStrategy,
  parsePythonRequirementNames,
  resolvePythonVersion,
  validateApplicationModule,
} from '@hellodeploy/contracts';

describe('Python build strategies', () => {
  it('recognizes each Python framework strategy', () => {
    assert.deepEqual(
      [
        BuildStrategy.PYTHON_FLASK_V1,
        BuildStrategy.PYTHON_FASTAPI_V1,
        BuildStrategy.PYTHON_DJANGO_V1,
      ].map(isPythonBuildStrategy),
      [true, true, true],
    );
  });

  it('does not treat Next.js strategies as Python', () => {
    assert.equal(isPythonBuildStrategy(BuildStrategy.NEXT_STANDARD_V1), false);
  });

  it('requires the PYTHON runtime for Python strategies', () => {
    assert.equal(getBuildStrategyRuntime(BuildStrategy.PYTHON_DJANGO_V1), RuntimeType.PYTHON);
  });

  it('requires the NEXTJS runtime for Next.js strategies', () => {
    assert.equal(getBuildStrategyRuntime(BuildStrategy.NEXT_EXPORT_V1), RuntimeType.NEXTJS);
  });

  it('leaves the legacy strategy unbound to a runtime', () => {
    assert.equal(getBuildStrategyRuntime(BuildStrategy.LEGACY_GENERATED), null);
  });
});

describe('validateApplicationModule', () => {
  it('accepts a dotted module with an attribute', () => {
    assert.equal(validateApplicationModule('mysite.wsgi:application'), null);
  });

  it('rejects a module without an attribute', () => {
    assert.match(validateApplicationModule('main'), /module:attribute/);
  });

  it('rejects shell syntax', () => {
    assert.match(validateApplicationModule('main:app; rm -rf /'), /module:attribute/);
  });

  it('rejects a factory call', () => {
    assert.match(validateApplicationModule('app:create_app()'), /module:attribute/);
  });

  it('rejects values over 200 characters', () => {
    assert.match(validateApplicationModule(`${'a'.repeat(200)}:app`), /200 characters/);
  });
});

describe('resolvePythonVersion', () => {
  it('uses the default version when no .python-version file exists', () => {
    assert.deepEqual(resolvePythonVersion(null), { version: DEFAULT_PYTHON_VERSION, error: null });
  });

  it('reduces a patch version to its approved minor version', () => {
    assert.deepEqual(resolvePythonVersion('3.12.7\n'), { version: '3.12', error: null });
  });

  it('ignores comments and blank lines', () => {
    assert.deepEqual(resolvePythonVersion('# pinned\n\n3.13\n'), { version: '3.13', error: null });
  });

  it('rejects an unapproved version with the supported list', () => {
    assert.match(resolvePythonVersion('3.9').error, /3\.12, 3\.13/);
  });

  it('rejects a non-CPython interpreter name', () => {
    assert.match(resolvePythonVersion('pypy3.10').error, /not a supported Python version/);
  });
});

describe('parsePythonRequirementNames', () => {
  it('normalizes names and drops version specifiers, extras, and markers', () => {
    const names = parsePythonRequirementNames(
      'Django==5.1.2\nuvicorn[standard]>=0.30 ; python_version >= "3.12"\nFlask_Login~=0.6\n',
    );
    assert.deepEqual([...names], ['django', 'uvicorn', 'flask-login']);
  });

  it('skips comments, options, and includes', () => {
    const names = parsePythonRequirementNames(
      '# web\n--index-url https://example.test/simple\n-r base.txt\ngunicorn  # server\n',
    );
    assert.deepEqual([...names], ['gunicorn']);
  });
});
