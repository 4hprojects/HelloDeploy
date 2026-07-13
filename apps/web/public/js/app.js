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

    function openModal(msg, target, trigger) {
      pendingTarget = target;
      lastFocus = trigger || document.activeElement;
      modal.removeAttribute('aria-busy');
      modal.classList.remove(
        'confirm-modal--danger',
        'confirm-modal--warning',
        'confirm-modal--success',
      );
      modal.classList.add(
        'confirm-modal--' + (target.getAttribute('data-confirm-variant') || 'danger'),
      );
      if (eyebrow) {
        eyebrow.textContent = target.getAttribute('data-confirm-eyebrow') || 'Confirm action';
      }
      if (title) {
        title.textContent = target.getAttribute('data-confirm-title') || 'Continue?';
      }
      message.textContent = msg;
      setAcceptButton(target);
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

      modal.setAttribute('aria-busy', 'true');
      if (acceptButton) {
        acceptButton.disabled = true;
        acceptButton.textContent =
          target.getAttribute('data-confirm-pending-label') || 'Working...';
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
      const msg = form.getAttribute('data-confirm');
      if (!msg || form.getAttribute('data-confirmed')) {
        return;
      }
      e.preventDefault();
      pendingSubmitter = e.submitter && e.submitter.form === form ? e.submitter : pendingSubmitter;
      openModal(msg, form, pendingSubmitter || form);
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

    if (!repoSelect || !branchGroup || !branchSelect || !connectBtn) {
      return;
    }

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

  function initDeploymentLiveLogs() {
    const output = document.getElementById('log-output');
    if (!output || !output.dataset.streamUrl) {
      return;
    }

    const indicator = document.getElementById('live-indicator');
    const reconnectButton = document.getElementById('log-reconnect-button');
    const eventStageToStatus = { VALIDATE: 'VALIDATING', BUILD: 'BUILDING', DEPLOY: 'DEPLOYING' };

    function updateTimeline(ev) {
      const statusKey = eventStageToStatus[ev.stage];
      if (!statusKey) {
        return;
      }

      const stage = document.querySelector('[data-stage-key="' + statusKey + '"]');
      if (!stage) {
        return;
      }

      stage.classList.remove('deployment-stage--pending', 'deployment-stage--complete');
      stage.classList.add('deployment-stage--active');

      const status = stage.querySelector('[data-stage-status]');
      const message = stage.querySelector('[data-stage-message]');
      const time = stage.querySelector('[data-stage-time]');
      if (status) {
        status.textContent = 'In progress';
      }
      if (message) {
        message.textContent = ev.message || '';
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
      output.scrollTop = output.scrollHeight;
      updateTimeline(ev);
    }

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
          setTimeout(() => {
            window.location.reload();
          }, 1200);
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

  function init() {
    initThemeToggle();
    initSidebarDrawer();
    initTooltips();
    initScrollTop();
    initConfirmationModal();
    initPendingForms();
    initAutoSubmitControls();
    initPasswordToggles();
    initPasswordRequirements();
    initRepositoryBranchLoader();
    initDeploymentLiveLogs();
    initEnvFileImport();
    initSettingsSectionNavigation();
    initSettingsEditGroups();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
