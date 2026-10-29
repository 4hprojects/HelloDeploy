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
  enhanceCommentForm();
  renderVerificationWidgets();
  trackRelatedClicks();

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

  // GA4 events carry the article id and a fixed label only: never names,
  // comment text, URLs typed by readers, or visitor identifiers.
  function track(name, params) {
    if (typeof window.gtag !== 'function' || !article) {
      return;
    }
    window.gtag(
      'event',
      name,
      Object.assign({ article_id: article.getAttribute('data-article-id') }, params),
    );
  }

  function trackRelatedClicks() {
    const related = document.querySelector('.hub-related');
    if (!related) {
      return;
    }
    related.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        track('related_click', {});
      }
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
        track(platform === 'copy' ? 'article_copy_link' : 'article_share_click', { platform });

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

  function enhanceCommentForm() {
    const form = document.querySelector('[data-comment-form]');
    if (!form) {
      return;
    }
    const error = form.querySelector('[data-form-error]');
    if (error) {
      error.focus();
      track('comment_submit_outcome', { outcome: 'refused' });
    }
    if (/^#comment-[a-f0-9]{24}$/.test(window.location.hash)) {
      track('comment_submit_outcome', { outcome: 'published' });
    }
    const body = form.querySelector('textarea[name="body"]');
    const key = form.getAttribute('data-draft-key');
    const storage = safeSessionStorage();
    if (!storage || !body) {
      return;
    }
    // A redirect to a new comment's anchor means the last draft was published.
    if (/^#comment-[a-f0-9]{24}$/.test(window.location.hash)) {
      storage.removeItem(key);
    } else if (!body.value && storage.getItem(key)) {
      body.value = storage.getItem(key);
    }
    body.addEventListener('input', () => {
      storage.setItem(key, body.value);
    });
  }

  function safeSessionStorage() {
    try {
      const storage = window.sessionStorage;
      storage.setItem('lh-probe', '1');
      storage.removeItem('lh-probe');
      return storage;
    } catch {
      return null;
    }
  }

  // Turnstile renders explicitly: the comment form's widget on load, each
  // report form's widget only when that report panel is opened.
  function renderVerificationWidgets() {
    const widgets = document.querySelectorAll('[data-turnstile]');
    if (widgets.length === 0) {
      return;
    }
    whenTurnstileReady((turnstile) => {
      const render = (element) => {
        if (element.hasAttribute('data-rendered')) {
          return;
        }
        element.setAttribute('data-rendered', '');
        turnstile.render(element, {
          sitekey: element.getAttribute('data-sitekey'),
          action: element.getAttribute('data-action'),
          size: 'flexible',
          theme: 'auto',
        });
      };
      Array.prototype.forEach.call(widgets, (element) => {
        if (element.hasAttribute('data-turnstile-eager')) {
          render(element);
          return;
        }
        const panel = element.closest('details');
        if (panel) {
          panel.addEventListener('toggle', () => {
            if (panel.open) {
              render(element);
            }
          });
        }
      });
    });
  }

  function whenTurnstileReady(callback, attempt = 0) {
    if (window.turnstile) {
      callback(window.turnstile);
      return;
    }
    if (attempt < 100) {
      window.setTimeout(() => whenTurnstileReady(callback, attempt + 1), 100);
    }
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
