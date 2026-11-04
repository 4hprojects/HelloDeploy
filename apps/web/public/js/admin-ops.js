// Admin operations overview: refreshes panels in place from the shared,
// server-side snapshot. Polling pauses while the tab is hidden, a panel the
// administrator is interacting with is never replaced under them, and data
// that stops arriving is marked stale instead of being shown as current.
(function () {
  'use strict';

  const root = document.querySelector('[data-ops-root]');
  if (!root) {
    return;
  }

  const liveUrl = root.getAttribute('data-live-url');
  const refreshSeconds = Number(root.getAttribute('data-refresh-seconds')) || 0;
  const resourceSeconds = Number(root.getAttribute('data-resource-seconds')) || 15;
  const statusEl = root.querySelector('[data-ops-status]');
  const updatedEl = root.querySelector('[data-ops-updated]');
  const errorEl = root.querySelector('[data-ops-error]');
  const refreshButton = root.querySelector('[data-ops-refresh]');
  const LABELS = { live: 'Live', degraded: 'Degraded', stale: 'Stale', offline: 'Offline' };
  // Minimum seconds between refreshes of each panel group; the personal
  // interval can slow these down but never speed them past the source.
  const CADENCE_FLOOR = { resource: 0, service: 30, history: 60, counts: 120 };

  const panels = {};
  root.querySelectorAll('[data-ops-panel]').forEach((el) => {
    const id = el.getAttribute('data-ops-panel');
    panels[id] = {
      el,
      cadence: el.getAttribute('data-ops-cadence') || 'resource',
      html: el.innerHTML,
      dueAt: 0,
    };
  });

  let serverStatus = statusEl ? statusEl.className.replace(/.*ops-badge--(\w+).*/, '$1') : 'live';
  let lastSuccessAt = Date.now();
  let failures = 0;
  let inFlight = false;
  const pendingIds = new Set();
  let timer = null;
  let stopped = false;

  function intervalFor(cadence) {
    if (refreshSeconds === 0) {
      return Infinity;
    }
    return Math.max(refreshSeconds, CADENCE_FLOOR[cadence] || 0) * 1000;
  }

  function scheduleAll(now) {
    Object.keys(panels).forEach((id) => {
      panels[id].dueAt = now + intervalFor(panels[id].cadence);
    });
  }

  function setStatus(status) {
    if (!statusEl) {
      return;
    }
    statusEl.className = 'ops-badge ops-badge--' + status;
    statusEl.textContent = LABELS[status] || 'Unknown';
  }

  function showError(message) {
    if (!errorEl) {
      return;
    }
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
  }

  function renderAge() {
    if (!updatedEl) {
      return;
    }
    const seconds = Math.max(0, Math.round((Date.now() - lastSuccessAt) / 1000));
    updatedEl.textContent =
      seconds < 5
        ? 'just now'
        : seconds < 120
          ? seconds + 's ago'
          : Math.round(seconds / 60) + 'm ago';
    const staleAfter = Math.max(refreshSeconds || 0, resourceSeconds) * 2000 + 5000;
    if (refreshSeconds !== 0 && failures === 0 && Date.now() - lastSuccessAt > staleAfter) {
      setStatus('stale');
    }
  }

  function applyPanels(payload) {
    const active = document.activeElement;
    Object.keys(payload.panels || {}).forEach((id) => {
      const panel = panels[id];
      const html = payload.panels[id];
      if (!panel || panel.html === html) {
        return;
      }
      // Never swap content out from under keyboard focus or an open form.
      if (active && active !== document.body && panel.el.contains(active)) {
        panel.dueAt = 0;
        return;
      }
      const filter = panel.el.querySelector('input[type="radio"]:checked');
      const filterValue = filter ? filter.value : null;
      panel.el.innerHTML = html;
      panel.html = html;
      // Keep a chosen filter across refreshes.
      if (filterValue) {
        const restored = panel.el.querySelector(`input[type="radio"][value="${filterValue}"]`);
        if (restored) {
          restored.checked = true;
        }
      }
    });
  }

  function request(ids) {
    if (ids.length === 0 || stopped) {
      return Promise.resolve();
    }
    // A refresh asked for while one is running is queued, not dropped, so a
    // live event that lands mid-request still updates its panels.
    if (inFlight) {
      ids.forEach((id) => pendingIds.add(id));
      return Promise.resolve();
    }
    inFlight = true;
    ids.forEach((id) => {
      panels[id].el.setAttribute('aria-busy', 'true');
    });
    const url = liveUrl + '?panels=' + encodeURIComponent(ids.join(','));
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((res) => {
        const type = res.headers.get('content-type') || '';
        if (
          res.redirected ||
          res.status === 401 ||
          res.status === 403 ||
          type.indexOf('application/json') === -1
        ) {
          stopped = true;
          throw new Error('Your session has ended. Reload the page to sign in again.');
        }
        if (!res.ok) {
          throw new Error('The server could not refresh the overview (HTTP ' + res.status + ').');
        }
        return res.json();
      })
      .then((payload) => {
        failures = 0;
        lastSuccessAt = Date.now();
        serverStatus = payload.status || 'live';
        applyPanels(payload);
        setStatus(serverStatus);
        showError('');
      })
      .catch((error) => {
        failures += 1;
        if (failures >= 2 || stopped) {
          setStatus('offline');
        }
        showError(
          error.message || 'The overview could not be refreshed. Showing the last data received.',
        );
      })
      .then(() => {
        inFlight = false;
        ids.forEach((id) => {
          panels[id].el.removeAttribute('aria-busy');
        });
        renderAge();
        if (pendingIds.size > 0) {
          const next = [...pendingIds];
          pendingIds.clear();
          request(next);
        }
      });
  }

  function tick() {
    timer = null;
    if (stopped || document.hidden) {
      return;
    }
    const now = Date.now();
    const due = Object.keys(panels).filter((id) => {
      return panels[id].dueAt <= now;
    });
    // Back off while the server is unreachable instead of hammering it.
    const backoff = failures > 0 ? Math.min(60000, 5000 * Math.pow(2, failures - 1)) : 0;
    due.forEach((id) => {
      panels[id].dueAt = now + Math.max(intervalFor(panels[id].cadence), backoff);
    });
    request(due).then(schedule);
  }

  function schedule() {
    if (timer || stopped || document.hidden) {
      return;
    }
    let next = Infinity;
    Object.keys(panels).forEach((id) => {
      next = Math.min(next, panels[id].dueAt);
    });
    const wait = next === Infinity ? 5000 : Math.max(1000, Math.min(next - Date.now(), 5000));
    timer = window.setTimeout(next === Infinity ? ageOnly : tick, wait);
  }

  function ageOnly() {
    timer = null;
    renderAge();
    schedule();
  }

  function refreshNow(ids) {
    const list = ids || Object.keys(panels);
    const now = Date.now();
    list.forEach((id) => {
      if (panels[id]) {
        panels[id].dueAt = now + intervalFor(panels[id].cadence);
      }
    });
    return request(
      list.filter((id) => {
        return panels[id];
      }),
    ).then(schedule);
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      refreshNow();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      return;
    }
    // Coming back: everything may be old, so fetch it all once, then resume.
    refreshNow();
  });

  window.addEventListener('online', () => {
    refreshNow();
  });

  // ── Live events ──────────────────────────────────────────────────────
  // One tab per browser holds the event stream (a Web Lock elects it) and
  // relays events to the others over a BroadcastChannel, so ten open tabs
  // still cost the server one connection. A hidden leader steps down.
  const eventsUrl = root.getAttribute('data-events-url');
  const modeEl = root.querySelector('[data-ops-mode]');
  const announcer = root.querySelector('[data-ops-announce]');
  const relay = 'BroadcastChannel' in window ? new BroadcastChannel('hellodeploy-admin-ops') : null;
  const seenEvents = [];
  const EVENT_PANELS = {
    deployment: ['deployments', 'kpis', 'activity', 'attention'],
    app: ['apps', 'kpis', 'attention', 'incidents'],
    incident: ['incidents', 'attention', 'kpis'],
  };
  let source = null;
  let streamFailures = 0;
  let releaseLeadership = null;
  let reconnectTimer = null;
  let eventsLive = false;
  let coalesceTimer = null;
  const coalesced = new Set();

  function setMode() {
    if (!modeEl) {
      return;
    }
    const polling = refreshSeconds === 0 ? 'Manual refresh' : `Every ${refreshSeconds}s`;
    modeEl.textContent = eventsLive ? `${polling} · live events` : polling;
  }

  function handleEvent(type, data, id) {
    if (id) {
      if (seenEvents.includes(id)) {
        return;
      }
      seenEvents.push(id);
      if (seenEvents.length > 200) {
        seenEvents.shift();
      }
    }
    (EVENT_PANELS[type] || []).forEach((panelId) => coalesced.add(panelId));
    if (
      type === 'incident' &&
      announcer &&
      !data.muted &&
      data.state === 'active' &&
      data.severity === 'critical'
    ) {
      announcer.textContent = `Critical incident: ${data.title}`;
    }
    if (!coalesceTimer) {
      // Bursts (a release swap emits several transitions) become one request.
      coalesceTimer = window.setTimeout(() => {
        coalesceTimer = null;
        const ids = [...coalesced].filter((panelId) => panels[panelId]);
        coalesced.clear();
        if (!document.hidden) {
          refreshNow(ids);
        }
      }, 600);
    }
  }

  function closeStream() {
    if (source) {
      source.close();
      source = null;
    }
    eventsLive = false;
    setMode();
  }

  function openStream() {
    if (source || stopped) {
      return;
    }
    source = new EventSource(eventsUrl);
    ['deployment', 'app', 'incident'].forEach((type) => {
      source.addEventListener(type, (event) => {
        let data = {};
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (relay) {
          relay.postMessage({ type, data, id: event.lastEventId });
        }
        handleEvent(type, data, event.lastEventId);
      });
    });
    source.addEventListener('hello', () => {
      streamFailures = 0;
      eventsLive = true;
      setMode();
    });
    source.addEventListener('reconnect', () => {
      closeStream();
      openStream();
    });
    source.addEventListener('unavailable', () => giveUp(5 * 60_000));
    source.addEventListener('forbidden', () => {
      stopped = true;
      closeStream();
      showError('You no longer have administrator access. Reload the page.');
    });
    source.onerror = () => {
      closeStream();
      streamFailures += 1;
      if (streamFailures >= 5) {
        giveUp(5 * 60_000);
        return;
      }
      // After a gap, events may have been missed: refresh, then reconnect.
      refreshNow();
      reconnectTimer = window.setTimeout(openStream, Math.min(30_000, 2000 * 2 ** streamFailures));
    };
  }

  // Polling keeps working on its own; the stream is retried later.
  function giveUp(retryMs) {
    closeStream();
    stepDown();
    reconnectTimer = window.setTimeout(() => {
      streamFailures = 0;
      startStream();
    }, retryMs);
  }

  function stepDown() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    closeStream();
    if (releaseLeadership) {
      releaseLeadership();
      releaseLeadership = null;
    }
  }

  function startStream() {
    if (!eventsUrl || !('EventSource' in window) || releaseLeadership || document.hidden) {
      return;
    }
    if (!navigator.locks) {
      releaseLeadership = () => {};
      openStream();
      return;
    }
    navigator.locks
      .request('hellodeploy-admin-ops-events', () => {
        if (document.hidden || stopped) {
          return undefined;
        }
        openStream();
        return new Promise((resolve) => {
          releaseLeadership = resolve;
        });
      })
      .catch(() => {});
  }

  if (relay) {
    relay.onmessage = (message) => {
      const { type, data, id } = message.data || {};
      handleEvent(type, data || {}, id);
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stepDown();
    } else {
      startStream();
    }
  });
  window.addEventListener('pagehide', stepDown);

  window.HelloDeployOps = { refresh: refreshNow };
  startStream();

  scheduleAll(Date.now());
  renderAge();
  schedule();
})();
