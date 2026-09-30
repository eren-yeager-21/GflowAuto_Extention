import { defaults, normalizeSettings, terminal, ROOT, REVIEW_SCOPE, reviewSummary } from './contract.js';
import { get, cacheImage } from './store.js';
import { CONTEXT_VERSION } from './context.js';

let options = {}, base, host, reportView;
let paused = false;
let reviewPreparing = false;
let automaticCorrectionActive = false;
const pendingCorrections = new Set();
let previewUrls = [];
let projectChat;
let contextView;
const reports = new Map();
const ready = defaults().then(value => { base = value; queueMicrotask(() => changed()); });
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const spec = () => options.getSpec?.();
const projectKey = () => `${spec()?.project_name || 'default'}|${spec()?.collection_url || ''}`;
const settings = () => normalizeSettings(spec()?.ai_reviewer || {}, base);
const shouldReview = frame => !!base && (settings().enabled || frame?.ai_review?.force_review === true);
const request = async data => {
  let result;
  try { result = await chrome.runtime.sendMessage(data); }
  catch (error) { throw new Error(`${data.type}: reviewer connection failed (${error.message}). Reload the extension and reopen the panel.`); }
  if (!result?.success) throw new Error(result?.error || `${data.type}: no reviewer response. Reload the extension and reopen the panel.`);
  return result;
};
const changed = () => { options.onChange?.(); refreshCards(); };
function inputSignature(frame, index) {
  const previous = options.previous?.(frame, index);
  return JSON.stringify([REVIEW_SCOPE, frame.prompt, frame.verbatim_script,
    settings().validator, settings().context, CONTEXT_VERSION, spec()?.ai_reviewer_context_revision,
    previous?.id || null, previous?.result_url || null]);
}
const matches = (job, frame, index) => job?.frameIndex === index && job.frameId === String(frame.id || frame.target_filename) && job.mediaUrl === frame.result_url && job.inputSignature === inputSignature(frame, index);

function queueAutomaticCorrection(job) {
  if (job?.state === 'failed' && job.report?.regenerate_image === true) pendingCorrections.add(job.id);
}
async function flushAutomaticCorrections() {
  if (!base || !spec() || paused || reviewPreparing || automaticCorrectionActive || options.isRunning?.() || !settings().autoCorrect || !pendingCorrections.size) return;
  automaticCorrectionActive = true;
  const owner = spec();
  changed();
  try {
    for (const id of pendingCorrections) {
      if (paused || spec() !== owner || options.isRunning?.() || !settings().autoCorrect) break;
      const job = reports.get(id), index = job?.frameIndex, frame = owner.visuals[index];
      pendingCorrections.delete(id);
      // A pipeline run, duplicate event, manual replacement, or edit may already
      // have consumed or invalidated this assessment. Never regenerate it twice.
      if (!frame || frame.ai_review?.job_id !== id || frame.ai_review.stale || job.paused ||
          job.state !== 'failed' || job.report?.regenerate_image !== true || !matches(job, frame, index) || job.attempt > settings().maxCorrections) continue;
      try { await correct(frame, index, job); }
      catch (error) {
        options.log?.(`Frame #${index + 1} · ${frame.target_filename}: ${error.message}`, index);
        if (reportView?.element?.isConnected) status(reportView.element, error.message);
        break;
      }
    }
  } finally { automaticCorrectionActive = false; changed(); reportView?.update(); }
}

async function prepare() {
  await ready;
  await loadContext();
  const values = await request({ type: 'AIR_LIST', projectKey: projectKey() });
  reports.clear(); values.jobs.forEach(job => reports.set(job.id, job));
  for (const [index, frame] of spec().visuals.entries()) {
    const belongs = job => job?.frameIndex === index && job.frameId === String(frame.id || frame.target_filename);
    const jobs = values.jobs.filter(job => belongs(job) && job.mediaUrl === frame.result_url).sort((a, b) => b.createdAt - a.createdAt);
    const saved = reports.get(frame.ai_review?.job_id || frame.ai_review?.request_id);
    const current = (belongs(saved) && (!frame.result_url || saved.mediaUrl === frame.result_url) ? saved : null) || jobs[0];
    if (current) {
      if (!frame.result_url && current.mediaUrl) options.applyCandidate?.(index, current);
      frame.ai_review = { ...frame.ai_review, job_id: current.id, request_id: current.id, attempt: current.attempt, original_prompt: current.originalPrompt, current_prompt: current.currentPrompt, state: current.state };
    }
  }
  changed();
  values.jobs.forEach(queueAutomaticCorrection);
  void flushAutomaticCorrections();
}
async function beforeRun() {
  await ready;
  if (!settings().enabled && !spec().visuals.some(shouldReview)) return;
  paused = false;
  await prepare();
  await resumeReviews();
}
async function resumeReviews() {
  // Recover only each frame's current candidate. Older corrected candidates
  // stay in history; resuming must not restart their reviews or corrections.
  const reconcileIds = spec().visuals.flatMap((frame, index) => {
    const job = reports.get(frame.ai_review?.job_id);
    return shouldReview(frame) && !frame.ai_review?.stale && matches(job, frame, index) ? [job.id] : [];
  });
  await request({ type: 'AIR_CONTROL', projectKey: projectKey(), action: 'resume', reconcileIds });
}
function makeRequest(frame, index, force = false) {
  if (!base || (!force && !shouldReview(frame))) return undefined;
  let prior = frame.ai_review || {};
  if (prior.original_prompt && (prior.current_prompt || prior.original_prompt) !== frame.prompt && frame.flow_submission?.state !== 'accepted') {
    prior = { force_review: prior.force_review, history: prior.history || [] };
  }
  const id = prior.request_id || crypto.randomUUID();
  const previous = options.previous?.(frame, index);
  if ((frame.frame_reference || frame.frame_ref || frame.continuity === 'continue') && !previous?.result_url) throw new Error(`Generate or reconnect the previous frame before reviewing ${frame.target_filename}.`);
  const previousJob = previous && reports.get(previous.ai_review?.job_id);
  frame.ai_review = { ...prior, force_review: force || prior.force_review === true, request_id: id, job_id: id, attempt: prior.attempt || 1, original_prompt: prior.original_prompt || frame.prompt, current_prompt: prior.current_prompt || frame.prompt, state: 'queued' };
  return { id, projectKey: projectKey(), frameIndex: index, frameId: String(frame.id || frame.target_filename), filename: frame.target_filename,
    flowTabId: spec().collection_tab_id, flowUrl: spec().collection_url,
    inputSignature: inputSignature(frame, index),
    attempt: frame.ai_review.attempt, originalPrompt: frame.ai_review.original_prompt, currentPrompt: frame.ai_review.current_prompt,
    reviewScope: REVIEW_SCOPE, reviewChatUrl: spec()?.ai_reviewer_chat_url, narration: frame.verbatim_script || '', references: [], settings: settings(),
    previousFrame: previous ? { frameId: String(previous.id || previous.target_filename), filename: previous.target_filename,
      mediaUrl: previous.result_url, submission: previous.flow_submission,
      assetId: previousJob?.mediaUrl === previous.result_url ? previousJob.candidateHash || null : null } : null };
}
function assertApproved(frame) {
  if (!base || !settings().enabled) return;
  const job = reports.get(frame.ai_review?.job_id);
  const index = spec().visuals.indexOf(frame);
  if (frame.ai_review?.stale || !job || !['passed', 'accepted'].includes(job.state) || !matches(job, frame, index)) throw new Error(`Reference ${frame.target_filename} must pass AI review before dependent frames can generate.`);
}
function refreshCards() {
  spec()?.visuals.forEach(updateFrame);
}
function updateFrame(frame, index) {
  const target = document.getElementById(`air-frame-${index}`);
  if (target) target.outerHTML = renderFrame(frame, index);
  const action = document.getElementById(`air-action-${index}`);
  if (action) {
    const state = reviewActionState(frame);
    action.disabled = state.disabled;
    action.title = state.title;
  }
}
function refresh() {
  // Refresh availability without saving the spec or calling back into the
  // pipeline's status update. This also preserves the focused action button.
  refreshCards();
  reportView?.update();
}
function renderFrame(frame, index) {
  const job = reports.get(frame.ai_review?.job_id);
  const state = frame.ai_review?.stale ? 'stale' : job?.state || frame.ai_review?.state || 'not reviewed';
  const labels = { 'not reviewed': 'Not reviewed', passed: 'Approved', accepted: 'Accepted', failed: 'Needs regeneration',
    error: 'Needs attention', uncertain: 'Needs attention', stale: 'Review outdated', queued: 'Queued', preparing: 'Preparing', ready: 'Uploading',
    send_intent: 'Sending', submitted: 'Reviewing', reviewing: 'Reviewing', correction_queued: 'Regenerating' };
  return `<div class="air-frame" id="air-frame-${index}" data-state="${escape(state)}"><span class="air-dot" aria-hidden="true"></span><span>AI review <strong>${escape(labels[state] || state)}</strong></span></div>`;
}
function reviewActionState(frame) {
  const job = reports.get(frame.ai_review?.job_id);
  if (job) return { disabled: false, title: 'Open this frame’s AI review' };
  if (!frame.result_url) return { disabled: true, title: 'Generate or Sync this frame before reviewing it' };
  if (reviewPreparing || automaticCorrectionActive) return { disabled: true, title: 'Wait for the current review preparation or correction to finish' };
  return { disabled: false, title: 'Review this frame with DeepSeek' };
}
function renderAction(frame, index) {
  const state = reviewActionState(frame);
  return `<button type="button" id="air-action-${index}" class="btn-footer-edit air-review-button" data-air-review="${index}" ${state.disabled ? 'disabled' : ''} title="${escape(state.title)}">✦ Review with AI</button>`;
}
async function loadProjectChat() {
  const key = projectKey();
  const value = await request({ type: 'AIR_CHAT_GET', projectKey: key });
  if (spec() && key === projectKey()) {
    projectChat = value.chat;
    if (projectChat?.url) { spec().ai_reviewer_chat_url = projectChat.url; options.onChange?.(); }
  }
  return value.chat;
}
function chatDetails(url) {
  return `<div class="air-chat-session"><div><strong>DeepSeek conversation</strong><span>${url ? 'All frame reviews use this conversation' : 'Saved automatically after your first review'}</span></div>${url ? `<input aria-label="DeepSeek conversation URL" readonly value="${escape(url)}"/>` : ''}</div>`;
}
function renderLaunch() { return '<button type="button" class="btn-dark-pill" data-air-open>AI reviewer</button>'; }
function mountLaunch() {
  const toolbar = document.querySelector('.spec-workspace-tabs');
  if (!toolbar || toolbar.querySelector('[data-air-open]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spec-workspace-tab air-launch';
  button.dataset.airOpen = '';
  button.textContent = 'AI reviewer';
  button.title = 'Narration and visual prompt review settings and reports';
  toolbar.appendChild(button);
}
function openDialog(title, body) {
  reportView = null;
  contextView = null;
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
  host?.remove(); host = document.createElement('dialog'); host.className = 'air-dialog';
  host.innerHTML = `<header><h2>${escape(title)}</h2><button type="button" data-air-close aria-label="Close reviewer">✕</button></header>${body}<p class="air-status" role="status"></p>`;
  const element = host;
  const close = () => { element.remove(); if (reportView?.element === element) reportView = null; previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; };
  document.body.appendChild(element); element.querySelector('[data-air-close]').onclick = close; element.addEventListener('cancel', close); element.showModal();
  element.querySelectorAll('[data-air-asset]').forEach(async image => {
    const asset = await get('assets', image.dataset.airAsset);
    if (!asset || !element.isConnected) return;
    const url = URL.createObjectURL(asset.blob); previewUrls.push(url); image.src = url;
  });
  return element;
}
const status = (element, value) => { const target = element.querySelector('.air-status'); if (target) target.textContent = value; };
async function loadContext() {
  const owner = spec();
  const value = await request({ type: 'AIR_CONTEXT_GET', projectKey: projectKey(), settings: settings() });
  if (spec() !== owner) throw new Error('The project changed while loading reviewer context.');
  if (owner.ai_reviewer_context_revision !== value.material.fingerprint) {
    owner.ai_reviewer_context_revision = value.material.fingerprint; changed();
  }
  return value;
}
async function importReviewContext(files, transcriptOnly = false) {
  const owner = spec(), items = Array.from(files);
  const imageFiles = items.filter(file => /\.(?:png|jpe?g|webp|gif)$/i.test(file.name)).sort((a, b) => a.name.localeCompare(b.name));
  const textFiles = items.filter(file => /\.(?:txt|md|json)$/i.test(file.name) && !/^(?:settings|index|references)\.json$|^(?:validator|readme)\.md$/i.test(file.name));
  const preferred = textFiles.filter(file => /^(?:transcript|raw_script)\.(?:txt|md|json)$/i.test(file.name));
  const transcripts = preferred.length ? preferred : textFiles;
  if (transcripts.length !== 1) throw new Error('Include exactly one transcript.txt (or transcript.json) in the contact_sheets folder.');
  if (!transcriptOnly && (!imageFiles.length || imageFiles.length > 20)) throw new Error('Select a folder containing 1–20 contact sheet images and its transcript.');
  const images = [];
  for (const file of imageFiles) {
    const mime = file.type || (/\.jpe?g$/i.test(file.name) ? 'image/jpeg' : `image/${file.name.split('.').pop().toLowerCase()}`);
    images.push({ ...await cacheImage(new Blob([file], { type: mime })), filename: file.name });
  }
  if (spec() !== owner) throw new Error('The project changed before importing context.');
  const saved = await request({ type: 'AIR_CONTEXT_SET', projectKey: projectKey(), images: transcriptOnly ? undefined : images,
    transcript: await transcripts[0].text(), transcriptName: transcripts[0].name });
  owner.ai_reviewer_context_revision = saved.fingerprint;
  changed();
}
async function importFolder(files) {
  const paths = Array.from(files).map(file => ({ file, path: file.webkitRelativePath?.split('/').slice(1).join('/') || file.name }));
  const named = name => paths.find(entry => entry.path.endsWith(name));
  const config = named('settings.json');
  const validator = named('validator.md');
  if (!config && !validator) throw new Error('Choose a folder containing settings.json or validator.md.');
  const nextSettings = normalizeSettings({ ...spec().ai_reviewer, ...(config ? JSON.parse(await config.file.text()) : {}), ...(validator ? { validator: await validator.file.text() } : {}) }, base);
  spec().ai_reviewer = nextSettings;
  changed();
  return Number(!!config) + Number(!!validator);
}
async function exportContext() {
  const folder = `${String(spec().project_name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_')}/ai-reviewer-context`;
  const files = [{ name: 'settings.json', blob: new Blob([JSON.stringify(settings(), null, 2)], { type: 'application/json' }) },
    { name: 'validator.md', blob: new Blob([settings().validator], { type: 'text/markdown' }) }];
  for (const file of files) {
    const url = URL.createObjectURL(file.blob);
    try { await request({ type: 'DOWNLOAD_RESOURCE', url, filename: file.name, folder, autoChangeFileName: true }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  return folder;
}
async function openSettings() {
  await ready;
  if (!spec()) {
    openDialog('AI reviewer', '<p>Load a spec or resume a saved project in Frames to configure narration and visual prompt review and view reports.</p>');
    return;
  }
  const owner = spec(), values = settings(), chat = await loadProjectChat(), context = await loadContext();
  const element = openDialog('AI reviewer settings', `<p class="air-intro">Check each image against its narration and visual prompt. Corrections return to the same frame.</p>
    ${chatDetails(chat?.url || spec().ai_reviewer_chat_url)}
    ${chat?.jobId ? '<button type="button" class="btn-dark-pill" data-air-open-chat>Open DeepSeek chat ↗</button>' : ''}
    <section class="air-chat-session"><strong>One-time project context</strong>
      <p>${context.material.imageCount} contact sheets · ${escape(context.material.transcriptName)} · ${context.material.transcriptCharacters.toLocaleString()} transcript characters</p>
      <p data-air-context-state role="status"></p>
      <div class="air-actions"><button type="button" class="btn-dark-pill air-primary" data-air-context-start>Initialize context</button><button type="button" class="btn-dark-pill" data-air-context-retry hidden>Retry context setup</button><button type="button" class="btn-dark-pill" data-air-context-chat hidden>Open context chat ↗</button></div>
      <details class="air-details"><summary>Replace contact sheets or transcript</summary><p>Place transcript.txt beside the sheets in E:\\Video_Visualyzer\\contact_sheets, then select that folder. The bundled package includes the provided timestamped transcript.</p>
      <label>Import contact_sheets folder<input type="file" data-air-context-folder webkitdirectory multiple/></label>
      <label>Replace transcript only<input type="file" data-air-context-transcript accept=".txt,.md,.json"/></label></details>
      <p>Instructions and context are sent once in a new DeepSeek chat. Later reviews send only their image, prompt, narration, and any previous frame. Replacing context or instructions initializes a new conversation.</p></section>
    <div class="air-actions"><button type="button" class="btn-dark-pill" data-air-pause>Pause reviews</button><button type="button" class="btn-dark-pill" data-air-resume>Resume reviews</button></div>
    <form><fieldset ${options.isRunning?.() ? 'disabled' : ''}>
    <label><input type="checkbox" name="enabled" ${values.enabled ? 'checked' : ''}/> Review new images automatically</label>
    <label><input type="checkbox" name="autoCorrect" ${values.autoCorrect ? 'checked' : ''}/> Automatically improve rejected images</label>
    <div class="air-fields"><label>Maximum corrections<input name="maxCorrections" type="number" min="0" max="5" value="${values.maxCorrections}"/></label><label>Timeout (seconds)<input name="timeoutSeconds" type="number" min="30" max="1800" value="${values.timeoutSeconds}"/></label></div>
    <details class="air-details"><summary>Review instructions</summary><label>Project context<textarea name="context" rows="3">${escape(values.context)}</textarea></label>
    <label>Validator instructions<textarea name="validator" rows="8">${escape(values.validator)}</textarea></label></details>
    <details class="air-details"><summary>Advanced page settings</summary><textarea name="selectors" rows="6">${escape(JSON.stringify(values.selectors, null, 2))}</textarea></details>
    <button type="submit" class="btn-dark-pill">Save reviewer settings</button>
    <hr/><p>Import settings.json and validator.md to customize the one-time review instructions. Contact sheets and transcript use the separate context importer above.</p>
    <label>Import instructions folder<input type="file" data-air-folder webkitdirectory multiple/></label>
    <button type="button" class="btn-dark-pill" data-air-export>Export instructions folder</button>
    </fieldset></form><p>Review errors never trigger image regeneration. Failed visual assessments allow at most ${values.maxCorrections} corrections.</p>`);
  element.querySelector('[data-air-open-chat]')?.addEventListener('click', async () => {
    try { await request({ type: 'AIR_OPEN', id: chat.jobId }); } catch (error) { status(element, error.message); }
  });
  const updateContext = job => {
    context.job = job;
    const active = job && !terminal(job);
    element.querySelector('[data-air-context-state]').textContent = job?.state === 'passed' ? 'Context ready · subsequent reviews reuse this chat' : job?.error || (active ? `Setting up context · ${job.phase || job.state}` : 'Not initialized · setup runs before the first review');
    const start = element.querySelector('[data-air-context-start]'); start.disabled = !!job;
    start.textContent = job?.state === 'passed' ? 'Context ready' : active ? 'Setting up context…' : 'Initialize context';
    element.querySelector('[data-air-context-retry]').hidden = !job || job.state !== 'error';
    element.querySelector('[data-air-context-chat]').hidden = !job?.chatUrl;
  };
  contextView = { element, owner, fingerprint: context.job?.contextFingerprint, update: updateContext };
  updateContext(context.job);
  element.querySelector('[data-air-context-start]').onclick = async event => {
    event.currentTarget.disabled = true;
    try { const result = await request({ type: 'AIR_CONTEXT_START', projectKey: projectKey(), settings: settings() }); await openSettings(); status(host, `Context setup queued (${result.jobId}).`); }
    catch (error) { status(element, error.message); event.currentTarget.disabled = false; }
  };
  element.querySelector('[data-air-context-retry]').onclick = async () => {
    try { await request({ type: 'AIR_CONTROL', projectKey: projectKey(), id: context.job.id, action: 'retry' }); await openSettings(); }
    catch (error) { status(element, error.message); }
  };
  element.querySelector('[data-air-context-chat]').onclick = async () => {
    try { await request({ type: 'AIR_OPEN', id: context.job.id }); } catch (error) { status(element, error.message); }
  };
  for (const selector of ['[data-air-context-folder]', '[data-air-context-transcript]']) element.querySelector(selector).onchange = async event => {
    if (options.isRunning?.() || spec() !== owner) { status(element, 'Pause the pipeline before changing context.'); return; }
    try { status(element, 'Caching contact sheets and transcript…'); await importReviewContext(event.target.files, selector.includes('transcript')); await openSettings(); status(host, 'Context imported. A new chat will be initialized before the next review.'); }
    catch (error) { status(element, error.message); }
  };
  element.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (options.isRunning?.() || spec() !== owner) return;
    try {
      const form = event.currentTarget;
      spec().ai_reviewer = normalizeSettings({ ...values, enabled: form.elements.enabled.checked, autoCorrect: form.elements.autoCorrect.checked,
        maxCorrections: form.elements.maxCorrections.value,
        timeoutSeconds: form.elements.timeoutSeconds.value, context: form.elements.context.value, validator: form.elements.validator.value, selectors: JSON.parse(form.elements.selectors.value) }, base);
      changed(); await openSettings(); status(host, 'Reviewer settings saved. Updated instructions initialize a new chat before the next review.'); void flushAutomaticCorrections();
    } catch (error) { status(element, error.message); }
  };
  element.querySelector('[data-air-export]').onclick = async () => {
    try { status(element, `Context files downloading to ${await exportContext()}.`); } catch (error) { status(element, error.message); }
  };
  element.querySelector('[data-air-pause]').onclick = () => { if (options.isRunning?.()) options.pausePipeline?.(); else pause(); status(element, 'New review submissions paused. Already submitted reviews are retained.'); };
  element.querySelector('[data-air-resume]').onclick = async () => {
    try { paused = false; await prepare(); await resumeReviews(); status(element, 'Review queue resumed; stopped response reads reopen the existing chat.'); void flushAutomaticCorrections(); } catch (error) { status(element, error.message); }
  };
  element.querySelectorAll('[data-air-folder]').forEach(input => { input.onchange = async () => {
    if (options.isRunning?.() || spec() !== owner) return;
    try {
      const count = await importFolder(input.files);
      await openSettings(); status(host, `${count} reviewer instruction file(s) imported.`);
    } catch (error) { status(element, error.message); }
  }; });
}
async function reviewExisting(index, candidateAssetId) {
  if (reviewPreparing || automaticCorrectionActive) throw new Error('Wait for the current review preparation or correction before reviewing another frame.');
  const owner = spec();
  reviewPreparing = true; changed();
  try {
    await ready; await prepare();
    if (spec() !== owner) throw new Error('The project changed before review could start.');
    const frame = spec().visuals[index];
    if (!frame.result_url) throw new Error('Generate or Sync this frame before reviewing it.');
    const mediaUrl = frame.result_url, previousJobId = frame.ai_review?.job_id;
    const existing = reports.get(frame.ai_review?.job_id);
    if (existing && !terminal(existing)) throw new Error('This frame already has an active review. Wait for it or resume the existing review.');
    if (!candidateAssetId && frame.result_url.startsWith('blob:')) {
      // Temporary URLs created by the panel can only be read here. Flow-owned
      // URLs fall back to capture in their source tab if this read fails.
      try {
        const response = await fetch(frame.result_url, { signal: AbortSignal.timeout(10000) });
        if (response.ok) candidateAssetId = (await cacheImage(await response.blob())).assetId;
      } catch { /* The worker can still obtain the image from Flow. */ }
    }
    // Flow generation can continue while a manual review is prepared. Only
    // enqueue the candidate the user clicked, never a replacement or old job.
    if (spec() !== owner || frame.result_url !== mediaUrl || frame.ai_review?.job_id !== previousJobId) throw new Error('This frame changed while preparing its review. Open its current image and review again.');
    resetFrame(frame, index, false);
    const data = makeRequest(frame, index, true);
    await request({ type: 'AIR_CANDIDATE', request: data, mediaUrl, candidateAssetId, submission: frame.flow_submission });
    // An explicit manual review starts this candidate even if the pipeline was paused.
    paused = false;
    await request({ type: 'AIR_CONTROL', projectKey: projectKey(), id: data.id, action: 'start' });
    changed();
  } finally { reviewPreparing = false; changed(); void flushAutomaticCorrections(); }
}
function reportDetails(job) {
  const labels = { queued: 'Queued for review', preparing: 'Reading and caching the generated image', ready: job?.phase === 'uploading' ? 'Uploading image to DeepSeek' : job?.phase === 'ready_to_send' ? 'Image uploaded; preparing to send review' : 'Opening the DeepSeek review chat',
    send_intent: 'Waiting for DeepSeek to accept the review', submitted: 'Waiting for DeepSeek’s assessment', reviewing: job?.phase === 'parsing_response' ? 'Response received; validating JSON' : 'Reading DeepSeek’s assessment', passed: 'Passed', failed: 'Visual assessment failed', uncertain: 'Needs your assessment', error: 'Review stopped', accepted: 'Accepted manually' };
  return `<div class="air-verdict" data-state="${escape(job?.state || 'idle')}"><span class="air-dot" aria-hidden="true"></span><div><strong role="status">${escape(job ? labels[job.state] || job.state : 'Ready for review')}${job?.paused && !terminal(job) ? ' · Paused' : ''}</strong><span>${job ? `Attempt ${job.attempt}` : 'Image, prompt, and narration will be sent to DeepSeek'}</span></div></div>
    ${job?.error ? `<p class="air-error">${escape(job.error)}</p>` : ''}
    ${job?.responseNormalization?.escapedControlCharacters ? `<p>JSON formatting recovered: ${job.responseNormalization.escapedControlCharacters} literal control character(s) escaped. Response text preserved.</p>` : ''}
    ${job?.raw && !job.report ? `<details><summary>Received DeepSeek response</summary><pre>${escape(job.raw)}</pre></details>` : ''}
    ${job?.responseSnapshot && !job.report ? `<details class="air-details"><summary>Last observed response · not yet validated</summary><pre>${escape(job.responseSnapshot)}</pre></details>` : ''}
    ${job?.responseStatus ? `<details class="air-details"><summary>Response tracking details</summary><pre>${escape(JSON.stringify(job.responseStatus, null, 2))}</pre></details>` : ''}
    ${job?.report ? `<p>${escape(reviewSummary(job))}</p>
      ${job.report.corrected_prompt ? `<details class="air-details"><summary>Corrected prompt</summary><pre>${escape(job.report.corrected_prompt)}</pre></details>` : ''}<details class="air-details"><summary>Review JSON</summary><pre>${escape(JSON.stringify(job.report, null, 2))}</pre></details>` : ''}`;
}
async function openReport(index, startIfNew = false) {
  await ready;
  const frame = spec()?.visuals[index]; if (!frame) return;
  const values = await request({ type: 'AIR_LIST', projectKey: projectKey() }); values.jobs.forEach(job => reports.set(job.id, job));
  let job = reports.get(frame.ai_review?.job_id);
  if (!job && startIfNew) { await reviewExisting(index); return openReport(index); }
  await loadProjectChat();
  const history = values.jobs.filter(job => job.frameIndex === index).sort((a, b) => b.createdAt - a.createdAt);
  const element = openDialog(`Review with AI · Frame #${frame.frame_number}`, `<p class="air-intro">${escape(frame.target_filename)}</p>
    ${frame.result_url ? `<div class="air-preview"><img src="${escape(frame.result_url)}" ${job?.candidateHash ? `data-air-asset="${escape(job.candidateHash)}"` : ''} alt="Frame ${frame.frame_number} being reviewed"/><div><span>Narration</span><p>${escape(frame.verbatim_script || 'Visual prompt only')}</p></div></div>` : ''}
    <div data-air-verdict>${reportDetails(job)}</div>
    <div data-air-session>${chatDetails(job?.chatUrl || projectChat?.url || spec().ai_reviewer_chat_url)}</div>
    <div class="air-actions"><button class="btn-dark-pill air-primary" data-review>${job ? 'Review again' : 'Review with AI'}</button><button class="btn-dark-pill air-primary" data-retry hidden>Retry existing review</button><button class="btn-dark-pill" data-chat hidden>Open DeepSeek ↗</button><button class="btn-dark-pill" data-accept hidden>Accept image</button><button class="btn-dark-pill" data-correct hidden>Regenerate frame</button></div>
    <input type="file" data-generated-file accept="image/png,image/jpeg,image/webp,image/gif" hidden/>
    <details class="air-details"><summary>Use a downloaded image</summary><p>If the Flow image cannot be read, select this frame’s saved image.</p><button class="btn-dark-pill" data-review-file>Choose image file</button></details>
    <details class="air-details"><summary>Attempt history · ${history.length}</summary>${history.map(value => `<article class="air-attempt"><img src="${escape(value.mediaUrl)}" ${value.candidateHash ? `data-air-asset="${escape(value.candidateHash)}"` : ''} alt="Candidate attempt ${value.attempt}" loading="lazy"/><div><strong>Attempt ${value.attempt} · ${escape(value.state)}</strong><p>${escape(reviewSummary(value) || value.error || '')}</p><small>${escape(new Date(value.createdAt).toLocaleString())}</small></div></article>`).join('')}</details>`);
  element.classList.add('air-review-dialog');
  const owner = spec();
  const update = () => {
    if (!element.isConnected || spec() !== owner) return;
    job = reports.get(frame.ai_review?.job_id);
    element.querySelector('[data-air-verdict]').innerHTML = reportDetails(job);
    element.querySelector('[data-air-session]').innerHTML = chatDetails(job?.chatUrl || projectChat?.url || spec().ai_reviewer_chat_url);
    const busy = !!job && !terminal(job);
    for (const selector of ['[data-review]', '[data-review-file]']) element.querySelector(selector).disabled = busy || reviewPreparing || automaticCorrectionActive;
    const show = (selector, visible, disabled = false) => { const button = element.querySelector(selector); button.hidden = !visible; button.disabled = disabled; };
    show('[data-review]', !job || ['passed', 'accepted'].includes(job.state), reviewPreparing || automaticCorrectionActive);
    show('[data-retry]', !!job && (['error', 'uncertain'].includes(job.state) || job.paused && busy), busy && !job.paused);
    show('[data-chat]', !!job?.tabId || !!job?.chatUrl);
    show('[data-accept]', !!job?.candidateHash && terminal(job) && !['passed', 'accepted'].includes(job.state), automaticCorrectionActive || !!options.isRunning?.());
    show('[data-correct]', job?.state === 'failed' && job.attempt <= settings().maxCorrections, automaticCorrectionActive || !!options.isRunning?.());
  };
  reportView = { element, update }; update();
  const action = (selector, fn) => { element.querySelector(selector)?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await fn(); await openReport(index); } catch (error) { status(element, error.message); button.disabled = false; }
  }); };
  action('[data-review]', () => { status(element, 'Queuing the generated image with its prompt and narration…'); return reviewExisting(index); });
  element.querySelector('[data-review-file]').onclick = () => element.querySelector('[data-generated-file]').click();
  element.querySelector('[data-generated-file]').onchange = async event => {
    const file = event.currentTarget.files[0]; if (!file) return;
    element.querySelector('[data-review-file]').disabled = true;
    try {
      status(element, 'Reading the selected generated image and queuing its review…');
      const asset = await cacheImage(file);
      await reviewExisting(index, asset.assetId);
      await openReport(index);
    } catch (error) { status(element, error.message); element.querySelector('[data-review-file]').disabled = false; }
  };
  action('[data-retry]', () => request({ type: 'AIR_CONTROL', projectKey: projectKey(), id: job.id, action: job.paused && !terminal(job) ? 'start' : 'retry' }));
  action('[data-chat]', () => request({ type: 'AIR_OPEN', id: job.id }));
  action('[data-accept]', async () => { await request({ type: 'AIR_CONTROL', projectKey: projectKey(), id: job.id, action: 'accept', inputSignature: inputSignature(frame, index) }); options.applyCandidate?.(index, job); frame.ai_review = { ...frame.ai_review, job_id: job.id, request_id: job.id, stale: false }; changed(); });
  action('[data-correct]', async () => { if (options.isRunning?.()) throw new Error('Pause generation first.'); await correct(frame, index, job); });
}
function resetFrame(frame, index, invalidate = true) {
  frame.ai_review = { original_prompt: frame.prompt, current_prompt: frame.prompt, attempt: 1, history: frame.ai_review?.history || [] };
  if (invalidate) invalidateDescendants(frame, index);
}
function invalidateDescendants(frame, index) {
  const replaced = new Set([frame]);
  for (let i = index + 1; i < (spec()?.visuals.length || 0); i++) {
    const child = spec().visuals[i];
    if (replaced.has(options.previous?.(child, i)) && child.result_url) { child.ai_review = { ...child.ai_review, stale: true }; replaced.add(child); }
  }
}
async function waitJob(id) {
  for (;;) {
    if (paused) throw new Error('Reviewer paused. Resume to reconcile the existing chat.');
    const job = (await request({ type: 'AIR_GET', id })).job;
    reports.set(id, job);
    if (terminal(job)) return job;
    await new Promise(resolve => {
      const listener = message => { if (message.type === 'AIR_JOB_UPDATED' && message.job.id === id) finish(); };
      const finish = () => { clearTimeout(timer); chrome.runtime.onMessage.removeListener(listener); resolve(); };
      const timer = setTimeout(finish, 15000); chrome.runtime.onMessage.addListener(listener);
    });
  }
}
async function correct(frame, index, job) {
  if (!job.report?.corrected_prompt || job.state !== 'failed') throw new Error('Only a failed visual assessment can trigger a correction.');
  if (frame.ai_review?.job_id !== job.id) throw new Error('This assessment has already been used or replaced.');
  if (job.attempt > settings().maxCorrections) throw new Error('Correction limit reached. Review or accept a candidate manually.');
  const owner = spec();
  paused = false;
  await request({ type: 'AIR_CONTROL', projectKey: projectKey(), action: 'resume' });
  if (paused || spec() !== owner || frame.ai_review?.job_id !== job.id) throw new Error('Correction paused or its frame changed before generation.');
  frame.ai_review = { ...frame.ai_review, job_id: null, request_id: null, state: 'correction_queued', attempt: job.attempt + 1,
    original_prompt: job.originalPrompt, force_review: true, published: false, current_prompt: job.report.corrected_prompt, history: [...(frame.ai_review?.history || []), job.id] };
  frame.prompt = job.report.corrected_prompt;
  delete frame.ai_review.previous_issues;
  invalidateDescendants(frame, index);
  changed();
  return options.generateCorrection(index);
}
async function afterBatch(indexes) {
  if (!base) return;
  for (const index of indexes) {
    try {
      const frame = spec().visuals[index];
      if (!shouldReview(frame)) continue;
      if (frame.ai_review?.stale) throw new Error(`${frame.target_filename} uses a replaced predecessor. Re-roll it before approving its descendants.`);
      if (frame.ai_review?.job_id) {
        const existing = (await request({ type: 'AIR_GET', id: frame.ai_review.job_id })).job;
        // A review ID can be saved before Flow finishes and before its durable
        // review job exists. Queue the recovered candidate instead of waiting
        // forever for that missing job; keep its unsent request ID for dedupe.
        if (!existing.id) frame.ai_review.job_id = null;
        if (existing.id && frame.ai_review?.job_id === existing.id && !matches(existing, frame, index)) {
          // Reconcile the old chat first; changed context warrants a new review, not a new image.
          if (!terminal(existing)) await waitJob(existing.id);
          frame.ai_review = { ...frame.ai_review, job_id: null, request_id: null, original_prompt: frame.prompt, published: false };
        }
      }
      if (!frame.ai_review?.job_id) {
        const data = makeRequest(frame, index);
        await request({ type: 'AIR_CANDIDATE', request: data, mediaUrl: frame.result_url, submission: frame.flow_submission }); changed();
      }
      for (;;) {
        const job = await waitJob(frame.ai_review.job_id);
        // A manual review may have replaced a completed assessment while this
        // pipeline was awaiting it. Follow the current job, not that old result.
        if (job.id !== frame.ai_review?.job_id) continue;
        frame.ai_review.state = job.state; changed();
        if (['passed', 'accepted'].includes(job.state)) {
          if (!frame.ai_review.published) { await publishApproved(index, job); frame.ai_review.published = true; changed(); }
          break;
        }
        if (job.state !== 'failed' || !settings().autoCorrect || job.attempt > settings().maxCorrections || paused) throw new Error(`AI review ${job.state} for ${frame.target_filename}: ${job.error || reviewSummary(job) || 'manual attention required'}`);
        await correct(frame, index, job);
      }
    } catch (error) {
      error.reviewFrameIndex = index;
      throw error;
    }
  }
}
async function publishApproved(index, job) {
  // Download the bytes that were assessed, including a selected local candidate,
  // rather than refetching a temporary or expired original image address.
  const asset = job.candidateHash && await get('assets', job.candidateHash);
  if (!asset) throw new Error('The approved image is no longer cached. Review the generated image again before downloading it.');
  const url = URL.createObjectURL(asset.blob);
  try { await options.publish(index, url); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
function pause() { paused = true; if (spec()) void request({ type: 'AIR_CONTROL', projectKey: projectKey(), action: 'pause' }).catch(error => options.log?.(error.message)); }
function captured(frame, jobId) { if (jobId) frame.ai_review = { ...frame.ai_review, job_id: jobId, state: reports.get(jobId)?.state || 'queued' }; }
const hasUnapproved = () => base && spec()?.visuals.some((frame, index) => {
  if (!shouldReview(frame)) return false;
  const job = reports.get(frame.ai_review?.job_id);
  return frame.ai_review?.stale || !['passed', 'accepted'].includes(job?.state) || !matches(job, frame, index);
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type !== 'AIR_JOB_UPDATED' || message.job.projectKey !== projectKey()) return;
  reports.set(message.job.id, message.job);
  if (message.job.kind === 'context' && contextView?.element?.isConnected && contextView.owner === spec() && (!contextView.fingerprint || contextView.fingerprint === message.job.contextFingerprint)) {
    contextView.fingerprint = message.job.contextFingerprint; contextView.update(message.job);
  }
  if (message.job.chatUrl) {
    projectChat = { url: message.job.chatUrl, jobId: message.job.id, tabId: message.job.tabId };
    if (spec() && spec().ai_reviewer_chat_url !== message.job.chatUrl) {
      spec().ai_reviewer_chat_url = message.job.chatUrl; options.onChange?.();
    }
  }
  const frame = spec()?.visuals[message.job.frameIndex];
  if (frame && frame.ai_review?.job_id === message.job.id) { frame.ai_review.state = message.job.state; options.onChange?.(); }
  refreshCards();
  reportView?.update();
  queueAutomaticCorrection(message.job);
  void flushAutomaticCorrections();
});
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-air-open], [data-air-report], [data-air-review]'); if (!button) return;
  (button.hasAttribute('data-air-open') ? openSettings() : openReport(Number(button.dataset.airReview ?? button.dataset.airReport), button.hasAttribute('data-air-review'))).catch(error => {
    options.log?.(error.message);
    openDialog('AI reviewer unavailable', `<p class="air-error">${escape(error.message)}</p><p>Reload the unpacked extension and reopen the panel.</p>`);
  });
});
const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = chrome.runtime.getURL(ROOT + 'panel.css'); document.head.appendChild(link);
globalThis.PipelineReviewer = { configure(value) { options = value; }, renderLaunch, renderFrame, renderAction, updateFrame, refresh, beforeRun, afterBatch, makeRequest, assertApproved, isBusy: () => reviewPreparing || automaticCorrectionActive, flushAutomaticCorrections,
  pause, captured, resetFrame, hasUnapproved, shouldReview, settings: () => base ? settings() : null };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLaunch, { once: true });
else mountLaunch();
document.dispatchEvent(new Event('pipeline-reviewer-ready'));
ready.catch(error => console.error('AI reviewer defaults could not load:', error));
