/* Loaded only on pages that show ads. Reopens Google's consent message, which
   the ad script loads; queuing the call works before and after it arrives. */
(function () {
  'use strict';

  const button = document.querySelector('[data-ad-privacy-settings]');
  if (!button) {
    return;
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
  });
})();
