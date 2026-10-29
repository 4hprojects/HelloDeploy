/* Learning Hub progressive enhancement. Every page reads fully without it. */
(function () {
  'use strict';

  const WIDE_LAYOUT = '(min-width: 75rem)';
  const status = createStatusRegion();

  openTableOfContentsOnWideScreens();
  addCopyButtons();

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
