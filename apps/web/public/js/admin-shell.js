// Admin shell: collapsible sidebar, saved per administrator on the server so
// the next admin page renders in the same state without a flash.
(function () {
  'use strict';

  const button = document.querySelector('[data-sidebar-collapse]');
  const layout = document.querySelector('.layout');
  const csrf = document.querySelector('meta[name="csrf-token"]');
  if (!button || !layout) {
    return;
  }

  function labelLinks(collapsed) {
    document.querySelectorAll('.sidebar__link').forEach((link) => {
      if (collapsed) {
        link.setAttribute('title', link.textContent.replace(/\s+/g, ' ').trim());
      } else {
        link.removeAttribute('title');
      }
    });
  }

  function apply(collapsed) {
    layout.classList.toggle('layout--sidebar-collapsed', collapsed);
    const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    labelLinks(collapsed);
  }

  labelLinks(layout.classList.contains('layout--sidebar-collapsed'));

  button.addEventListener('click', () => {
    const collapsed = !layout.classList.contains('layout--sidebar-collapsed');
    apply(collapsed);
    fetch('/admin/preferences/sidebar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf ? csrf.getAttribute('content') : '',
      },
      body: JSON.stringify({ collapsed }),
    }).catch(() => {
      // The layout already changed; it is only not remembered for next time.
    });
  });
})();
