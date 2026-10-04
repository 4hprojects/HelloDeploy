/* Installation and worker lifecycle stay independent of page workflows. */
(() => {
  const buttons = [...document.querySelectorAll('[data-pwa-install]')];
  const offline = document.getElementById('pwa-offline');
  const update = document.getElementById('pwa-update');
  const help = document.getElementById('pwa-help');
  const standalone = window.matchMedia('(display-mode: standalone)');
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Other iOS browsers get generic installation help, not Safari-specific claims.
  const iosSafari =
    ios &&
    /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  let installed = standalone.matches || navigator.standalone === true;
  let prompt = null;
  let waiting = null;
  let updateRequested = false;
  let reloaded = false;
  let refreshAvailable = false;
  let dirty = false;

  function syncInstall() {
    installed = installed || standalone.matches || navigator.standalone === true;
    buttons.forEach((button) => {
      button.hidden = installed || (!prompt && !iosSafari);
    });
  }
  function showHelp() {
    if (!help) {
      return;
    }
    help.querySelector('[data-ios-guide]').hidden = !iosSafari || installed;
    help.querySelector('[data-browser-guide]').hidden = iosSafari && !installed;
    // Close a mobile drawer before opening the native modal so focus is not trapped behind it.
    const toggle = document.getElementById('sidebar-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'true') {
      toggle.click();
    }
    help.showModal();
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
    syncInstall();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    prompt = null;
    syncInstall();
  });
  standalone.addEventListener('change', syncInstall);
  buttons.forEach((button) =>
    button.addEventListener('click', async () => {
      if (installed) {
        return;
      }
      if (!prompt) {
        showHelp();
        return;
      }
      const toggle = document.getElementById('sidebar-toggle');
      if (toggle?.getAttribute('aria-expanded') === 'true') {
        toggle.click();
      }
      const pending = prompt;
      prompt = null;
      syncInstall();
      try {
        await pending.prompt();
        const choice = await pending.userChoice;
        if (choice.outcome === 'accepted') {
          installed = true;
        }
      } catch {
        // Browser dismissal or an expired prompt must leave normal navigation usable.
      }
      syncInstall();
    }),
  );
  document
    .querySelectorAll('[data-pwa-help]')
    .forEach((button) => button.addEventListener('click', showHelp));
  syncInstall();

  function syncOnline() {
    if (offline) {
      offline.hidden = navigator.onLine;
    }
  }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();
  document.addEventListener('input', (event) => {
    if (event.target.closest('form:not([method="dialog"])')) {
      dirty = true;
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest('form:not([method="dialog"])')) {
      dirty = true;
    }
  });
  document.getElementById('pwa-update-later')?.addEventListener('click', () => {
    update.hidden = true;
  });
  document.getElementById('pwa-update-now')?.addEventListener('click', () => {
    if ((!waiting && !refreshAvailable) || updateRequested) {
      return;
    }
    if (dirty && !window.confirm('Updating will discard unsaved form changes. Update now?')) {
      return;
    }
    updateRequested = true;
    if (refreshAvailable) {
      reloaded = true;
      window.location.reload();
    } else {
      waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    }
  });
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (!('serviceWorker' in navigator) || (!local && window.location.protocol !== 'https:')) {
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Another tab may activate the worker. Never reload this tab without its consent.
    if (updateRequested && !reloaded) {
      reloaded = true;
      window.location.reload();
    } else if (waiting) {
      waiting = null;
      refreshAvailable = true;
      update.hidden = false;
    }
  });
  navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((registration) => {
      function offerUpdate() {
        if (registration.waiting && navigator.serviceWorker.controller) {
          waiting = registration.waiting;
          update.hidden = false;
        }
      }
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', offerUpdate);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    })
    .catch(() => {
      // Installation support is optional; ordinary online use must keep working.
    });
})();
