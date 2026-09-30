(function () {
  const STORAGE_KEY = 'flow_spec_pipeline_logs';
  const MAX_ENTRIES = 2000;
  const entries = [];
  const signatures = new Map();
  let options = {};
  let selectedView = 'frames';
  let renderedSpec;
  let saveTimer;
  let renderTimer;
  let storageReady = false;
  let clearedBeforeLoad = false;
  let levelFilter = 'all';
  let frameFilter = 'all';
  let frameOptionsSignature;
  let search = '';
  let autoScroll = true;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const stringify = value => {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };

  function persist() {
    clearTimeout(saveTimer);
    if (!storageReady || !chrome.storage?.local) return;
    chrome.storage.local.set({ [STORAGE_KEY]: entries.slice(-MAX_ENTRIES) }).catch(error => console.warn('[Spec Logs] Could not save logs:', error));
  }

  function record(level, message, context = {}) {
    const entry = {
      id: crypto.randomUUID(), timestamp: Date.now(), source: 'Spec Pipeline',
      ...context, level: ['info', 'warn', 'error'].includes(level) ? level : 'info',
      message: String(message ?? ''),
      frameName: context.frameName || (context.frameNumber ? options.getSpec?.()?.visuals?.[context.frameNumber - 1]?.target_filename : undefined)
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    document.getElementById('spec-log-count').textContent = entries.length;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 200);
    if (!renderTimer && selectedView === 'logs') renderTimer = setTimeout(() => { renderTimer = null; renderEntries(); }, 100);
  }

  function filteredEntries() {
    return entries.filter(entry => (levelFilter === 'all' || entry.level === levelFilter) &&
      (frameFilter === 'all' || String(entry.frameNumber) === frameFilter) &&
      (!search || `${entry.message} ${entry.source} ${entry.phase || ''} ${stringify(entry.details || '')} Frame #${entry.frameNumber || ''} Frame ${entry.frameNumber || ''} ${entry.frameName || ''}`.toLowerCase().includes(search)));
  }

  function renderFrameFilter() {
    const select = document.getElementById('spec-log-frame');
    if (!select) return;
    const frames = new Map((options.getSpec?.()?.visuals || []).map((frame, index) => [index + 1, frame.target_filename || '']));
    entries.forEach(entry => { if (entry.frameNumber && !frames.has(entry.frameNumber)) frames.set(entry.frameNumber, entry.frameName || ''); });
    const ordered = Array.from(frames).sort(([a], [b]) => a - b);
    const signature = JSON.stringify(ordered);
    if (signature === frameOptionsSignature) return;
    frameOptionsSignature = signature;
    select.innerHTML = '<option value="all">All frames</option>' + ordered.map(([number, name]) => `<option value="${number}">Frame #${number}${name ? ` · ${escape(name)}` : ''}</option>`).join('');
    if (frameFilter !== 'all' && !frames.has(Number(frameFilter))) frameFilter = 'all';
    select.value = frameFilter;
  }

  function setLogStatus(message, error = false) {
    const status = document.getElementById('spec-log-status');
    if (status) { status.textContent = message; status.classList.toggle('is-error', error); }
  }

  function renderEntries() {
    const list = document.getElementById('spec-log-entries');
    if (!list) return;
    renderFrameFilter();
    const filtered = filteredEntries();
    const scrollTop = list.scrollTop;
    const openDetails = new Set(Array.from(list.querySelectorAll('details[open]')).map(element => element.dataset.logId));
    list.innerHTML = filtered.length ? filtered.map(entry => `
      <article class="spec-log-entry spec-log-${escape(entry.level)}">
        <div class="spec-log-meta"><time>${escape(new Date(entry.timestamp).toLocaleTimeString())}</time>
          <span class="spec-log-level">${escape(entry.level)}</span><span>${escape(entry.source)}</span>
          ${entry.frameNumber ? `<span>Frame #${escape(entry.frameNumber)}</span>` : ''}
          ${entry.frameName ? `<span>${escape(entry.frameName)}</span>` : ''}
          ${entry.phase ? `<span>${escape(entry.phase)}</span>` : ''}
          ${Number.isInteger(entry.tabId) ? `<span>Tab #${entry.tabId}</span>` : ''}</div>
        <div class="spec-log-message">${escape(entry.message)}</div>
        ${entry.details ? `<details data-log-id="${escape(entry.id)}" ${openDetails.has(entry.id) ? 'open' : ''}><summary>Details</summary><pre>${escape(JSON.stringify(entry.details, null, 2))}</pre></details>` : ''}
      </article>`).join('') : '<p class="spec-tools-empty">No logs match. Start a generation to see Flow activity here.</p>';
    list.scrollTop = autoScroll ? list.scrollHeight : scrollTop;
    document.getElementById('spec-log-summary').textContent = `${filtered.length} of ${entries.length} entries · latest ${MAX_ENTRIES} kept`;
    document.getElementById('spec-copy-logs').disabled = !filtered.length;
    document.getElementById('spec-download-logs').disabled = !filtered.length;
    document.getElementById('spec-clear-logs').disabled = !entries.length;
  }

  async function downloadLogs() {
    let objectUrl;
    try {
      const data = { version: 1, exportedAt: new Date().toISOString(), extensionVersion: chrome.runtime.getManifest().version,
        project: options.getSpec?.()?.project_name || null, entries: filteredEntries() };
      objectUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const filename = `spec_pipeline_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await chrome.downloads.download({ url: objectUrl, filename, saveAs: true });
      setLogStatus('Logs exported.');
    } catch (error) {
      setLogStatus(`Could not export logs: ${error.message}`, true);
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    }
  }

  function renderLogs() {
    const view = document.getElementById('spec-logs-view');
    if (view.childElementCount) { renderEntries(); return; }
    view.innerHTML = `
      <div class="spec-tools-heading"><h2>Generation logs</h2><p>Flow activity and Spec Pipeline errors are saved across panel reloads.</p></div>
      <div class="spec-log-toolbar">
        <label>Level<select id="spec-log-level"><option value="all">All levels</option><option value="info">Info</option><option value="warn">Warnings</option><option value="error">Errors</option></select></label>
        <label>Frame<select id="spec-log-frame"><option value="all">All frames</option></select></label>
        <label class="spec-log-search">Search<input id="spec-log-search" type="search" placeholder="Search messages, frames, or details" /></label>
      </div>
      <div class="spec-log-actions"><label><input id="spec-log-autoscroll" type="checkbox" checked /> Auto-scroll</label>
        <button type="button" class="btn-dark-pill" id="spec-errors-only">Errors only</button>
        <button type="button" class="btn-dark-pill" id="spec-copy-logs">Copy logs</button>
        <button type="button" class="btn-dark-pill" id="spec-download-logs">Download logs</button>
        <button type="button" class="btn-dark-pill" id="spec-clear-logs">Clear</button></div>
      <p id="spec-log-summary" class="spec-tools-hint"></p>
      <div id="spec-log-entries" class="spec-log-entries" aria-label="Generation log entries"></div>
      <p id="spec-log-status" class="spec-tools-status" role="status"></p>`;
    document.getElementById('spec-log-level').addEventListener('change', event => { levelFilter = event.target.value; renderEntries(); });
    document.getElementById('spec-log-frame').addEventListener('change', event => { frameFilter = event.target.value; renderEntries(); });
    document.getElementById('spec-errors-only').addEventListener('click', () => {
      levelFilter = 'error';
      frameFilter = 'all';
      search = '';
      document.getElementById('spec-log-level').value = 'error';
      document.getElementById('spec-log-frame').value = 'all';
      document.getElementById('spec-log-search').value = '';
      renderEntries();
    });
    document.getElementById('spec-log-search').addEventListener('input', event => { search = event.target.value.trim().toLowerCase(); renderEntries(); });
    document.getElementById('spec-log-autoscroll').addEventListener('change', event => { autoScroll = event.target.checked; });
    document.getElementById('spec-copy-logs').addEventListener('click', async () => {
      try {
        const text = filteredEntries().map(entry => `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}] [${entry.source}]${entry.frameNumber ? ` Frame #${entry.frameNumber}` : ''}${entry.frameName ? ` (${entry.frameName})` : ''}${entry.phase ? ` [${entry.phase}]` : ''}${Number.isInteger(entry.tabId) ? ` Tab #${entry.tabId}` : ''} ${entry.message}${entry.details ? `\n${JSON.stringify(entry.details, null, 2)}` : ''}`).join('\n');
        await navigator.clipboard.writeText(text);
        setLogStatus('Logs copied.');
      } catch (error) { setLogStatus(`Copy failed: ${error.message}. Use Download logs.`, true); }
    });
    document.getElementById('spec-download-logs').addEventListener('click', downloadLogs);
    document.getElementById('spec-clear-logs').addEventListener('click', () => {
      clearedBeforeLoad = true;
      entries.length = 0;
      signatures.clear();
      document.getElementById('spec-log-count').textContent = '0';
      persist();
      renderEntries();
      setLogStatus('Logs cleared.');
    });
    renderEntries();
  }

  function renderSettings(force = false) {
    const view = document.getElementById('spec-settings-view');
    const spec = options.getSpec?.();
    if (!force && renderedSpec === spec && view.childElementCount) {
      const fields = document.getElementById('spec-settings-fields');
      if (fields) fields.disabled = !!options.isRunning?.();
      return;
    }
    renderedSpec = spec;
    if (!spec) {
      view.innerHTML = '<div class="spec-tools-heading"><h2>Pipeline settings</h2><p>Load a spec in Frames to edit its generation settings.</p></div>';
      return;
    }
    view.innerHTML = `
      <div class="spec-tools-heading"><h2>Pipeline settings</h2><p>${escape(spec.project_name)} · saved with this project</p></div>
      <form id="spec-settings-form"><fieldset id="spec-settings-fields" ${options.isRunning?.() ? 'disabled' : ''}>
        <div class="spec-settings-card">
          <label for="spec-setting-parallel">Parallel generations</label><input id="spec-setting-parallel" type="number" min="1" step="1" required value="${escape(spec.max_parallel_generations)}" />
          <p>Independent images overlap. Dependent frames wait for their references.</p>
          <label for="spec-setting-attempts">Maximum attempts</label><input id="spec-setting-attempts" type="number" min="1" max="20" step="1" required value="${escape(spec.max_retries)}" />
          <p>Includes the first attempt. Set 1 to disable automatic retries. Accepted or uncertain submissions are never regenerated automatically.</p>
          <label for="spec-setting-aspect">Aspect ratio</label><select id="spec-setting-aspect">${['16:9', '9:16', '1:1', '4:3', '3:4'].map(ratio => `<option value="${ratio}" ${spec.default_aspect_ratio === ratio ? 'selected' : ''}>${ratio}</option>`).join('')}</select>
          <p>Image model: Nano Banana 2 · one image per prompt.</p>
        </div>
        <div class="spec-settings-card"><label for="spec-setting-folder">Output folder</label><input id="spec-setting-folder" type="text" required value="${escape(spec.project_dir || spec.output_folder)}" /><p>Frames are downloaded into the project's frames subfolder.</p></div>
        <button type="submit" class="btn-dark-pill">Save settings</button>
      </fieldset></form><p id="spec-settings-status" class="spec-tools-status" role="status"></p>`;
    document.getElementById('spec-settings-form').addEventListener('submit', event => {
      event.preventDefault();
      if (options.isRunning?.()) return;
      const status = document.getElementById('spec-settings-status');
      try {
        const values = { max_parallel_generations: Number(document.getElementById('spec-setting-parallel').value),
          max_retries: Number(document.getElementById('spec-setting-attempts').value),
          default_aspect_ratio: document.getElementById('spec-setting-aspect').value,
          project_dir: document.getElementById('spec-setting-folder').value.trim() };
        if (!Number.isSafeInteger(values.max_parallel_generations) || values.max_parallel_generations < 1 || !Number.isSafeInteger(values.max_retries) || values.max_retries < 1 || values.max_retries > 20 || !values.project_dir) throw new Error('Enter positive whole numbers and a nonempty output folder.');
        options.applySettings(values);
        renderSettings(true);
        const savedStatus = document.getElementById('spec-settings-status');
        savedStatus.classList.remove('is-error');
        savedStatus.textContent = 'Settings saved.';
        record('info', 'Pipeline settings saved.', { details: values });
      } catch (error) { status.textContent = error.message; status.classList.add('is-error'); }
    });
  }

  function show(view) {
    selectedView = view;
    document.getElementById('spec-pipeline-app').hidden = view !== 'frames';
    document.getElementById('spec-settings-view').hidden = view !== 'settings';
    document.getElementById('spec-logs-view').hidden = view !== 'logs';
    document.querySelectorAll('[data-spec-view]').forEach(button => {
      const active = button.dataset.specView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (view === 'settings') renderSettings(true);
    if (view === 'logs') renderLogs();
  }

  document.querySelectorAll('[data-spec-view]').forEach(button => button.addEventListener('click', () => show(button.dataset.specView)));
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'ACTION_LOG' && message.data?.message) {
      const data = message.data;
      record(data.level, data.message, { source: data.source === 'spec-pipeline' ? 'Spec Flow' : data.source === 'AI Reviewer' ? 'AI Reviewer' : 'Flow', timestamp: data.timestamp || Date.now(),
        tabId: sender.tab?.id, groupId: data.groupId, frameNumber: Number.isInteger(data.promptIndex) ? data.promptIndex + 1 : undefined,
        frameName: data.frameName, phase: data.phase, details: data.details });
    }
    if (message.type !== 'PROMPT_GROUP_STATUS' || !String(message.data?.id || '').startsWith('spec-group-')) return;
    const group = message.data;
    for (const result of group.results || []) {
      const key = `${group.id}:${result.promptIndex}`;
      const signature = `${result.success}:${result.downloadComplete}:${result.error}:${result.submission?.state}`;
      if (signatures.get(key) === signature) continue;
      signatures.set(key, signature);
      if (signatures.size > MAX_ENTRIES) signatures.delete(signatures.keys().next().value);
      if (result.error || result.downloadComplete) record(result.cancelled || result.error === 'Cancelled' ? 'warn' : result.error ? 'error' : 'info', result.error || (result.reviewPending ? 'Image captured; AI review queued before final download.' : 'Image captured and download started.'), {
        frameNumber: result.promptIndex + 1, tabId: sender.tab?.id, groupId: group.id,
        details: { success: result.success, retryable: result.retryable, submissionState: result.submission?.state, tileId: result.submission?.tileId, marker: result.submission?.marker }
      });
    }
  });
  chrome.storage.local.get([STORAGE_KEY]).then(saved => {
    const live = entries.slice();
    const old = !clearedBeforeLoad && Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY].filter(entry => entry && typeof entry.message === 'string' && Number.isFinite(entry.timestamp)).slice(-MAX_ENTRIES) : [];
    entries.splice(0, entries.length, ...old, ...live);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    storageReady = true;
    document.getElementById('spec-log-count').textContent = entries.length;
    if (selectedView === 'logs') renderEntries();
    persist();
  }).catch(error => { storageReady = true; record('warn', `Could not restore saved logs: ${error.message}`); });
  window.addEventListener('pagehide', persist);
  window.PipelineTools = {
    configure(value) { options = value; },
    record, log(...args) { record('info', args.map(stringify).join(' ')); },
    refresh() { if (selectedView === 'settings') renderSettings(); },
    show
  };
})();
