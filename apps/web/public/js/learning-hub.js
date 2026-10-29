/* Learning Hub progressive enhancement. Every page reads fully without it. */
(function () {
  'use strict';

  const WIDE_LAYOUT = '(min-width: 75rem)';
  const status = createStatusRegion();

  const article = document.querySelector('[data-article-id]');

  openTableOfContentsOnWideScreens();
  addCopyButtons();
  enhanceShareRows();
  recordViewWhenVisible();

  function createStatusRegion() {
    const region = document.createElement('p');
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
    return region;
  }

  function announce(message) {
    status.textContent = '';
    window.setTimeout(() => {
      status.textContent = message;
    }, 50);
  }

  function openTableOfContentsOnWideScreens() {
    const toc = document.querySelector('[data-hub-toc]');
    if (!toc || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia(WIDE_LAYOUT);
    const sync = function () {
      toc.open = query.matches;
    };
    sync();
    if (query.addEventListener) {
      query.addEventListener('change', sync);
    }
  }

  function addCopyButtons() {
    const blocks = document.querySelectorAll('[data-code-block]');
    Array.prototype.forEach.call(blocks, (block) => {
      const code = block.querySelector('code');
      if (!code) {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-block__copy';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy ' + block.getAttribute('data-language') + ' code');
      button.addEventListener('click', () => {
        copyText(code.textContent).then(
          () => {
            button.textContent = 'Copied';
            announce('Code copied to clipboard.');
            window.setTimeout(() => {
              button.textContent = 'Copy';
            }, 2000);
          },
          () => {
            selectContents(code);
            announce('Copy is not available. The code is selected; press Control+C or Command+C.');
          },
        );
      });
      block.setAttribute('data-has-copy', '');
      block.insertBefore(button, block.firstChild);
    });
  }

  function csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function postBeacon(endpoint, body) {
    if (!endpoint) {
      return;
    }
    fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(body || {}),
    }).catch(() => {
      // Counting is best effort; a lost beacon must never disturb reading.
    });
  }

  // Prerendered or background tabs are not counted until actually shown.
  function recordViewWhenVisible() {
    const endpoint = article && article.getAttribute('data-view-endpoint');
    if (!endpoint) {
      return;
    }
    const send = () => postBeacon(endpoint);
    if (document.visibilityState === 'visible') {
      send();
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVisible);
        send();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
  }

  function enhanceShareRows() {
    const shareEndpoint = article && article.getAttribute('data-share-endpoint');
    const rows = document.querySelectorAll('[data-share-row]');
    Array.prototype.forEach.call(rows, (row) => {
      const url = row.getAttribute('data-share-url');
      const title = row.getAttribute('data-share-title');
      const fallback = row.querySelector('[data-share-fallback]');
      row.querySelector('[data-share-copy-item]').hidden = false;
      if (navigator.share) {
        row.querySelector('[data-share-native-item]').hidden = false;
      }

      row.addEventListener('click', (event) => {
        const control = event.target.closest('[data-share-platform]');
        if (!control) {
          return;
        }
        const platform = control.getAttribute('data-share-platform');
        // Records the click only; whether the reader finished sharing is unknown.
        postBeacon(shareEndpoint, { platform });

        if (platform === 'copy') {
          copyText(url).then(
            () => announce('Link copied to clipboard.'),
            () => {
              fallback.hidden = false;
              const input = fallback.querySelector('input');
              input.focus();
              input.select();
              announce('Copy is not available. The link is selected; copy it manually.');
            },
          );
        }
        if (platform === 'native') {
          navigator.share({ title, url }).catch(() => {
            // Dismissing the share sheet rejects; nothing to report.
          });
        }
      });
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('Clipboard unavailable'));
  }

  function selectContents(element) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }
})();
