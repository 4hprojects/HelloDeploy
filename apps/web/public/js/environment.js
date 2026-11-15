// Loaded only on the project Environment page: .env file import and review.
(function () {
  function initEnvFileImport() {
    const form = document.querySelector('[data-env-file-form]');
    if (!form) {
      return;
    }

    const input = form.querySelector('[data-env-file-input]');
    const content = form.querySelector('[data-env-file-content]');
    const selectionsField = form.querySelector('[data-env-file-selections]');
    const status = form.querySelector('[data-env-file-status]');
    const submit = form.querySelector('[data-env-file-submit]');
    const preview = form.querySelector('[data-env-file-preview]');
    const rowsBody = form.querySelector('[data-env-file-preview-rows]');
    const summary = form.querySelector('[data-env-file-summary]');
    const clearButton = form.querySelector('[data-env-file-clear]');
    const initialStatus = status.innerHTML;
    let rows = [];

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

    function resetReview() {
      rows = [];
      content.value = '';
      selectionsField.value = '';
      submit.disabled = true;
      delete form.dataset.confirm;
      preview.hidden = true;
      rowsBody.replaceChildren();
    }

    function chosenValueMissing(row) {
      return row.source === 'production' ? !row.entry.hasProductionValue : !row.entry.hasLocalValue;
    }

    function rowState(row) {
      if (row.removed) {
        return 'removed';
      }
      if (chosenValueMissing(row) && !row.manualInput.value) {
        return 'needs-value';
      }
      return row.source === 'production' ? 'production' : 'ready';
    }

    const STATE_BADGES = {
      ready: ['healthy', 'Ready'],
      production: ['info', 'Production value'],
      'needs-value': ['warning', 'Needs a value'],
      removed: ['neutral', 'Will not import'],
    };

    function render() {
      const counts = { ready: 0, production: 0, 'needs-value': 0, removed: 0 };
      const selections = {};
      rows.forEach((row) => {
        const state = rowState(row);
        counts[state] += 1;
        const [tone, label] = STATE_BADGES[state];
        row.badge.className = `status-badge status-badge--${tone}`;
        row.badge.textContent = label;
        row.element.classList.toggle('env-import-review__row--removed', row.removed);
        row.actionButton.textContent = row.removed ? 'Undo' : 'Remove';
        row.actionButton.setAttribute(
          'aria-label',
          `${row.removed ? 'Undo removing' : 'Remove'} ${row.entry.name}`,
        );
        row.valueWrapper.hidden = row.removed || !chosenValueMissing(row);
        row.radios.forEach((radio) => {
          radio.disabled = row.removed;
        });
        const isIncluded = state === 'ready' || state === 'production';
        selections[row.entry.name] = {
          include: isIncluded,
          source: row.source,
          ...(isIncluded && chosenValueMissing(row) ? { value: row.manualInput.value } : {}),
        };
      });

      const toImport = counts.ready + counts.production;
      const parts = [`${toImport} to import`];
      if (counts.production > 0) {
        parts.push(
          `${counts.production} production ${counts.production === 1 ? 'value' : 'values'}`,
        );
      }
      if (counts.removed > 0) {
        parts.push(`${counts.removed} removed`);
      }
      if (counts['needs-value'] > 0) {
        parts.push(
          `${counts['needs-value']} ${counts['needs-value'] === 1 ? 'needs' : 'need'} a value and will be skipped`,
        );
      }
      summary.textContent = parts.join(' · ');

      // Kept current on every change so any submit path posts these choices.
      selectionsField.value = JSON.stringify(selections);
      submit.disabled = toImport === 0;
      const noun = toImport === 1 ? 'variable' : 'variables';
      form.dataset.confirm = `Import ${toImport} environment ${noun}? Matching stored names will be replaced.`;
      form.dataset.confirmTitle = 'Import environment variables';
      form.dataset.confirmAcceptLabel = 'Import Variables';
      form.dataset.confirmPendingLabel = 'Importing...';
      form.dataset.confirmVariant = 'warning';
    }

    function lineNote(text) {
      const note = document.createElement('span');
      note.className = 'env-import-review__line';
      note.textContent = text;
      return note;
    }

    function sourceRadio(row, index, source, labelText) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `env-import-source-${index}`;
      radio.value = source;
      radio.checked = row.source === source;
      radio.addEventListener('change', () => {
        row.source = source;
        render();
      });
      row.radios.push(radio);
      label.append(radio, document.createTextNode(labelText));
      return label;
    }

    function manualValueField(row, index) {
      const wrapper = document.createElement('div');
      wrapper.className = 'password-wrapper env-import-review__value';
      const field = document.createElement('input');
      field.type = 'password';
      field.className = 'form-input password-input';
      field.id = `env-import-value-${index}`;
      field.autocomplete = 'off';
      field.placeholder = 'Enter a value or remove';
      field.setAttribute('aria-label', `Value for ${row.entry.name}`);
      field.addEventListener('input', render);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'password-toggle';
      toggle.setAttribute('aria-controls', field.id);
      toggle.setAttribute('aria-pressed', 'false');
      toggle.dataset.showLabel = `Show value for ${row.entry.name}`;
      toggle.dataset.hideLabel = `Hide value for ${row.entry.name}`;
      const toggleLabel = document.createElement('span');
      toggleLabel.className = 'sr-only';
      toggleLabel.textContent = toggle.dataset.showLabel;
      toggle.appendChild(toggleLabel);
      const icon = document.querySelector('.password-toggle__icon');
      if (icon) {
        toggle.appendChild(icon.cloneNode(true));
      }
      wrapper.append(field, toggle);
      row.manualInput = field;
      return wrapper;
    }

    function buildRow(entry, index) {
      const row = {
        entry,
        removed: false,
        source: entry.hasProductionValue ? 'production' : 'local',
        radios: [],
      };
      const tr = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.dataset.label = 'Name';
      nameCell.className = 'env-import-review__name';
      const code = document.createElement('code');
      code.className = 'code-inline';
      code.textContent = entry.name;
      nameCell.append(code, lineNote(`line ${entry.line}`));

      const valueCell = document.createElement('td');
      valueCell.dataset.label = 'Value to import';
      const productionLabel = `Production (line ${entry.productionLine})`;
      if (entry.hasProductionValue) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'env-import-review__sources';
        const legend = document.createElement('legend');
        legend.className = 'sr-only';
        legend.textContent = `Value for ${entry.name}`;
        fieldset.append(
          legend,
          sourceRadio(row, index, 'production', productionLabel),
          sourceRadio(row, index, 'local', entry.hasLocalValue ? 'Local' : 'Local (empty)'),
        );
        valueCell.appendChild(fieldset);
      } else {
        valueCell.appendChild(
          document.createTextNode(entry.hasLocalValue ? 'Local' : 'Empty in file'),
        );
      }
      row.valueWrapper = manualValueField(row, index);
      valueCell.appendChild(row.valueWrapper);

      const statusCell = document.createElement('td');
      statusCell.dataset.label = 'Status';
      row.badge = document.createElement('span');
      statusCell.appendChild(row.badge);

      const actionCell = document.createElement('td');
      actionCell.dataset.label = '';
      actionCell.className = 'text-right';
      row.actionButton = document.createElement('button');
      row.actionButton.type = 'button';
      row.actionButton.className = 'button button--ghost button--sm env-import-review__action';
      row.actionButton.addEventListener('click', () => {
        row.removed = !row.removed;
        render();
      });
      actionCell.appendChild(row.actionButton);

      tr.append(nameCell, valueCell, statusCell, actionCell);
      row.element = tr;
      return row;
    }

    async function requestPreview(text) {
      const csrf = form.querySelector('input[name="_csrf"]')?.value || '';
      const response = await fetch(`${form.action}/preview`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ envFileContent: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.entries)) {
        throw new Error(data.error?.message || 'The file could not be checked. Try again.');
      }
      return data.entries;
    }

    clearButton.addEventListener('click', () => {
      input.value = '';
      resetReview();
      status.innerHTML = initialStatus;
      input.focus();
    });

    input.addEventListener('change', async () => {
      resetReview();
      const file = input.files?.[0];
      if (!file) {
        status.innerHTML = initialStatus;
        return;
      }
      if (file.size > 64 * 1024) {
        status.textContent = 'The .env file must be 64 KB or smaller.';
        return;
      }
      try {
        const text = await readFileText(file);
        if (text.length === 0) {
          status.textContent = 'The selected .env file is empty.';
          return;
        }
        status.textContent = `Checking ${file.name}…`;
        const entries = await requestPreview(text);
        content.value = text;
        rows = entries.map(buildRow);
        rowsBody.replaceChildren(...rows.map((row) => row.element));
        const productionCount = entries.filter((entry) => entry.hasProductionValue).length;
        status.textContent =
          `${file.name}: ${entries.length} ${entries.length === 1 ? 'variable' : 'variables'} found` +
          (productionCount > 0
            ? `, ${productionCount} with a production value from comments`
            : '') +
          '. Remove any you do not want, then import.';
        preview.hidden = false;
        render();
      } catch (error) {
        resetReview();
        status.textContent = error.message || 'The selected file could not be read.';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnvFileImport);
  } else {
    initEnvFileImport();
  }
})();
