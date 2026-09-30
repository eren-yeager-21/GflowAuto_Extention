import { defaults, normalizeSettings, parseReport, prompt, terminal, ROOT, REVIEW_SCOPE, reviewSummary, deepseekChatUrl, recoverableResponseTimeout } from './contract.js';
import { all, get, put, wireAsset } from './store.js';
import { imageSource, obtainCandidate, sourceInfo } from './image-source.js';
import { bundledMaterial, material, contextFingerprint, contextPrompt, parseContext } from './context.js';

const alarm = 'ai-reviewer-wake';
let pumping = false;
let pumpAgain = false;
let serial = Promise.resolve();
const ordered = fn => { const next = serial.then(fn); serial = next.catch(() => {}); return next; };
const extensionPage = sender => !sender.tab && sender.id === chrome.runtime.id;
const deepseekPage = sender => sender.tab && sender.url?.startsWith('https://chat.deepseek.com/');
const flowPage = sender => sender.tab && sender.url?.startsWith('https://flow.google.com/');
const safeName = value => String(value || 'image').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
async function publish(job, { log = true } = {}) {
  await put('jobs', job);
  chrome.runtime.sendMessage({ type: 'AIR_JOB_UPDATED', job: summary(job) }).catch(() => {});
  if (log) chrome.runtime.sendMessage({ type: 'ACTION_LOG', data: { source: 'AI Reviewer', level: job.state === 'error' ? 'error' : ['failed', 'uncertain'].includes(job.state) ? 'warn' : 'info',
    promptIndex: job.kind === 'context' ? undefined : job.frameIndex, frameName: job.filename, phase: `${job.kind === 'context' ? 'Context' : 'Review'} ${job.phase || job.state}`, message: `${job.kind === 'context' ? 'Project context' : `Frame #${job.frameIndex + 1} · ${job.filename} · attempt ${job.attempt}`}: ${job.error || (job.phase === 'parsing_response' ? 'DeepSeek response extracted; validating JSON' : reviewSummary(job)) || (job.state === 'ready' && job.phase === 'uploading' ? 'uploading images to DeepSeek' : job.state === 'ready' && job.phase === 'ready_to_send' ? 'images uploaded; preparing to send' : job.state)}`, details: { reviewId: job.id, contextId: job.contextId, chatUrl: job.chatUrl, candidateHash: job.candidateHash, imageSource: sourceInfo(job.mediaUrl), selectedFile: !!job.candidateAssetId, uploadStatus: job.uploadStatus, responseStatus: job.responseStatus, responseCharacters: job.raw?.length || 0, reconciling: job.reconciling === true } } }).catch(() => {});
  return job;
}
async function transition(id, changes) {
  return ordered(async () => {
    const current = await get('jobs', id);
    if (!current || terminal(current)) return current;
    return publish({ ...current, ...changes, updatedAt: Date.now() });
  });
}
function summary(job) { const { settings, attachments, promptText, ...value } = job; return { ...value, attachmentCount: attachments?.length || 0 }; }
async function prepare(job) {
  const asset = await obtainCandidate(job);
  if (asset.width * asset.height > 80000000) throw new Error('Generated image is too large for review.');
  if (Math.min(asset.width, asset.height) < job.settings.minimumShortSide) throw new Error('Candidate resolution is below the configured review minimum. Obtain the full-size image.');
  const suffix = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime.split('/')[1];
  job.attachments = [{ ...asset, name: job.filename, role: 'candidate', filename: `CANDIDATE__${safeName(job.filename)}.${suffix}` }];
  job.candidateHash = asset.assetId;
  if (job.previousFrame) {
    const previous = await obtainCandidate({ ...job, mediaUrl: job.previousFrame.mediaUrl, submission: job.previousFrame.submission,
      candidateAssetId: job.previousFrame.assetId || null });
    if (previous.width * previous.height > 80000000) throw new Error('Previous-frame image is too large for review.');
    const suffix = previous.mime === 'image/jpeg' ? 'jpg' : previous.mime.split('/')[1];
    job.attachments.push({ ...previous, name: job.previousFrame.filename, role: 'previous-frame', filename: `PREVIOUS_FRAME__${safeName(job.previousFrame.filename)}.${suffix}` });
  }
  job.promptText = prompt(job);
}
async function contextMaterial(projectKey) {
  const pack = await get('context', projectKey) || { id: projectKey };
  if (pack.material) return pack.material;
  const seed = await bundledMaterial();
  await put('context', { ...pack, material: seed });
  return seed;
}
async function contextJob(projectKey, settings) {
  const seed = await contextMaterial(projectKey), fingerprint = await contextFingerprint(seed, settings);
  const existing = (await all('jobs')).find(job => job.projectKey === projectKey && job.kind === 'context' && job.contextFingerprint === fingerprint);
  if (existing) return existing;
  const job = { id: `context-${crypto.randomUUID()}`, kind: 'context', projectKey, frameIndex: -1, frameId: 'context',
    filename: seed.transcriptName, attempt: 1, reviewScope: REVIEW_SCOPE, settings, contextFingerprint: fingerprint,
    candidateHash: seed.fingerprint, attachments: seed.images.map(image => ({ ...image, role: 'contact-sheet' })),
    newConversation: true, state: 'ready', chatUrl: null, tabId: null, error: null,
    paused: (await get('context', projectKey))?.paused === true, createdAt: Date.now(), updatedAt: Date.now() };
  job.promptText = contextPrompt(job, seed);
  await publish(job);
  return job;
}
async function requireContext(job) {
  const setup = job.contextId ? await get('jobs', job.contextId) : await ordered(() => contextJob(job.projectKey, job.settings));
  if (!setup || setup.state === 'error') {
    const error = new Error(`Project context is not ready: ${setup?.error || 'context setup is missing'}. Open AI reviewer settings and retry context setup.`);
    error.code = 'context_setup'; throw error;
  }
  if (setup.state !== 'passed') { if (!setup.paused) pumpAgain = true; return null; }
  if (!deepseekChatUrl(setup.chatUrl)) throw new Error('The initialized context has no saved DeepSeek chat URL.');
  return setup;
}
async function reviewChat(projectKey) {
  const pack = await get('context', projectKey);
  if (deepseekChatUrl(pack?.reviewChat?.url)) return { ...pack.reviewChat, url: deepseekChatUrl(pack.reviewChat.url) };
  // Reuse a conversation the extension already initiated for this project.
  const previous = (await all('jobs')).filter(job => job.projectKey === projectKey && deepseekChatUrl(job.chatUrl))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return previous ? { url: deepseekChatUrl(previous.chatUrl), tabId: previous.tabId, jobId: previous.id } : null;
}
async function rememberReviewChat(job, value) {
  const url = deepseekChatUrl(value);
  if (!url) return;
  const pack = await get('context', job.projectKey);
  await put('context', { ...(pack || {}), id: job.projectKey,
    reviewChat: { url, tabId: job.tabId, jobId: job.id, updatedAt: Date.now() } });
}
async function ensureTab(job) {
  // Send may have created a conversation just before its acknowledgement was
  // interrupted. Preserve that owned tab for reconciliation instead of sending
  // it back to the home page; the adapter still verifies this exact review ID.
  if (job.sentAt && !deepseekChatUrl(job.chatUrl) && Number.isInteger(job.tabId)) {
    const existing = await chrome.tabs.get(job.tabId).catch(() => null);
    const observed = deepseekChatUrl(existing?.url);
    if (observed) {
      job.chatUrl = observed;
      if (terminal(job)) await ordered(async () => {
        const current = await get('jobs', job.id); await publish({ ...current, chatUrl: observed });
      });
      else await transition(job.id, { chatUrl: observed });
    }
  }
  if (['send_intent', 'submitted', 'reviewing'].includes(job.state) && !job.chatUrl) throw new Error('Review submission may have been sent, but no chat URL was captured. Reconcile it manually; it will not be sent again.');
  const session = !job.sentAt && !terminal(job) && !job.chatUrl && !job.newConversation ? await reviewChat(job.projectKey) : null;
  const target = job.newConversation && !job.sentAt ? 'https://chat.deepseek.com/' : deepseekChatUrl(job.chatUrl) || session?.url || 'https://chat.deepseek.com/';
  const jobs = await all('jobs');
  const ownedByOther = tab => jobs.some(value => value.id !== job.id && value.tabId === tab.id && !terminal(value));
  const saved = await chrome.storage.local.get('ai_reviewer_owned_tab');
  let reusable;
  for (const id of new Set([job.tabId, session?.tabId, saved.ai_reviewer_owned_tab])) {
    if (!Number.isInteger(id)) continue;
    const candidate = await chrome.tabs.get(id).catch(() => null);
    if (!candidate?.url?.startsWith('https://chat.deepseek.com/')) continue;
    if (ownedByOther(candidate)) {
      if (terminal(job) && deepseekChatUrl(candidate.url) === target) return candidate;
      continue;
    }
    reusable = candidate; break;
  }
  const atTarget = reusable && (deepseekChatUrl(reusable.url) || reusable.url) === target;
  const tab = reusable ? atTarget ? reusable : await chrome.tabs.update(reusable.id, { url: target })
    : await chrome.tabs.create({ url: target, active: false });
  await chrome.storage.local.set({ ai_reviewer_owned_tab: tab.id });
  job.tabId = tab.id;
  job.chatUrl = deepseekChatUrl(target);
  await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  if (terminal(job)) await ordered(async () => { const current = await get('jobs', job.id); await publish({ ...current, tabId: tab.id }); });
  else await transition(job.id, { tabId: tab.id, chatUrl: job.chatUrl });
  return tab;
}
async function process(job) {
  if (job.paused) return;
  if (job.kind !== 'context' && !job.sentAt) {
    const setup = await requireContext(job);
    if (!setup) return;
    if (job.contextId !== setup.id || job.chatUrl !== setup.chatUrl) job = await transition(job.id, { contextId: setup.id, chatUrl: setup.chatUrl,
      state: 'queued', attachments: null, promptText: null });
    if (job.paused || terminal(job)) return;
  }
  if (job.kind !== 'context' && !job.sentAt && job.reviewScope !== REVIEW_SCOPE) {
    const base = await defaults();
    job = await transition(job.id, { state: 'queued', reviewScope: REVIEW_SCOPE, references: [], guidance: '',
      settings: normalizeSettings(job.settings, base), attachments: null, promptText: null, tabId: null });
    if (job.paused || terminal(job)) return;
  }
  if (job.state === 'queued' || job.state === 'preparing') {
    job = await transition(job.id, { state: 'preparing' });
    if (job.paused || terminal(job)) return;
    await prepare(job);
    job = await transition(job.id, { state: 'ready', attachments: job.attachments, candidateHash: job.candidateHash, promptText: job.promptText });
    if (job.paused || terminal(job)) return;
  }
  // The adapter owns the response timeout. A deadline measured from the old
  // Send would expire restored reviews before their saved chat could be read.
  const tab = await ensureTab(job);
  if (tab.status !== 'complete') return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [ROOT + 'deepseek.js'] });
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'AIR_RUN', id: job.id });
  if (!response?.success) throw new Error(response?.error || 'DeepSeek reviewer adapter is unavailable.');
}
async function pump() {
  if (pumping) { pumpAgain = true; return; }
  pumping = true;
  try {
    const jobs = (await all('jobs')).filter(job => !terminal(job)).sort((a, b) => a.createdAt - b.createdAt);
    // A paused submitted job still owns its chat/queue slot. Resume or reconcile it first.
    const active = jobs.find(job => job.sentAt) || jobs.find(job => !job.paused && job.kind === 'context') || jobs.find(job => !job.paused && ['ready', 'preparing'].includes(job.state));
    const job = active || jobs.find(job => !job.paused);
    if (job && !job.paused) await process(job).catch(error => ordered(async () => {
      const current = await get('jobs', job.id);
      if (current && !terminal(current) && !current.paused) await publish({ ...current, state: 'error', error: error.message, errorCode: error.code || null, updatedAt: Date.now() });
    }));
    if (jobs.length) await chrome.alarms.create(alarm, { delayInMinutes: 0.5 });
  } finally { pumping = false; if (pumpAgain) { pumpAgain = false; void pump(); } }
}
async function checkpoint(message, sender) {
  return ordered(async () => {
    const job = await get('jobs', message.id);
    if (!job || job.tabId !== sender.tab.id || terminal(job)) return { success: false, error: 'This chat no longer owns an active review.' };
    if ((message.state === 'send_intent' || message.phase === 'uploading') && job.paused) return { success: true, paused: true };
    if (['uploading', 'ready_to_send'].includes(message.phase) && job.state === 'ready') job.phase = message.phase;
    if (message.phase === 'ready_to_send' && job.state === 'ready' && message.uploadStatus) {
      job.uploadStatus = { thumbnails: Number(message.uploadStatus.thumbnails), loadedThumbnails: Number(message.uploadStatus.loadedThumbnails),
        uploadBusy: message.uploadStatus.uploadBusy === true, sendFound: message.uploadStatus.sendFound === true, sendEnabled: message.uploadStatus.sendEnabled === true, sendArrow: message.uploadStatus.sendArrow === true };
    }
    if (deepseekChatUrl(message.chatUrl)) {
      job.chatUrl = deepseekChatUrl(message.chatUrl);
      await rememberReviewChat(job, job.chatUrl);
    }
    if (message.state && ['send_intent', 'submitted', 'reviewing'].includes(message.state)) {
      if (message.state === 'send_intent' && job.state !== 'ready') return { success: false, error: 'This review was already submitted or needs reconciliation.' };
      job.state = message.state;
      job.phase = null;
      if (!job.sentAt) job.sentAt = Date.now();
      if (message.state === 'send_intent') job.reconciling = false;
    }
    await publish(job);
    return { success: true, paused: job.paused };
  });
}
async function dispatch(message, sender) {
  if (['AIR_JOB_UPDATED', 'AIR_WAKE'].includes(message.type)) return undefined;
  if (deepseekPage(sender)) {
    if (message.type === 'AIR_CHECKPOINT') return checkpoint(message, sender);
    const job = await get('jobs', message.id);
    if (!job || job.tabId !== sender.tab.id) throw new Error('Unknown review chat.');
    if (message.type === 'AIR_ADAPTER_IDLE') { void pump(); return { success: true }; }
    if (message.type === 'AIR_JOB_CONTEXT') return { success: true, job, files: job.state === 'ready' ? await Promise.all(job.attachments.map(a => wireAsset(a.assetId, a.filename))) : [] };
    if (message.type === 'AIR_RESULT') return ordered(async () => {
      const current = await get('jobs', message.id);
      if (terminal(current)) return { success: true };
      if (typeof message.raw !== 'string' || message.raw.length > 120000) throw new Error('Invalid reviewer response length.');
      const received = await publish({ ...current, state: 'reviewing', phase: 'parsing_response', raw: message.raw, report: null,
        responseReceivedAt: Date.now(), chatUrl: message.chatUrl || current.chatUrl, error: null, errorCode: null,
        responseStatus: null, responseSnapshot: null, reconciling: false, updatedAt: Date.now() });
      try {
        const parsed = received.kind === 'context' ? parseContext(received.raw, received) : parseReport(received.raw, received);
        await publish({ ...received, ...parsed, phase: null, updatedAt: Date.now() });
      } catch (error) {
        await publish({ ...received, state: 'error', phase: null,
          error: `Could not validate DeepSeek's JSON: ${error.message} The received response is saved in View review.`, updatedAt: Date.now() });
      }
      void pump(); return { success: true };
    });
    if (message.type === 'AIR_ADAPTER_ERROR') {
      await ordered(async () => {
        const current = await get('jobs', message.id);
        if (!terminal(current) && !current.paused) await publish({ ...current, state: 'error', error: String(message.error),
          errorCode: message.code === 'response_timeout' ? message.code : null,
          responseStatus: message.responseStatus && typeof message.responseStatus === 'object' ? message.responseStatus : null,
          responseSnapshot: typeof message.responseSnapshot === 'string' ? message.responseSnapshot.slice(0, 120000) : null, updatedAt: Date.now() });
      });
      void pump(); return { success: true };
    }
    throw new Error('Unsupported chat operation.');
  }
  if (message.type === 'AIR_CANDIDATE' && (flowPage(sender) || extensionPage(sender))) return ordered(async () => {
    const request = message.request;
    if (!request?.id || typeof request.id !== 'string' || request.id.length > 100 || !Number.isInteger(request.frameIndex) || request.frameIndex < 0 ||
        typeof request.projectKey !== 'string' || !request.projectKey || request.projectKey.length > 2000 ||
        !Array.isArray(request.references) || request.references.length > 11) throw new Error('Invalid review request.');
    const existing = await get('jobs', request.id);
    if (existing) {
      if (existing.mediaUrl !== message.mediaUrl) throw new Error('Review attempt ID already belongs to a different image.');
      return { success: true, jobId: existing.id };
    }
    const base = await defaults();
    const settings = normalizeSettings(request.settings, base);
    const mediaUrl = imageSource(message.mediaUrl);
    let previousFrame = null;
    if (request.previousFrame) {
      const previous = request.previousFrame;
      if (typeof previous.frameId !== 'string' || !previous.frameId || previous.frameId.length > 200 ||
          typeof previous.filename !== 'string' || !previous.filename || previous.filename.length > 200) throw new Error('Invalid previous-frame identity.');
      if (previous.assetId && (!/^[a-f0-9]{64}$/.test(previous.assetId) || !await get('assets', previous.assetId))) throw new Error('The previous-frame image is no longer cached. Reconnect that frame before reviewing.');
      previousFrame = { frameId: previous.frameId, filename: previous.filename, mediaUrl: imageSource(previous.mediaUrl),
        assetId: previous.assetId || null, submission: previous.submission || null };
    }
    let candidateAssetId = null;
    if (message.candidateAssetId) {
      if (!/^[a-f0-9]{64}$/.test(message.candidateAssetId) || !await get('assets', message.candidateAssetId)) throw new Error('The selected generated image file is not cached. Choose it again.');
      candidateAssetId = message.candidateAssetId;
    }
    const setup = await contextJob(request.projectKey, settings);
    const job = { ...request, previousFrame, candidateAssetId, flowTabId: flowPage(sender) ? sender.tab.id : request.flowTabId,
      kind: 'review', contextId: setup.id, reviewScope: REVIEW_SCOPE, references: [], guidance: '', settings, mediaUrl, submission: message.submission || null,
      tabId: null, chatUrl: deepseekChatUrl(request.reviewChatUrl), state: 'queued', error: null, createdAt: Date.now(), updatedAt: Date.now() };
    job.paused = (await get('context', job.projectKey))?.paused === true;
    await publish(job); void pump(); return { success: true, jobId: job.id };
  });
  if (!extensionPage(sender)) throw new Error('Reviewer controls are available only inside the extension.');
  if (message.type === 'AIR_CONTEXT_GET') {
    const seed = await ordered(() => contextMaterial(message.projectKey));
    const settings = normalizeSettings(message.settings, await defaults());
    const fingerprint = await contextFingerprint(seed, settings);
    const job = (await all('jobs')).find(job => job.projectKey === message.projectKey && job.kind === 'context' && job.contextFingerprint === fingerprint);
    return { success: true, material: { fingerprint: seed.fingerprint, imageCount: seed.images.length, transcriptName: seed.transcriptName, transcriptCharacters: seed.transcript.length }, job: job ? summary(job) : null };
  }
  if (message.type === 'AIR_CONTEXT_SET') return ordered(async () => {
    if ((await all('jobs')).some(job => job.projectKey === message.projectKey && !terminal(job))) throw new Error('Finish or reconcile active reviews before changing their project context.');
    const pack = await get('context', message.projectKey) || { id: message.projectKey };
    const seed = await material(message.images || (await contextMaterial(message.projectKey)).images, message.transcript, message.transcriptName);
    await put('context', { ...pack, material: seed });
    return { success: true, fingerprint: seed.fingerprint };
  });
  if (message.type === 'AIR_CONTEXT_START') return ordered(async () => {
    const settings = normalizeSettings(message.settings, await defaults());
    const job = await contextJob(message.projectKey, settings);
    if (job.paused && !terminal(job)) await publish({ ...job, paused: false });
    void pump(); return { success: true, jobId: job.id, state: job.state };
  });
  if (message.type === 'AIR_CHAT_GET') return { success: true, chat: await reviewChat(message.projectKey) };
  if (message.type === 'AIR_LIST') return { success: true, jobs: (await all('jobs')).filter(job => job.projectKey === message.projectKey).map(summary) };
  if (message.type === 'AIR_GET') return { success: true, job: summary(await get('jobs', message.id) || {}) };
  if (message.type === 'AIR_CONTROL') return ordered(async () => {
    if (!['pause', 'resume', 'retry', 'accept', 'start'].includes(message.action)) throw new Error('Unsupported reviewer control.');
    if (message.reconcileIds !== undefined && (!Array.isArray(message.reconcileIds) || message.reconcileIds.length > 10000 || message.reconcileIds.some(id => typeof id !== 'string'))) throw new Error('Invalid review recovery list.');
    const reconcileIds = new Set(message.reconcileIds || []);
    if (['pause', 'resume'].includes(message.action)) {
      const pack = await get('context', message.projectKey);
      await put('context', { ...(pack || { references: [] }), id: message.projectKey, paused: message.action === 'pause' });
    }
    const jobs = (await all('jobs')).filter(job => job.projectKey === message.projectKey && (!message.id || job.id === message.id));
    // A manually started candidate also needs its opening context message.
    // Project-wide pause remains intact for other queued reviews.
    if (message.action === 'start') for (const job of jobs) {
      const setup = job.contextId && await get('jobs', job.contextId);
      if (setup?.paused && !terminal(setup)) await publish({ ...setup, paused: false });
    }
    for (const job of jobs) {
      if (message.action === 'accept') {
        if (!job.candidateHash) throw new Error('No captured candidate is available to accept.');
        job.manualAcceptance = { at: Date.now(), assessedInputSignature: job.inputSignature };
        if (typeof message.inputSignature === 'string') job.inputSignature = message.inputSignature;
        job.state = 'accepted'; job.error = null;
      } else if (message.action === 'retry' || message.action === 'resume' && reconcileIds.has(job.id) && (recoverableResponseTimeout(job) || job.state === 'error' && job.errorCode === 'context_setup')) {
        if (['passed', 'accepted'].includes(job.state)) continue;
        if (!terminal(job)) throw new Error('This review is still running. Pause it or wait for its result.');
        // A parser fix can recover a received assessment entirely from storage.
        // Only reread the existing chat if the saved response still fails validation.
        if (job.sentAt && job.state === 'error' && job.raw) {
          try {
            const parsed = job.kind === 'context' ? parseContext(job.raw, job) : parseReport(job.raw, job);
            await publish({ ...job, ...parsed, error: null, errorCode: null, responseStatus: null, responseSnapshot: null, phase: null, paused: false, reconciling: false, updatedAt: Date.now() });
            continue;
          } catch { /* Reconcile the existing chat below; never resubmit. */ }
        }
        job.state = job.sentAt ? 'reviewing' : job.attachments ? 'ready' : 'queued';
        job.reconciling = !!job.sentAt; job.error = null; job.errorCode = null; job.phase = null; job.paused = false;
        job.responseStatus = null; job.responseSnapshot = null;
        job.reconcileStartedAt = job.sentAt ? Date.now() : null;
        if (!job.sentAt) {
          job.tabId = null; job.chatUrl = null;
          // A retry before Send should use the current structured-output contract,
          // rather than keeping a prepared prompt from an older adapter version.
          if (job.attachments && job.kind !== 'context') job.promptText = prompt(job);
        }
      // A completed failed review may still have a pending correction. Retain
      // pause/resume for it too, including across a closed/reopened panel.
      } else job.paused = message.action === 'pause';
      // Keep historical reports visible without logging their old errors as
      // fresh failures at the time of every resume.
      await publish(job, { log: !['pause', 'resume', 'start'].includes(message.action) || !terminal(job) });
    }
    void pump(); return { success: true };
  });
  if (message.type === 'AIR_OPEN') {
    const job = await get('jobs', message.id);
    if (!job) throw new Error('Review not found.');
    const tab = await ensureTab(job); await chrome.tabs.update(tab.id, { active: true }); return { success: true };
  }
  throw new Error('Unsupported reviewer operation.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message.type?.startsWith('AIR_') || ['AIR_RUN', 'AIR_JOB_UPDATED'].includes(message.type)) return;
  dispatch(message, sender).then(value => respond(value), error => respond({ success: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(value => { if (value.name === alarm) void pump(); });
chrome.runtime.onStartup.addListener(() => void pump());
chrome.tabs.onUpdated.addListener((id, changes) => { if (changes.status === 'complete') void all('jobs').then(jobs => { if (jobs.some(job => job.tabId === id && !terminal(job))) void pump(); }); });
void pump();
