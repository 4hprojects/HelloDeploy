/* Loaded on pages that carry Google ads or analytics. Every control stays
   hidden until this script runs, so nothing is offered that cannot work. */
(function () {
  'use strict';

  const OPT_OUT_KEY = 'hd-analytics-off';

  enablePrivacySettings();
  enableAnalyticsToggle();
  trackSignUpClicks();

  // Google's consent message can be reopened only where it applies (EEA, UK,
  // Switzerland); everyone else is sent to the analytics opt-out instead.
  function enablePrivacySettings() {
    const button = document.querySelector('[data-privacy-settings]');
    if (!button) {
      return;
    }
    button.hidden = false;
    button.addEventListener('click', () => {
      if (typeof window.__tcfapi !== 'function') {
        window.location.assign('/cookies#analytics');
        return;
      }
      window.__tcfapi('getTCData', 2, (data) => {
        if (!data || !data.gdprApplies) {
          window.location.assign('/cookies#analytics');
          return;
        }
        window.googlefc = window.googlefc || {};
        window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
        window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
      });
    });
  }

  function enableAnalyticsToggle() {
    const button = document.querySelector('[data-analytics-toggle]');
    const status = document.querySelector('[data-analytics-toggle-status]');
    if (!button || !status) {
      return;
    }
    const measurementId = button.getAttribute('data-measurement-id');
    const render = (isOff) => {
      button.textContent = isOff ? 'Turn analytics back on' : 'Turn off analytics';
      status.textContent = isOff
        ? 'Analytics is off on this browser.'
        : 'Analytics is on for this browser.';
    };
    render(readOptOut());
    button.hidden = false;
    button.addEventListener('click', () => {
      const isOff = !readOptOut();
      try {
        if (isOff) {
          localStorage.setItem(OPT_OUT_KEY, '1');
        } else {
          localStorage.removeItem(OPT_OUT_KEY);
        }
      } catch {
        status.textContent = 'This browser blocks site storage, so the choice cannot be saved.';
        return;
      }
      window['ga-disable-' + measurementId] = isOff;
      render(isOff);
    });
  }

  function readOptOut() {
    try {
      return localStorage.getItem(OPT_OUT_KEY) === '1';
    } catch {
      return false;
    }
  }

  // Fixed labels only: the page path already reaches GA4 with the page view.
  function trackSignUpClicks() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href="/auth/create-account"]');
      if (!link || typeof window.gtag !== 'function') {
        return;
      }
      window.gtag('event', 'sign_up_click', {
        link_location: link.closest('header') ? 'header' : 'page',
      });
    });
  }
})();
