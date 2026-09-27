import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTACT_CATEGORIES,
  validateContactMessage,
} from '../../apps/web/src/validators/contact.validator.js';

const VALID = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  category: 'BUG',
  subject: 'Deployment fails at build',
  message: 'It stops after installing dependencies.',
};

describe('contact message validation', () => {
  it('accepts a complete submission', () => {
    assert.equal(validateContactMessage(VALID).hasErrors, false);
  });

  it('normalises the email address to lower case', () => {
    assert.equal(validateContactMessage(VALID).values.email, 'ada@example.com');
  });

  it('requires a name', () => {
    assert.equal(
      validateContactMessage({ ...VALID, name: '  ' }).errors.name,
      'Your name is required.',
    );
  });

  it('rejects an address that is not an email', () => {
    assert.equal(
      validateContactMessage({ ...VALID, email: 'not-an-email' }).errors.email,
      'Enter a valid email address.',
    );
  });

  it('rejects a category that is not on the list', () => {
    assert.equal(
      validateContactMessage({ ...VALID, category: 'ARBITRARY' }).errors.category,
      'Choose a category from the list.',
    );
  });

  it('rejects a newline in the subject, which reaches an email header', () => {
    assert.equal(
      validateContactMessage({ ...VALID, subject: 'Hi\nBcc: victim@example.com' }).errors.subject,
      'Subject must be a single line.',
    );
  });

  it('requires a message', () => {
    assert.equal(
      validateContactMessage({ ...VALID, message: '' }).errors.message,
      'A message is required.',
    );
  });

  it('rejects a message beyond the length limit', () => {
    assert.match(
      validateContactMessage({ ...VALID, message: 'x'.repeat(5001) }).errors.message,
      /must not exceed 5000 characters/,
    );
  });

  it('treats the optional project address as optional', () => {
    assert.equal(validateContactMessage({ ...VALID, projectUrl: '' }).hasErrors, false);
  });

  it('returns the submitted values so the form can be redisplayed', () => {
    assert.equal(validateContactMessage(VALID).values.subject, VALID.subject);
  });
});

describe('contact categories', () => {
  it('gives every category a distinct value', () => {
    const values = CONTACT_CATEGORIES.map((category) => category.value);

    assert.equal(new Set(values).size, values.length);
  });

  it('gives every category a label for the select control', () => {
    assert.deepEqual(
      CONTACT_CATEGORIES.filter((category) => !category.label),
      [],
    );
  });
});
