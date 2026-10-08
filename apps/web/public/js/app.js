(function () {
  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) {
      return;
    }

    function syncThemeToggle() {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'light';
      const isDark = current === 'dark';
      const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('aria-label', label);
      btn.setAttribute('data-tooltip', label);
    }

    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      if (window.__setHelloDeployTheme) {
        window.__setHelloDeployTheme(next, true);
      } else {
        root.setAttribute('data-theme', next);
        try {
          localStorage.setItem('hd-theme', next);
        } catch {
          // Ignore storage failures in privacy-restricted browsers.
        }
      }
      syncThemeToggle();
    });

    window.addEventListener('hellodeploy:themechange', syncThemeToggle);
    syncThemeToggle();
  }

  function initPublicNav() {
    const toggle = document.getElementById('public-nav-toggle');
    const links = document.getElementById('public-nav');
    if (!toggle || !links) {
      return;
    }

    function setOpen(open) {
      links.classList.toggle('header__links--open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', () => {
      setOpen(!links.classList.contains('header__links--open'));
    });

    // In-page anchors (Product, How It Works) don't navigate away, so close explicitly.
    links.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('header__links--open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    window.matchMedia('(min-width: 64rem)').addEventListener('change', (e) => {
      if (e.matches) {
        setOpen(false);
      }
    });
  }

  function initSidebarDrawer() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const main = document.getElementById('main-content');
    const mobileQuery = window.matchMedia('(max-width: 48rem)');

    if (!sidebarToggle || !sidebar || !backdrop) {
      return;
    }

    function focusableSidebarItems() {
      return Array.prototype.slice.call(
        sidebar.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function setDrawerOpen(open, restoreFocus) {
      if (open && !mobileQuery.matches) {
        return;
      }

      sidebar.classList.toggle('sidebar--open', open);
      backdrop.hidden = !open;
      sidebarToggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('sidebar-drawer-open', open);

      if (open) {
        sidebar.removeAttribute('aria-hidden');
        if (main) {
          main.setAttribute('inert', '');
        }
        const firstItem = focusableSidebarItems()[0];
        if (firstItem) {
          firstItem.focus();
        }
        return;
      }

      if (main) {
        main.removeAttribute('inert');
      }
      if (mobileQuery.matches) {
        sidebar.setAttribute('aria-hidden', 'true');
      } else {
        sidebar.removeAttribute('aria-hidden');
      }
      if (restoreFocus) {
        sidebarToggle.focus();
      }
    }

    function syncDrawerForViewport() {
      setDrawerOpen(false, false);
      if (mobileQuery.matches) {
        sidebar.setAttribute('aria-hidden', 'true');
      } else {
        sidebar.removeAttribute('aria-hidden');
      }
    }

    sidebarToggle.addEventListener('click', () => {
      setDrawerOpen(!sidebar.classList.contains('sidebar--open'), true);
    });

    backdrop.addEventListener('click', () => {
      setDrawerOpen(false, true);
    });

    sidebar.addEventListener('click', (e) => {
      if (mobileQuery.matches && e.target.closest('a[href]')) {
        setDrawerOpen(false, false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!sidebar.classList.contains('sidebar--open')) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawerOpen(false, true);
        return;
      }

      if (e.key !== 'Tab') {
        return;
      }

      const focusable = focusableSidebarItems();
      if (focusable.length === 0) {
        e.preventDefault();
        sidebar.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', syncDrawerForViewport);
    } else if (mobileQuery.addListener) {
      mobileQuery.addListener(syncDrawerForViewport);
    }

    syncDrawerForViewport();
  }

  function initTooltips() {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-popover';
    tooltip.id = 'tooltip-popover';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    let activeTooltipTarget = null;

    function positionTooltip(target) {
      const rect = target.getBoundingClientRect();
      tooltip.hidden = false;

      const tooltipRect = tooltip.getBoundingClientRect();
      const top = rect.top - tooltipRect.height - 8;

      if (top < 8) {
        tooltip.classList.add('tooltip-popover--below');
      } else {
        tooltip.classList.remove('tooltip-popover--below');
      }
    }

    function showTooltip(target) {
      const text = target.getAttribute('data-tooltip');
      if (!text) {
        return;
      }

      activeTooltipTarget = target;
      tooltip.textContent = text;
      target.classList.add('tooltip-anchor');
      target.appendChild(tooltip);
      target.setAttribute('aria-describedby', tooltip.id);
      positionTooltip(target);
    }

    function hideTooltip(target) {
      if (target && activeTooltipTarget !== target) {
        return;
      }

      if (activeTooltipTarget) {
        activeTooltipTarget.removeAttribute('aria-describedby');
        activeTooltipTarget.classList.remove('tooltip-anchor');
      }
      activeTooltipTarget = null;
      tooltip.hidden = true;
      tooltip.textContent = '';
      document.body.appendChild(tooltip);
      tooltip.classList.remove('tooltip-popover--below');
    }

    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        showTooltip(target);
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && !target.contains(e.relatedTarget)) {
        hideTooltip(target);
      }
    });

    document.addEventListener('focusin', (e) => {
      if (e.target.matches('[data-tooltip]')) {
        showTooltip(e.target);
      }
    });

    document.addEventListener('focusout', (e) => {
      if (e.target.matches('[data-tooltip]')) {
        hideTooltip(e.target);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideTooltip();
      }
    });

    window.addEventListener(
      'scroll',
      () => {
        if (activeTooltipTarget) {
          positionTooltip(activeTooltipTarget);
        }
      },
      true,
    );

    window.addEventListener('resize', () => {
      if (activeTooltipTarget) {
        positionTooltip(activeTooltipTarget);
      }
    });
  }

  function initScrollTop() {
    const button = document.getElementById('scroll-top-button');
    if (!button) {
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const threshold = 420;

    function syncButton() {
      button.hidden = window.scrollY < threshold;
    }

    button.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
      });
    });

    window.addEventListener('scroll', syncButton, { passive: true });
    window.addEventListener('resize', syncButton);
    syncButton();
  }

  function initConfirmationModal() {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
      return;
    }

    const dialog = modal.querySelector('.confirm-modal__dialog');
    const eyebrow = modal.querySelector('.confirm-modal__eyebrow');
    const title = document.getElementById('confirm-modal-title');
    const message = document.getElementById('confirm-modal-message');
    const acceptButton = modal.querySelector('[data-confirm-accept]');
    const cancelButtons = modal.querySelectorAll('[data-confirm-cancel]');
    let pendingTarget = null;
    let pendingSubmitter = null;
    let lastFocus = null;
    let acceptLabel = 'Confirm';
    const acceptClassByVariant = {
      danger: 'button--danger',
      warning: 'button--warning',
      success: 'button--success',
    };

    function focusableElements() {
      return Array.prototype.slice
        .call(
          modal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        .filter((el) => {
          return el.offsetParent !== null || el === dialog;
        });
    }

    function closeModal() {
      modal.hidden = true;
      modal.removeAttribute('aria-busy');
      document.body.classList.remove('confirm-modal-open');
      pendingTarget = null;
      pendingSubmitter = null;
      if (acceptButton) {
        acceptButton.disabled = false;
      }
      if (lastFocus && typeof lastFocus.focus === 'function') {
        lastFocus.focus();
      }
      lastFocus = null;
    }

    function setAcceptButton(target) {
      if (!acceptButton) {
        return;
      }
      const variant = target.getAttribute('data-confirm-variant') || 'danger';
      const variantClass = acceptClassByVariant[variant] || acceptClassByVariant.danger;

      acceptLabel = target.getAttribute('data-confirm-accept-label') || 'Confirm';
      acceptButton.textContent = acceptLabel;
      acceptButton.className = 'button ' + variantClass;
      acceptButton.disabled = false;
    }

    function openModal(msg, target, trigger, attrSource) {
      // attrSource lets a specific submit button (e.g. one of several
      // actions sharing a form) override the form's own data-confirm-*
      // styling/copy — falls back to target when a single button/link/form
      // carries its own attributes directly (the common case).
      const attrs = attrSource || target;
      pendingTarget = target;
      lastFocus = trigger || document.activeElement;
      modal.removeAttribute('aria-busy');
      modal.classList.remove(
        'confirm-modal--danger',
        'confirm-modal--warning',
        'confirm-modal--success',
      );
      modal.classList.add(
        'confirm-modal--' + (attrs.getAttribute('data-confirm-variant') || 'danger'),
      );
      if (eyebrow) {
        eyebrow.textContent = attrs.getAttribute('data-confirm-eyebrow') || 'Confirm action';
      }
      if (title) {
        title.textContent = attrs.getAttribute('data-confirm-title') || 'Continue?';
      }
      message.textContent = msg;
      setAcceptButton(attrs);
      modal.hidden = false;
      document.body.classList.add('confirm-modal-open');
      requestAnimationFrame(() => {
        dialog.focus();
      });
    }

    function confirmPending() {
      if (!pendingTarget) {
        return;
      }
      const target = pendingTarget;
      const submitter =
        pendingSubmitter && pendingSubmitter.form === target ? pendingSubmitter : null;
      const attrs = submitter || target;

      modal.setAttribute('aria-busy', 'true');
      if (acceptButton) {
        acceptButton.disabled = true;
        acceptButton.textContent = attrs.getAttribute('data-confirm-pending-label') || 'Working...';
      }

      pendingTarget = null;
      pendingSubmitter = null;

      if (target.tagName === 'FORM') {
        target.setAttribute('data-confirmed', '1');
        if (target.requestSubmit) {
          target.requestSubmit(submitter || undefined);
        } else {
          target.submit();
        }
        return;
      }

      if (target.tagName === 'A' && target.href) {
        window.location.assign(target.href);
      }

      modal.hidden = true;
      document.body.classList.remove('confirm-modal-open');
    }

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-confirm]');
      if (link) {
        e.preventDefault();
        openModal(link.getAttribute('data-confirm'), link, link);
        return;
      }

      const submitter = e.target.closest('button[type="submit"], input[type="submit"]');
      if (submitter && submitter.form) {
        pendingSubmitter = submitter;
      }
    });

    document.addEventListener('submit', (e) => {
      const form = e.target;
      const submitter = e.submitter && e.submitter.form === form ? e.submitter : null;
      const msg =
        (submitter && submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
      if (!msg || form.getAttribute('data-confirmed')) {
        return;
      }
      e.preventDefault();
      pendingSubmitter = submitter || pendingSubmitter;
      openModal(msg, form, pendingSubmitter || form, submitter);
    });

    if (acceptButton) {
      acceptButton.addEventListener('click', confirmPending);
    }

    cancelButtons.forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', (e) => {
      if (modal.hidden) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }

      if (e.key !== 'Tab') {
        return;
      }

      const focusable = focusableElements();
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function initPageModal() {
    const modal = document.querySelector('[data-page-modal]');
    if (!modal) {
      return;
    }

    const dialog = modal.querySelector('.confirm-modal__dialog');
    if (!dialog) {
      return;
    }

    function focusableElements() {
      return Array.prototype.slice
        .call(
          modal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        .filter((element) => element.offsetParent !== null || element === dialog);
    }

    document.body.classList.add('confirm-modal-open');
    requestAnimationFrame(() => dialog.focus());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        window.location.assign(modal.dataset.pageModalDismissHref || '/');
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function initPendingForms() {
    function submitButtons(form) {
      return Array.prototype.slice.call(
        form.querySelectorAll('button[type="submit"], input[type="submit"]'),
      );
    }

    function pendingLabel(form, submitter) {
      if (submitter) {
        return (
          submitter.getAttribute('data-pending-label') ||
          submitter.getAttribute('data-confirm-pending-label') ||
          form.getAttribute('data-pending-label') ||
          form.getAttribute('data-confirm-pending-label') ||
          'Working...'
        );
      }
      return (
        form.getAttribute('data-pending-label') ||
        form.getAttribute('data-confirm-pending-label') ||
        'Working...'
      );
    }

    function setSubmitterText(submitter, label) {
      if (!submitter) {
        return;
      }

      if (submitter.tagName === 'INPUT') {
        if (!submitter.dataset.originalValue) {
          submitter.dataset.originalValue = submitter.value;
        }
        submitter.value = label;
        return;
      }

      if (!submitter.dataset.originalText) {
        submitter.dataset.originalText = submitter.textContent;
      }
      submitter.textContent = label;
    }

    function preserveSubmitterValue(form, submitter) {
      if (!submitter?.name) {
        return;
      }

      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = submitter.name;
      field.value = submitter.value;
      field.setAttribute('data-preserved-submitter', '');
      form.appendChild(field);
    }

    document.addEventListener('submit', (e) => {
      if (e.defaultPrevented) {
        return;
      }

      const form = e.target;
      if (!form || form.tagName !== 'FORM' || form.getAttribute('data-pending') === 'off') {
        return;
      }

      if (form.getAttribute('data-submitting') === '1') {
        e.preventDefault();
        return;
      }

      const submitter = e.submitter && e.submitter.form === form ? e.submitter : null;
      form.setAttribute('data-submitting', '1');
      form.setAttribute('aria-busy', 'true');
      form.classList.add('form--pending');
      preserveSubmitterValue(form, submitter);

      submitButtons(form).forEach((button) => {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      });
      setSubmitterText(submitter, pendingLabel(form, submitter));
    });
  }

  function initAutoSubmitControls() {
    document.addEventListener('change', (e) => {
      const control = e.target.closest('[data-auto-submit]');
      if (control && control.form) {
        control.form.submit();
      }
    });
  }

  function initPasswordToggles() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.password-toggle[aria-controls]');
      if (!btn) {
        return;
      }

      const input = document.getElementById(btn.getAttribute('aria-controls'));
      if (!input) {
        return;
      }

      const isShowing = input.type === 'text';
      input.type = isShowing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!isShowing));
      const label = btn.querySelector('.sr-only');
      if (label) {
        label.textContent = isShowing
          ? (btn.dataset.showLabel ?? 'Show password')
          : (btn.dataset.hideLabel ?? 'Hide password');
      }
    });
  }

  function initPasswordRequirements() {
    const input = document.getElementById('password');
    const items = document.querySelectorAll('.password-req');
    if (!input || !items.length) {
      return;
    }

    const checks = {
      length(value) {
        return value.length >= 8;
      },
      uppercase(value) {
        return /[A-Z]/.test(value);
      },
      lowercase(value) {
        return /[a-z]/.test(value);
      },
      digit(value) {
        return /[0-9]/.test(value);
      },
    };

    input.addEventListener('input', () => {
      items.forEach((item) => {
        const req = item.dataset.req;
        const met = checks[req] && checks[req](input.value);
        item.classList.toggle('password-req--met', met);
        const icon = item.querySelector('.password-req__icon');
        if (icon) {
          icon.textContent = met ? '✓' : '○';
        }
      });
    });
  }

  function option(value, text) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = text;
    return item;
  }

  function initRepositoryBranchLoader() {
    const repoSelect = document.getElementById('fullName');
    const branchGroup = document.getElementById('branchGroup');
    const branchSelect = document.getElementById('productionBranch');
    const connectBtn = document.getElementById('connectBtn');

    if (repoSelect && branchGroup && branchSelect && connectBtn) {
      repoSelect.addEventListener('change', async () => {
        const opt = repoSelect.options[repoSelect.selectedIndex];
        const fullName = opt.value;

        branchSelect.replaceChildren(option('', 'Loading branches...'));
        branchGroup.classList.add('d-none');
        connectBtn.disabled = true;

        if (!fullName) {
          return;
        }

        document.getElementById('githubRepoId').value = opt.dataset.id;
        document.getElementById('nodeId').value = opt.dataset.nodeid;
        document.getElementById('ownerLogin').value = opt.dataset.owner;
        document.getElementById('defaultBranch').value = opt.dataset.defaultBranch;
        document.getElementById('visibility').value = opt.dataset.visibility;

        try {
          const res = await fetch('/github/branches?fullName=' + encodeURIComponent(fullName));
          const data = await res.json();
          branchSelect.replaceChildren(option('', 'Choose a branch'));
          (data.branches || []).forEach((branch) => {
            const branchOption = option(
              branch.name,
              branch.name === opt.dataset.defaultBranch ? branch.name + ' (default)' : branch.name,
            );
            if (branch.name === opt.dataset.defaultBranch) {
              branchOption.selected = true;
            }
            branchSelect.appendChild(branchOption);
          });
          branchGroup.classList.remove('d-none');
          connectBtn.disabled = !branchSelect.value;
        } catch {
          branchSelect.replaceChildren(option('', 'Could not load branches'));
          branchGroup.classList.remove('d-none');
        }
      });

      branchSelect.addEventListener('change', () => {
        connectBtn.disabled = !branchSelect.value;
      });
    }

    const publicForm = document.getElementById('publicRepoForm');
    const publicUrl = document.getElementById('publicRepositoryUrl');
    const inspectBtn = document.getElementById('publicRepoInspectBtn');
    const publicBranchGroup = document.getElementById('publicBranchGroup');
    const publicBranch = document.getElementById('publicProductionBranch');
    const publicConnect = document.getElementById('publicConnectBtn');
    const publicError = document.getElementById('publicRepoError');
    const publicStatus = document.getElementById('publicRepoStatus');
    if (!publicForm || !publicUrl || !inspectBtn || !publicBranch || !publicConnect) {
      return;
    }

    inspectBtn.addEventListener('click', async () => {
      publicError.hidden = true;
      publicError.textContent = '';
      publicStatus.textContent = 'Checking repository…';
      publicBranch.disabled = true;
      publicBranch.replaceChildren(option('', 'Checking branches…'));
      publicBranchGroup.classList.add('d-none');
      publicConnect.disabled = true;
      inspectBtn.disabled = true;
      const originalLabel = inspectBtn.textContent;
      inspectBtn.textContent = 'Checking…';
      try {
        const csrf = publicForm.querySelector('input[name="_csrf"]')?.value || '';
        const response = await fetch(publicForm.action + '/inspect', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
          },
          body: JSON.stringify({ repositoryUrl: publicUrl.value }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'The repository could not be checked.');
        }
        const branches = data.branches || [];
        if (branches.length === 0) {
          throw new Error('The public repository has no branches to deploy.');
        }
        publicBranch.replaceChildren(option('', 'Choose a branch'));
        branches.forEach((branch) => {
          const item = option(
            branch.name,
            branch.name === data.repository.defaultBranch
              ? branch.name + ' (default)'
              : branch.name,
          );
          if (branch.name === data.repository.defaultBranch) {
            item.selected = true;
          }
          publicBranch.appendChild(item);
        });
        publicBranch.disabled = false;
        publicBranchGroup.classList.remove('d-none');
        publicStatus.textContent = `${data.repository.fullName} is public. Select a branch to continue.`;
        publicConnect.disabled = !publicBranch.value;
      } catch (error) {
        publicStatus.textContent = '';
        publicError.textContent = error.message || 'The repository could not be checked.';
        publicError.hidden = false;
        publicError.focus();
      } finally {
        inspectBtn.disabled = false;
        inspectBtn.textContent = originalLabel;
      }
    });
    publicUrl.addEventListener('input', () => {
      publicError.hidden = true;
      publicError.textContent = '';
      publicConnect.disabled = true;
      publicBranch.disabled = true;
      publicBranchGroup.classList.add('d-none');
      publicStatus.textContent = '';
    });
    publicBranch.addEventListener('change', () => {
      publicConnect.disabled = !publicBranch.value;
    });
  }

  function initProjectSlug() {
    const name = document.getElementById('name');
    const slug = document.getElementById('slug');
    const status = document.getElementById('slug-status');
    const preview = document.getElementById('project-url-preview');
    if (!name || !slug || !status || !preview) {
      return;
    }
    let manuallyEdited = Boolean(slug.value);
    let timer = null;
    const normalize = (value) =>
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63);
    async function check() {
      const value = normalize(slug.value);
      slug.value = value;
      preview.textContent = `${value || 'my-project'}.hellodeploy.online`;
      if (!value) {
        status.textContent = '';
        return;
      }
      status.textContent = 'Checking availability…';
      try {
        const response = await fetch(
          `${slug.dataset.slugAvailabilityUrl}?slug=${encodeURIComponent(value)}`,
          { headers: { Accept: 'application/json' } },
        );
        const data = await response.json();
        status.textContent = data.available
          ? 'Address is available.'
          : 'Address is unavailable or reserved.';
      } catch {
        status.textContent =
          'Availability could not be checked. It will be checked when you submit.';
      }
    }
    name.addEventListener('input', () => {
      if (!manuallyEdited) {
        slug.value = normalize(name.value);
      }
      clearTimeout(timer);
      timer = setTimeout(check, 250);
    });
    slug.addEventListener('input', () => {
      manuallyEdited = true;
      clearTimeout(timer);
      timer = setTimeout(check, 250);
    });
    check();
  }

  function initWebVitals() {
    if (!window.PerformanceObserver) {
      return;
    }
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!token) {
      return;
    }
    const values = {};
    const page =
      location.pathname === '/'
        ? 'landing'
        : location.pathname.startsWith('/dashboard')
          ? 'dashboard'
          : location.pathname.startsWith('/admin')
            ? 'admin'
            : location.pathname.includes('/deployments/')
              ? 'deployment'
              : location.pathname.startsWith('/projects/')
                ? 'project'
                : location.pathname === '/projects'
                  ? 'projects'
                  : null;
    if (!page) {
      return;
    }

    function observe(type, callback) {
      try {
        const observer = new PerformanceObserver((list) => callback(list.getEntries()));
        observer.observe({ type, buffered: true });
      } catch {
        /* Metric is unsupported in this browser. */
      }
    }
    observe('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1];
      if (last) {
        values.LCP = last.startTime;
      }
    });
    let cls = 0;
    observe('layout-shift', (entries) => {
      entries.forEach((entry) => {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      });
      values.CLS = cls;
    });
    observe('event', (entries) => {
      entries.forEach((entry) => {
        values.INP = Math.max(values.INP || 0, entry.duration || 0);
      });
    });

    let sent = false;
    function send() {
      if (sent) {
        return;
      }
      sent = true;
      Object.entries(values).forEach(([metric, value]) => {
        fetch('/telemetry/web-vitals', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body: JSON.stringify({ metric, value, page, viewportWidth: window.innerWidth }),
        }).catch(() => {});
      });
    }
    window.addEventListener('pagehide', send, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        send();
      }
    });
  }

  function initVerificationCooldown() {
    document.querySelectorAll('[data-resend-verification]').forEach((button) => {
      const original = button.textContent.trim();
      const deadline = Number(button.dataset.cooldownUntil);
      if (!Number.isFinite(deadline)) {
        return;
      }
      function update() {
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        button.disabled = seconds > 0;
        button.textContent = seconds > 0 ? `Resend available in ${seconds}s` : original;
        if (seconds > 0) {
          window.setTimeout(update, 1000);
        }
      }
      update();
    });
  }

  function initDashboardPolling() {
    const root = document.querySelector('[data-dashboard-status-url]');
    if (!root || Number(root.dataset.dashboardActive) < 1) {
      return;
    }
    const live = root.querySelector('[data-dashboard-live]');
    const notices = root.querySelector('[data-dashboard-notices]');
    const labels = {
      QUEUED: 'Waiting to start',
      VALIDATING: 'Checking setup',
      BUILDING: 'Building app',
      DEPLOYING: 'Publishing',
      HEALTHY: 'Live',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    };
    let previous = '';
    async function poll() {
      try {
        const response = await fetch(root.dataset.dashboardStatusUrl, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Status unavailable');
        }
        const payload = await response.json();
        payload.activeDeployments.forEach((deployment) => {
          const row = root.querySelector(`[data-deployment-id="${deployment.id}"]`);
          const status = row?.querySelector('[data-deployment-status]');
          if (status) {
            status.textContent = labels[deployment.status] || deployment.status;
          }
        });
        const signature = JSON.stringify(
          payload.activeDeployments.map((item) => [item.id, item.status, item.stage]),
        );
        if (previous && signature !== previous && live) {
          live.textContent = 'Deployment status updated.';
        }
        previous = signature;
        if (notices) {
          notices.textContent = payload.notices.map((item) => item.message).join(' ');
        }
        if (payload.activeDeployments.length > 0) {
          window.setTimeout(poll, 5000);
        } else if (live) {
          live.textContent = 'All active deployments have finished.';
        }
      } catch {
        window.setTimeout(poll, 10000);
      }
    }
    window.setTimeout(poll, 5000);
  }

  function initDeploymentLiveLogs() {
    const output = document.getElementById('log-output');
    if (!output) {
      return;
    }

    const search = document.querySelector('[data-log-search]');
    const copy = document.querySelector('[data-log-copy]');
    const follow = document.querySelector('[data-log-follow]');
    let following = true;
    function applySearch() {
      const query = search?.value.trim().toLowerCase() || '';
      output.querySelectorAll('.log-line').forEach((line) => {
        line.hidden = Boolean(query) && !line.textContent.toLowerCase().includes(query);
      });
    }
    search?.addEventListener('input', applySearch);
    copy?.addEventListener('click', async () => {
      const text = [...output.querySelectorAll('.log-line:not([hidden])')]
        .map((line) => line.textContent.trim())
        .join('\n');
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Copy unavailable';
      }
      window.setTimeout(() => {
        copy.textContent = 'Copy visible';
      }, 1500);
    });
    follow?.addEventListener('click', () => {
      following = !following;
      follow.setAttribute('aria-pressed', String(following));
      follow.textContent = following ? 'Following live' : 'Follow live';
      if (following) {
        output.scrollTop = output.scrollHeight;
      }
    });
    output.addEventListener('scroll', () => {
      if (output.scrollHeight - output.scrollTop - output.clientHeight > 40 && following) {
        following = false;
        if (follow) {
          follow.setAttribute('aria-pressed', 'false');
          follow.textContent = 'Follow live';
        }
      }
    });
    if (!output.dataset.streamUrl) {
      return;
    }

    const indicator = document.getElementById('live-indicator');
    const reconnectButton = document.getElementById('log-reconnect-button');
    const eventStageToStatus = { VALIDATE: 'VALIDATING', BUILD: 'BUILDING', DEPLOY: 'DEPLOYING' };

    const timelineOrder = ['QUEUED', 'VALIDATING', 'BUILDING', 'DEPLOYING'];
    let furthestStageIndex = -1;

    function formatElapsed(secs) {
      return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
    }

    function secondsBetween(from, to) {
      return Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000));
    }

    function getTimelineStep(key) {
      return document.querySelector('[data-stage-key="' + key + '"]');
    }

    function setStageState(stage, state, label) {
      stage.classList.remove(
        'deploy-step--pending',
        'deploy-step--active',
        'deploy-step--complete',
      );
      stage.classList.add('deploy-step--' + state);
      const status = stage.querySelector('[data-stage-status]');
      if (status) {
        status.textContent = label;
      }
    }

    function setStageMeta(stage, text) {
      const meta = stage.querySelector('[data-stage-meta]');
      if (meta) {
        meta.textContent = text;
      }
    }

    const CONSOLE_LINE_LIMIT = 3;

    function updateStageConsole(ev, isNewStage) {
      const lines = document.querySelector('[data-stage-detail-lines]');
      if (!lines) {
        return;
      }
      if (isNewStage) {
        lines.replaceChildren();
        const label = document.querySelector('[data-stage-detail-label]');
        const time = document.querySelector('[data-stage-detail-time]');
        if (label) {
          label.textContent = ev.stage || '';
        }
        if (time && ev.timestamp) {
          time.textContent = new Date(ev.timestamp).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      }
      const line = document.createElement('li');
      line.className =
        'deploy-console__line deploy-console__line--' + (ev.level || 'info').toLowerCase();
      line.textContent = ev.message || '';
      lines.append(line);
      while (lines.children.length > CONSOLE_LINE_LIMIT) {
        lines.firstElementChild.remove();
      }
    }

    function updateTimeline(ev) {
      const statusKey = eventStageToStatus[ev.stage];
      const stageIndex = timelineOrder.indexOf(statusKey);
      // A late log line from an earlier stage must not move the timeline backwards.
      if (stageIndex < 0 || stageIndex < furthestStageIndex) {
        return;
      }

      const stage = getTimelineStep(statusKey);
      if (!stage) {
        return;
      }

      const isNewStage = stageIndex !== furthestStageIndex;
      if (isNewStage) {
        furthestStageIndex = stageIndex;
        if (ev.timestamp) {
          stage.dataset.stageStartedAt = ev.timestamp;
        }
        // Mirrors the server: a stage ends where the next stage that ran begins.
        timelineOrder.slice(0, stageIndex).forEach((key, i) => {
          const earlier = getTimelineStep(key);
          if (!earlier) {
            return;
          }
          const end = timelineOrder
            .slice(i + 1, stageIndex + 1)
            .map((laterKey) => getTimelineStep(laterKey)?.dataset.stageStartedAt)
            .find(Boolean);
          const start = earlier.dataset.stageStartedAt;
          setStageState(earlier, 'complete', 'Complete');
          setStageMeta(earlier, start && end ? formatElapsed(secondsBetween(start, end)) : 'Done');
        });
        setStageState(stage, 'active', 'In progress');
        setStageMeta(stage, 'Running');
      }
      updateStageConsole(ev, isNewStage);
    }

    function appendLog(ev) {
      const line = document.createElement('div');
      line.className = 'log-line log-line--' + (ev.level || 'info').toLowerCase();
      const stage = document.createElement('span');
      stage.className = 'log-line__stage';
      stage.textContent = ev.stage || '';
      const message = document.createElement('span');
      message.className = 'log-line__msg';
      message.textContent = ev.message || '';
      line.append(stage, message);
      output.appendChild(line);
      applySearch();
      if (following) {
        output.scrollTop = output.scrollHeight;
      }
      updateTimeline(ev);
    }

    // The server already renders every terminal state (badge, alert, timeline, actions),
    // so swap those regions in from a fresh render instead of re-deriving them here.
    // The log output is left untouched so scroll position and search survive.
    async function refreshDeploymentRegions() {
      try {
        const response = await fetch(window.location.href, {
          headers: { Accept: 'text/html' },
          credentials: 'same-origin',
        });
        if (!response.ok) {
          throw new Error('Deployment refresh failed with ' + response.status);
        }
        const fresh = new DOMParser().parseFromString(await response.text(), 'text/html');
        document.querySelectorAll('[data-deployment-refresh]').forEach((region) => {
          const replacement = fresh.querySelector(
            '[data-deployment-refresh="' + region.dataset.deploymentRefresh + '"]',
          );
          if (replacement) {
            region.replaceWith(document.importNode(replacement, true));
          }
        });
        applySearch();
      } catch {
        window.location.reload();
      }
    }

    // One ticker drives both the summary duration and the running step's elapsed time.
    const durationTimer = window.setInterval(() => {
      const now = Date.now();
      const duration = document.querySelector('[data-detail-duration][data-started-at]');
      if (duration) {
        duration.textContent = formatElapsed(secondsBetween(duration.dataset.startedAt, now));
      }
      const activeStep = document.querySelector('.deploy-step--active[data-stage-started-at]');
      if (activeStep?.dataset.stageStartedAt) {
        const elapsed = formatElapsed(secondsBetween(activeStep.dataset.stageStartedAt, now));
        setStageMeta(activeStep, elapsed);
        const consoleElapsed = document.querySelector('[data-stage-detail-elapsed]');
        if (consoleElapsed) {
          consoleElapsed.textContent = elapsed;
        }
      }
    }, 1000);

    let source = null;

    function setReconnectVisible(visible) {
      if (reconnectButton) {
        reconnectButton.classList.toggle('d-none', !visible);
      }
    }

    function connectLogStream() {
      if (source) {
        source.close();
      }

      setReconnectVisible(false);
      if (indicator) {
        indicator.textContent = '● Live';
      }

      source = new EventSource(output.dataset.streamUrl);

      source.addEventListener('log', (e) => {
        try {
          appendLog(JSON.parse(e.data));
        } catch {
          // Ignore malformed SSE payloads and wait for the next event.
        }
      });

      source.addEventListener('status', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (indicator) {
            indicator.textContent = data.status;
            indicator.className = 'badge text-xs';
          }
          setReconnectVisible(false);
          source.close();
          window.clearInterval(durationTimer);
          refreshDeploymentRegions();
        } catch {
          // Ignore malformed SSE status payloads; the stream error handler will close if needed.
        }
      });

      source.addEventListener('timeout', () => {
        if (indicator) {
          indicator.textContent = 'Timed out';
        }
        setReconnectVisible(true);
        source.close();
      });

      source.onerror = function () {
        if (indicator) {
          indicator.textContent = 'Disconnected';
        }
        setReconnectVisible(true);
        source.close();
      };
    }

    if (reconnectButton) {
      reconnectButton.addEventListener('click', connectLogStream);
    }

    connectLogStream();
  }

  function initDeploymentListPolling() {
    const table = document.querySelector('[data-deployment-list-status-url]');
    if (!table) {
      return;
    }
    const labels = {
      QUEUED: 'Waiting to start',
      VALIDATING: 'Checking setup',
      BUILDING: 'Building app',
      DEPLOYING: 'Publishing',
      HEALTHY: 'Live',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
      ROLLED_BACK: 'Replaced',
    };
    function activeRows() {
      return [...table.querySelectorAll('[data-deployment-row][data-terminal="false"]')];
    }
    async function poll() {
      const rows = activeRows();
      if (!rows.length) {
        return;
      }
      const ids = rows.map((row) => row.dataset.deploymentId).join(',');
      try {
        const response = await fetch(
          `${table.dataset.deploymentListStatusUrl}?ids=${encodeURIComponent(ids)}`,
          {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          },
        );
        if (!response.ok) {
          throw new Error('Status unavailable');
        }
        const payload = await response.json();
        payload.deployments.forEach((deployment) => {
          const row = table.querySelector(`[data-deployment-id="${deployment.id}"]`);
          if (!row) {
            return;
          }
          row.dataset.terminal = String(deployment.terminal);
          const status = row.querySelector('[data-deployment-status]');
          const stage = row.querySelector('[data-deployment-stage]');
          const duration = row.querySelector('[data-deployment-duration]');
          if (status) {
            status.textContent = labels[deployment.status] || deployment.status;
          }
          if (stage) {
            stage.textContent = deployment.stage || '';
          }
          if (duration && deployment.durationMs !== null && deployment.durationMs !== undefined) {
            duration.textContent = formatDuration(deployment.durationMs);
          }
        });
      } catch {
        /* Keep server-rendered state and retry. */
      }
      if (activeRows().length) {
        window.setTimeout(poll, 5000);
      }
    }
    function formatDuration(ms) {
      const seconds = Math.max(0, Math.round(ms / 1000));
      return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
    window.setTimeout(poll, 5000);
  }

  function initEnvFileImport() {
    const form = document.querySelector('[data-env-file-form]');
    if (!form) {
      return;
    }

    const input = form.querySelector('[data-env-file-input]');
    const content = form.querySelector('[data-env-file-content]');
    const status = form.querySelector('[data-env-file-status]');
    const submit = form.querySelector('[data-env-file-submit]');

    function readFileText(file) {
      if (typeof file.text === 'function') {
        return file.text();
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
        reader.addEventListener('error', reject);
        reader.readAsText(file);
      });
    }

    function countEnvEntries(text) {
      return text.split(/\r?\n/).filter((line) => {
        const candidate = line.trim().replace(/^export\s+/, '');
        return candidate && !candidate.startsWith('#') && candidate.includes('=');
      }).length;
    }

    input.addEventListener('change', async () => {
      content.value = '';
      submit.disabled = true;
      delete form.dataset.confirm;
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      if (file.size > 64 * 1024) {
        status.textContent = 'The .env file must be 64 KB or smaller.';
        return;
      }
      try {
        content.value = await readFileText(file);
        if (content.value.length === 0) {
          status.textContent = 'The selected .env file is empty.';
          return;
        }
        const entryCount = countEnvEntries(content.value);
        if (entryCount === 0) {
          status.textContent =
            'No environment variable entries were detected in the selected file.';
          return;
        }
        const noun = entryCount === 1 ? 'variable' : 'variables';
        status.textContent = `${file.name}: ${entryCount} ${noun} detected. Matching stored names will be replaced after confirmation.`;
        form.dataset.confirm = `Import ${entryCount} environment ${noun}? Matching stored names will be replaced.`;
        form.dataset.confirmTitle = 'Import environment variables';
        form.dataset.confirmAcceptLabel = 'Import Variables';
        form.dataset.confirmPendingLabel = 'Importing...';
        form.dataset.confirmVariant = 'warning';
        submit.disabled = false;
      } catch {
        status.textContent = 'The selected file could not be read.';
      }
    });
  }

  function initSettingsSectionNavigation() {
    const links = [...document.querySelectorAll('[data-settings-section-link]')];
    const sections = [...document.querySelectorAll('[data-settings-section]')];
    if (!links.length || !sections.length) {
      return;
    }

    function setCurrent(sectionId) {
      links.forEach((link) => {
        if (link.hash === `#${sectionId}`) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        const section = document.getElementById(link.hash.slice(1));
        if (!section) {
          return;
        }
        event.preventDefault();
        window.history.pushState(null, '', link.hash);
        setCurrent(section.id);
        section.focus({ preventScroll: true });
        section.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
      });
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (visible) {
            setCurrent(visible.target.id);
          }
        },
        { rootMargin: '-20% 0px -65% 0px' },
      );
      sections.forEach((section) => observer.observe(section));
    }

    const initialSection = document.getElementById(window.location.hash.slice(1));
    if (initialSection?.matches('[data-settings-section]')) {
      setCurrent(initialSection.id);
    }
  }

  function initSettingsEditGroups() {
    const groups = [...document.querySelectorAll('[data-settings-edit-group]')];
    if (!groups.length) {
      return;
    }

    let activeGroup = null;
    let activeTrigger = null;

    function closeGroup(group, restoreFocus = true) {
      const form = group.querySelector('[data-settings-edit-form]');
      const display = group.querySelector('[data-settings-display]');
      form?.reset();
      if (form) {
        form.hidden = true;
      }
      if (display) {
        display.hidden = false;
      }
      group.removeAttribute('data-editing');
      if (restoreFocus) {
        activeTrigger?.focus();
      }
      if (activeGroup === group) {
        activeGroup = null;
        activeTrigger = null;
      }
    }

    groups.forEach((group) => {
      const form = group.querySelector('[data-settings-edit-form]');
      const display = group.querySelector('[data-settings-display]');
      const edit = group.querySelector('[data-settings-edit]');
      const cancel = group.querySelector('[data-settings-cancel]');
      if (!form || !display || !edit) {
        return;
      }

      edit.addEventListener('click', () => {
        if (activeGroup && activeGroup !== group) {
          closeGroup(activeGroup, false);
        }
        activeGroup = group;
        activeTrigger = edit;
        display.hidden = true;
        form.hidden = false;
        group.setAttribute('data-editing', '');
        form.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus();
      });

      cancel?.addEventListener('click', () => closeGroup(group));

      if (!form.hidden && !activeGroup) {
        activeGroup = group;
        activeTrigger = edit;
        group.setAttribute('data-editing', '');
        requestAnimationFrame(() => {
          form
            .querySelector('.form-errors-summary, .form-input--error, .form-select--error')
            ?.focus();
        });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && activeGroup) {
        event.preventDefault();
        closeGroup(activeGroup);
      }
    });
  }

  function initDnsCopyButtons() {
    const buttons = [...document.querySelectorAll('[data-copy-value]')];
    if (!buttons.length) {
      return;
    }

    const status = document.querySelector('[data-copy-status]');

    buttons.forEach((button) => {
      const defaultLabel = button.querySelector('span')?.textContent || 'Copy';

      button.addEventListener('click', async () => {
        const value = button.dataset.copyValue;
        const label = button.dataset.copyLabel || 'Value';
        const buttonLabel = button.querySelector('span');

        try {
          await navigator.clipboard.writeText(value);
          if (buttonLabel) {
            buttonLabel.textContent = 'Copied';
          }
          if (status) {
            status.textContent = `${label} copied.`;
          }
          window.setTimeout(() => {
            if (buttonLabel) {
              buttonLabel.textContent = defaultLabel;
            }
          }, 2000);
        } catch {
          if (status) {
            status.textContent = `Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`;
          }
        }
      });
    });
  }

  function initDomainStatusPolling() {
    const root = document.querySelector('[data-domain-status-url]');
    if (!root) {
      return;
    }

    const url = root.dataset.domainStatusUrl;
    const initialSignature = root.dataset.domainStatusSignature || '';
    const startedAt = Number(root.dataset.domainOperationStartedAt) || Date.now();
    const deadline = startedAt + 90_000;

    async function poll() {
      if (Date.now() >= deadline) {
        return;
      }
      try {
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Domain status request failed.');
        }
        const payload = await response.json();
        if (payload.signature !== initialSignature) {
          window.location.reload();
          return;
        }
      } catch {
        // A transient polling failure should not replace the server-rendered page.
      }
      window.setTimeout(poll, 2000);
    }

    window.setTimeout(poll, 2000);
  }

  function init() {
    initThemeToggle();
    initPublicNav();
    initSidebarDrawer();
    initTooltips();
    initScrollTop();
    initConfirmationModal();
    initPageModal();
    initPendingForms();
    initAutoSubmitControls();
    initPasswordToggles();
    initPasswordRequirements();
    initRepositoryBranchLoader();
    initProjectSlug();
    initWebVitals();
    initVerificationCooldown();
    initDashboardPolling();
    initDeploymentLiveLogs();
    initDeploymentListPolling();
    initEnvFileImport();
    initSettingsSectionNavigation();
    initSettingsEditGroups();
    initDnsCopyButtons();
    initDomainStatusPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
