import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { handleForgotPassword } = await import('../../apps/web/src/controllers/auth.controller.js');

function response() {
  return {
    rendered: null,
    redirected: null,
    render(view, data) {
      this.rendered = { view, data };
    },
    redirect(location) {
      this.redirected = location;
    },
  };
}

function request(body) {
  return {
    body,
    ip: '203.0.113.10',
    correlationId: 'reset-correlation',
    session: {
      save(callback) {
        callback();
      },
    },
  };
}

describe('password reset controller', () => {
  it('does not run Turnstile or reset initiation when the email is invalid', async () => {
    let turnstileCalls = 0;
    let resetCalls = 0;
    const req = request({ email: 'not-an-email' });
    const res = response();

    await handleForgotPassword(req, res, {
      verifyTurnstile: async () => {
        turnstileCalls += 1;
      },
      initiateReset: async () => {
        resetCalls += 1;
      },
    });

    assert.equal(turnstileCalls, 0);
    assert.equal(resetCalls, 0);
    assert.equal(res.rendered.view, 'pages/auth/forgot-password');
    assert.equal(res.rendered.data.values.email, 'not-an-email');
  });

  it('fails closed and preserves the email when Turnstile rejects the request', async () => {
    let resetCalls = 0;
    let turnstileInput;
    const req = request({
      email: 'User@Example.test',
      'cf-turnstile-response': 'browser-token',
    });
    const res = response();

    await handleForgotPassword(req, res, {
      verifyTurnstile: async (input) => {
        turnstileInput = input;
        return false;
      },
      initiateReset: async () => {
        resetCalls += 1;
      },
    });

    assert.deepEqual(turnstileInput, {
      token: 'browser-token',
      sourceIp: '203.0.113.10',
      expectedAction: 'forgot-password',
    });
    assert.equal(resetCalls, 0);
    assert.match(res.rendered.data.errors.form, /Bot protection check failed/);
    assert.equal(res.rendered.data.values.email, 'User@Example.test');
  });

  it('initiates the reset and redirects neutrally after Turnstile passes', async () => {
    let resetInput;
    const req = request({
      email: ' User@Example.test ',
      'cf-turnstile-response': 'browser-token',
    });
    const res = response();

    await handleForgotPassword(req, res, {
      verifyTurnstile: async () => true,
      initiateReset: async (input) => {
        resetInput = input;
      },
    });

    assert.deepEqual(resetInput, {
      email: 'user@example.test',
      sourceIp: '203.0.113.10',
      correlationId: 'reset-correlation',
    });
    assert.equal(req.session.passwordResetEmail, 'user@example.test');
    assert.equal(res.redirected, '/auth/verify-reset-code');
  });
});
