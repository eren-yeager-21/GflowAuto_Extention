import '../ui/side-panel/pipeline-concurrency.js';

const TILE_SELECTOR = 'flow-grid-tile-container';
const MARKER_ATTRIBUTE = 'data-veo-submission';
const assignments = new Map();
const activeSubmissions = new Map();
const observedReadyIds = new Set();
let activeSubmitContext;

export function getSpecLogContext() {
  return activeSubmitContext ? {
    groupId: activeSubmitContext.groupId, promptIndex: activeSubmitContext.promptIndex,
    frameName: activeSubmitContext.targetFilename, phase: activeSubmitContext.specLogPhase || 'Preparation'
  } : {};
}

const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();
const modelName = value => normalizeText(value).replace(/^🍌\s*/, '');
const aspectIcon = value => ({ '16:9': 'crop_16_9', '9:16': 'crop_9_16', '4:3': 'crop_landscape', '3:4': 'crop_portrait', '1:1': 'crop_square' }[value] || value);

function diagnosticLog(config, level, message, details) {
  try {
    chrome.runtime.sendMessage({ type: 'ACTION_LOG', data: {
      source: 'spec-pipeline', level, message, timestamp: Date.now(),
      groupId: config.groupId, promptIndex: config.promptIndex,
      frameName: config.targetFilename,
      phase: config.specLogPhase || 'Preparation', details
    } }).catch(() => {});
  } catch { /* Logging must never interrupt the submitter. */ }
}

function describeTile(tile) {
  const prompt = pendingPrompt(tile);
  return {
    tileId: tileIdentity(tile), marker: tile.getAttribute(MARKER_ATTRIBUTE),
    hasPendingElement: !!tile.querySelector('flow-pending-tile'),
    detectedAsPending: isPending(tile), progress: pendingPercentage(tile), title: tileTitle(tile),
    pendingPrompt: prompt.slice(0, 180), pendingPromptEnd: prompt.length > 180 ? prompt.slice(-180) : undefined,
    pendingPromptLength: prompt.length, hasImage: !!tile.querySelector('img')
  };
}

// The current Flow UI exposes named controls. Do not silently keep its previous
// output count: two outputs for one prompt cannot be mapped to a single frame.
export function verifySpecImageSettings(config) {
  const button = document.querySelector('button[aria-label="Settings trigger"]');
  if (!button) return false;
  const text = normalizeText(button.textContent);
  const aspect = button.querySelector('mat-icon')?.textContent?.trim();
  return new RegExp(`\\bx${config.outputCount || 1}\\b`).test(text) &&
    aspect === aspectIcon(config.aspectRatio) &&
    modelName(text.replace(/crop_\w+|\bx\d+\b/g, '')) === modelName(config.model);
}

export async function configureSpecImage(config, cancelled) {
  if (Number(config.outputCount || 1) !== 1) throw new Error('Spec Pipeline requires one image per prompt');
  if (verifySpecImageSettings(config)) {
    diagnosticLog(config, 'info', 'Flow settings verified: one image per prompt.', { model: config.model, aspectRatio: config.aspectRatio });
    if (document.querySelector('flow-prompt-box-settings')) document.querySelector('button[aria-label="Settings trigger"]').click();
    return;
  }
  diagnosticLog(config, 'info', 'Correcting Flow generation settings.', { model: config.model, aspectRatio: config.aspectRatio, outputCount: 1 });
  const trigger = await waitForCondition(() => document.querySelector('button[aria-label="Settings trigger"]'), cancelled, 4000, 'Flow settings button');
  if (!document.querySelector('flow-prompt-box-settings')) trigger.click();
  const selectToggle = async (label, matches) => {
    const button = await waitForCondition(() => Array.from(document.querySelectorAll(`flow-prompt-box-settings flow-toggles[aria-label="${label}"] button[role="radio"]`)).find(matches), cancelled, 4000, `${label} setting`);
    if (button.getAttribute('aria-checked') !== 'true') button.click();
    await waitForCondition(() => button.getAttribute('aria-checked') === 'true', cancelled, 4000, `${label} selection`);
  };
  try {
    await selectToggle('Mode', button => normalizeText(button.querySelector('.toggle-text')?.textContent) === 'Image');
    await selectToggle('Aspect ratio', button => button.querySelector('mat-icon')?.textContent?.trim() === aspectIcon(config.aspectRatio));
    await selectToggle('Output count', button => normalizeText(button.textContent) === 'x1');
    const model = document.querySelector('flow-prompt-box-settings button[aria-label="Select model family"]');
    if (!model) throw new Error('Could not verify the Flow image model');
    if (modelName(model.querySelector('.model-select-trigger-content')?.textContent?.replace('arrow_drop_down', '')) !== modelName(config.model)) {
      model.click();
      const option = await waitForCondition(() => Array.from(document.querySelectorAll('button[role="menuitem"]')).find(button => modelName(button.textContent) === modelName(config.model)), cancelled, 4000, 'image model option');
      option.click();
    }
    await waitForCondition(() => verifySpecImageSettings(config), cancelled, 4000, 'verified single-image settings');
  } finally {
    if (document.querySelector('flow-prompt-box-settings')) trigger.click();
  }
}

function pendingPercentage(tile) {
  // Percentages in captions or prompt text are not generation progress. Flow
  // exposes its progress separately, including when text has no surrounding spaces.
  const text = normalizeText(tile.querySelector('.loading-percentage')?.textContent);
  const match = text.match(/^(\d{1,3})\s*%$/);
  return match ? Math.min(100, Number(match[1])) : null;
}

function isPending(tile) {
  return !!tile.querySelector('flow-pending-tile') || pendingPercentage(tile) !== null;
}

function pendingPrompt(tile) {
  return normalizeText(tile.querySelector('flow-pending-tile .subtitle, flow-pending-tile .text-content')?.textContent);
}

export function tileIdentity(tile) {
  return tile.getAttribute('data-tile-id') || (!isPending(tile) && tile.querySelector('[data-media-id]')?.getAttribute('data-media-id')) || null;
}

function tileTitle(tile) {
  const title = tile.querySelector('.footer-title, span[class*="title"]')?.textContent;
  return title?.trim() || (tile.getAttribute('aria-label') || '').replace(/^image\s*/i, '').trim();
}

function tiles() {
  return Array.from(document.querySelectorAll(TILE_SELECTOR));
}

export function snapshotSubmission(config) {
  const existing = tiles();
  existing.filter(tile => !isPending(tile)).map(tileIdentity).filter(Boolean).forEach(id => observedReadyIds.add(id));
  const pendingPromptCounts = new Map();
  existing.filter(isPending).forEach(tile => {
    const prompt = pendingPrompt(tile);
    if (prompt) pendingPromptCounts.set(prompt, (pendingPromptCounts.get(prompt) || 0) + 1);
  });
  config.specSnapshot = {
    nodes: new Set(existing),
    ids: new Set(existing.map(tileIdentity).filter(Boolean)),
    pendingElements: new Set(existing.map(tile => tile.querySelector('flow-pending-tile')).filter(Boolean)),
    pendingByTile: new Map(existing.map(tile => [tile, tile.querySelector('flow-pending-tile')])),
    pendingPromptCounts,
    urls: new Set(existing.flatMap(tile => Array.from(tile.querySelectorAll('img')).map(img => img.src)))
  };
  diagnosticLog(config, 'info', 'Captured the pre-submit tile snapshot.', {
    visibleTiles: existing.length, pendingTiles: existing.filter(isPending).length,
    existingPendingTiles: existing.filter(isPending).slice(0, 12).map(describeTile)
  });
}

function submissionInfo(config) {
  return {
    state: config.specSubmissionState,
    marker: config.specSubmissionId,
    tileId: config.specTileId || null,
    pendingPrompt: config.specPendingPrompt || null,
    excludedMediaUrls: Array.from(config.specSnapshot?.urls || []),
    mediaUrl: config.specImage?.mediaUrl || null,
    tileTitle: config.specImage?.tileTitle || null,
    flowUrl: location.href
  };
}

export function markSubmissionDispatched(config) {
  // From this point a missing tile is a tracking problem, not proof that Flow
  // rejected the prompt. Never automatically click Generate again.
  config.specSubmissionState = 'unknown';
  config.specLogPhase = 'Submission';
  diagnosticLog(config, 'info', 'Generate dispatched; waiting for a new pending tile.', {
    marker: config.specSubmissionId, submittedTextLength: normalizeText(config.specSubmittedPrompt).length,
    settings: normalizeText(document.querySelector('button[aria-label="Settings trigger"]')?.textContent)
  });
  config.onSubmissionState?.(submissionInfo(config));
}

// Observe readiness immediately; the interval is only a fallback for property
// changes (such as img.complete) which do not cause a DOM mutation.
export function waitForCondition(check, isCancelled, timeoutMs, label, signal) {
  return new Promise((resolve, reject) => {
    let observer, interval, timeout;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new Error('Cancelled'));
    const inspect = records => {
      try {
        if (isCancelled()) throw new Error('Cancelled');
        const value = check(Array.isArray(records) ? records : []);
        if (value) finish(null, value);
      } catch (error) {
        finish(error);
      }
    };
    observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    interval = setInterval(inspect, 250);
    timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    inspect();
  });
}

// Arm before the browser click acknowledgement returns. The pending tile can
// appear (and even finish) while the click helper is still awaiting its reply.
export function startSubmissionObservation(config, isCancelled) {
  config.specAcceptanceController = new AbortController();
  config.specAcceptancePromise = acceptSubmission(config, isCancelled, config.specAcceptanceController.signal);
  // The submitter awaits this after the click; attach a handler immediately so
  // a rejection during that click cannot become an unhandled rejection.
  config.specAcceptancePromise.catch(() => {});
}

export function stopSubmissionObservation(config) {
  config.specAcceptanceController?.abort();
}

export async function acceptSubmission(config, isCancelled, signal) {
  if (!config.specSnapshot) throw new Error('Missing pre-submit tile snapshot');
  const marker = config.specSubmissionId;
  const expectedTitle = String(config.basePrompt || config.prompt || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let tile;
  let lastDiagnostics;
  try {
    tile = await waitForCondition(() => {
      const visible = tiles();
      const pendingPromptCounts = new Map();
      visible.filter(isPending).forEach(tile => {
        const prompt = pendingPrompt(tile);
        if (prompt) pendingPromptCounts.set(prompt, (pendingPromptCounts.get(prompt) || 0) + 1);
      });
      const candidates = visible.filter(tile => {
        const id = tileIdentity(tile);
        const pendingElement = tile.querySelector('flow-pending-tile');
        // Angular can recycle a marked container or replace an existing job's
        // pending child. A changed node is only a candidate; prompt evidence
        // below distinguishes a new submission from an existing job's redraw.
        const recycled = pendingElement && config.specSnapshot.nodes.has(tile) &&
          pendingElement !== config.specSnapshot.pendingByTile?.get(tile);
        if (tile.hasAttribute(MARKER_ATTRIBUTE) && !recycled) return false;
        if (id && config.specSnapshot.ids.has(id)) return false;
        if (pendingElement && config.specSnapshot.pendingElements?.has(pendingElement)) return false;
        // Replacing a DOM node does not create a new generation. Compare the
        // queued prompt counts as well, so an existing job survives a grid redraw.
        const prompt = pendingPrompt(tile);
        const previousCount = config.specSnapshot.pendingPromptCounts?.get(prompt) || 0;
        if (previousCount && pendingPromptCounts.get(prompt) <= previousCount) return false;
        if (!id && config.specSnapshot.nodes.has(tile) && !isPending(tile)) return false;
        const media = tile.querySelector('img');
        const pending = isPending(tile);
        if (!pending && media?.src && config.specSnapshot.urls.has(media.src)) return false;
        return true;
      });
      // Pending tiles carry the actual submitted text, whereas ready images have
      // semantic captions. Prefer this evidence over unrelated images revealed
      // by virtual scrolling while the new tile is being inserted.
      const expectedPrompt = normalizeText(config.specSubmittedPrompt || config.prompt || config.basePrompt);
      const newPending = candidates.filter(isPending);
      const pendingMatches = newPending.filter(tile => {
        const prompt = pendingPrompt(tile);
        const basePrompt = normalizeText(config.basePrompt);
        return prompt && (prompt === expectedPrompt || (basePrompt && prompt.includes(basePrompt)));
      });
      const placeholders = newPending.filter(tile => !pendingPrompt(tile) && pendingPercentage(tile) === null);
      const activePending = newPending.filter(tile => pendingPrompt(tile) || pendingPercentage(tile) !== null);
      const diagnostics = {
        visibleTiles: visible.length, pendingTiles: visible.filter(isPending).length,
        candidateCount: candidates.length, newPendingCount: newPending.length, promptMatches: pendingMatches.length,
        pendingPlaceholders: placeholders.length, activePendingCount: activePending.length,
        candidatesWithProgress: newPending.filter(tile => pendingPercentage(tile) !== null).length,
        submittedTextLength: expectedPrompt.length,
        submittedTextStart: expectedPrompt.slice(0, 180), submittedTextEnd: expectedPrompt.length > 180 ? expectedPrompt.slice(-180) : undefined,
        candidates: candidates.slice(0, 12).map(candidate => ({ ...describeTile(candidate),
          existedInSnapshot: config.specSnapshot.nodes.has(candidate),
          hadPendingChildBefore: !!config.specSnapshot.pendingByTile?.get(candidate),
          samePendingChild: config.specSnapshot.pendingElements?.has(candidate.querySelector('flow-pending-tile')) || false
        }))
      };
      lastDiagnostics = diagnostics;
      const signature = JSON.stringify(diagnostics);
      if (signature !== config.specAcceptanceLogSignature) {
        config.specAcceptanceLogSignature = signature;
        diagnosticLog(config, activePending.length > 1 ? 'warn' : 'info', `Acceptance scan: ${visible.length} visible tiles, ${activePending.length} active pending candidates, ${pendingMatches.length} prompt matches, ${placeholders.length} grid placeholders.`, diagnostics);
      }
      if (pendingMatches.length === 1) {
        config.specAcceptanceEvidence = 'matching-pending-prompt';
        return pendingMatches[0];
      }
      // Flow can temporarily replace the whole grid with pending placeholders.
      // They are not jobs and must not compete with the actual pending tile.
      // Existing jobs were excluded above. With one serialized submitter and
      // verified x1, a unique new active pending tile identifies the submission.
      // Its displayed text may differ from the editor's serialized prompt.
      if (activePending.length === 1) {
        config.specAcceptanceEvidence = 'unique-active-pending-tile';
        return activePending[0];
      }
      if (newPending.length) return null;
      // Without a witnessed pending tile, newly mounted ready images alone can
      // be old images revealed by virtualization. Keep waiting for evidence.
      if (config.specSubmittedPrompt) return null;
      // Flow creates semantic titles, not prompt excerpts. A single new identity
      // under the serialized submitter is sufficient, regardless of its title.
      if (candidates.length <= 1) return candidates[0];
      const matching = candidates.filter(tile => {
        const title = tileTitle(tile).toLowerCase().replace(/\s+/g, ' ').replace(/(?:…|\.{2,})$/, '').trim();
        return title.length >= 6 && (expectedTitle.includes(title) || title.includes(expectedTitle.slice(0, 60)));
      });
      if (matching.length === 1) return matching[0];
      return null;
    }, isCancelled, 30000, 'Flow to accept the image prompt', signal);
  } catch (error) {
    if (error.message === 'Timed out waiting for Flow to accept the image prompt') {
      error.message = 'Flow submission could not be uniquely tracked before the timeout. The prompt may already be generating; it will not be submitted again automatically.';
    }
    diagnosticLog(config, error.message === 'Cancelled' ? 'warn' : 'error', error.message, {
      submissionState: config.specSubmissionState,
      marker: config.specSubmissionId, automaticResubmission: false, lastScan: lastDiagnostics
    });
    throw error;
  }
  tile.setAttribute(MARKER_ATTRIBUTE, marker);
  config.specBoundNode = tile;
  config.specBoundPendingElement = tile.querySelector('flow-pending-tile');
  config.specTileId = tileIdentity(tile);
  config.specPendingPrompt = pendingPrompt(tile) || null;
  config.specTileIds = [`veo-spec:${marker}`];
  config.specSubmissionState = 'accepted';
  diagnosticLog(config, 'info', `Submission accepted (${config.specAcceptanceEvidence || 'unique-image-identity'}); the next independent prompt can start.`, describeTile(tile));
  config.onSubmissionState?.(submissionInfo(config));
  return tile;
}

function boundTile(config) {
  const visible = tiles();
  if (config.specTileId) return visible.find(tile => tileIdentity(tile) === config.specTileId ||
    tile.querySelector('img[data-media-id]')?.getAttribute('data-media-id') === config.specTileId);
  let tile = visible.find(tile => tile.getAttribute(MARKER_ATTRIBUTE) === config.specSubmissionId &&
    (!isPending(tile) || !config.specPendingPrompt || pendingPrompt(tile) === config.specPendingPrompt ||
      (tile === config.specBoundNode && tile.querySelector('flow-pending-tile') === config.specBoundPendingElement)));
  if (!tile && config.specPendingPrompt) {
    const matches = visible.filter(tile => !tile.hasAttribute(MARKER_ATTRIBUTE) && isPending(tile) && pendingPrompt(tile) === config.specPendingPrompt);
    if (matches.length === 1) {
      tile = matches[0];
      tile.setAttribute(MARKER_ATTRIBUTE, config.specSubmissionId);
    }
  }
  if (tile) {
    config.specBoundNode = tile;
    config.specBoundPendingElement = tile.querySelector('flow-pending-tile');
    // Persist the generated media identity as soon as its image appears, even
    // if Flow has not removed the pending overlay yet. It survives DOM redraws.
    // An old reference-preview image must never become this job's identity.
    const img = tile.querySelector('img[data-media-id]');
    const id = tileIdentity(tile) || (img?.src && !config.specSnapshot.urls.has(img.src) && img.getAttribute('data-media-id'));
    if (id && id !== config.specTileId) {
      config.specTileId = id;
      config.onSubmissionState?.(submissionInfo(config));
    }
  }
  return tile;
}

// Some Flow updates replace the pending container with a new ready container,
// discarding the custom marker. Recover only a uniquely witnessed transition:
// one owned pending tile removed and one previously unseen, unclaimed image.
// Grid order and semantic captions are never used to assign an image here.
function recoverCompletedBindings(records) {
  const visible = tiles();
  const bound = new Map(Array.from(activeSubmissions.values()).map(config => [config, boundTile(config)]));
  const removed = records.flatMap(record => Array.from(record.removedNodes || []));
  const lost = Array.from(bound).filter(([config, tile]) => !tile && !config.specTileId && config.specBoundPendingElement &&
    removed.some(node => node === config.specBoundPendingElement || node.contains?.(config.specBoundPendingElement))).map(([config]) => config);
  const claimed = new Set(Array.from(activeSubmissions.values()).map(config => config.specTileId).filter(Boolean));
  const fresh = visible.filter(tile => {
    if (isPending(tile)) return false;
    const id = tileIdentity(tile);
    const img = tile.querySelector('img');
    return id && img?.src && !observedReadyIds.has(id) && !claimed.has(id) && !assignments.has(img.src) &&
      !Array.from(activeSubmissions.values()).some(config => (config.assignedMediaUrls || []).some(entry => entry.url === img.src));
  });
  if (lost.length === 1 && fresh.length === 1 && !lost[0].specSnapshot.urls.has(fresh[0].querySelector('img').src)) {
    const config = lost[0], tile = fresh[0];
    tile.setAttribute(MARKER_ATTRIBUTE, config.specSubmissionId);
    config.specTileId = tileIdentity(tile);
    config.specBoundNode = tile;
    config.specBoundPendingElement = null;
    config.onSubmissionState?.(submissionInfo(config));
    diagnosticLog(config, 'info', 'Recovered the completed image after Flow replaced its pending tile.', describeTile(tile));
  }
  visible.filter(tile => !isPending(tile) && tile.querySelector('img')?.src).map(tileIdentity).filter(Boolean).forEach(id => observedReadyIds.add(id));
}

function sendRequest(message, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No acknowledgement for ${message.type}`)), timeoutMs);
    chrome.runtime.sendMessage(message).then(
      response => { clearTimeout(timeout); resolve(response); },
      error => { clearTimeout(timeout); reject(error); }
    );
  });
}

async function completeImage(config, cancelled, progress) {
  config.specLogPhase = 'Generation';
  diagnosticLog(config, 'info', config.specImage ? 'Resuming delivery of the generated image.' : 'Watching the accepted image until it finishes.', { tileId: config.specTileId, marker: config.specSubmissionId });
  let lastObservation, lastDetails, lastPercentage;
  const observe = (reason, tile) => {
    const signature = `${reason}:${config.specTileId || ''}`;
    lastDetails = { reason, tileId: config.specTileId, marker: config.specSubmissionId,
      lastPercentage, visibleTiles: tiles().length, tile: tile ? describeTile(tile) : null };
    if (signature !== lastObservation) {
      lastObservation = signature;
      diagnosticLog(config, reason === 'tile-missing' ? 'warn' : 'info', {
        'tile-missing': 'Accepted image tile is missing from the current grid; waiting to rebind it.',
        'generating': 'Accepted image is still generating.',
        'image-loading': 'Generated tile is visible; waiting for its image to load.',
        'old-image': 'The tracked container still shows an older image; waiting for the generated media.'
      }[reason], lastDetails);
    }
  };
  let image;
  try {
    image = config.specImage || await waitForCondition(records => {
      recoverCompletedBindings(records);
      const tile = boundTile(config);
      if (!tile) { observe('tile-missing'); return null; }
      const text = tile.textContent || '';
      if (tile.querySelector('flow-error-tile, flow-failed-tile, [data-status="error"]') ||
        /generation failed|couldn['’]t generate|something went wrong|violates.*policy|failed to generate/i.test(text)) {
        const error = new Error('Flow image generation failed');
        error.retryable = true; // Only a confirmed generation failure is safe to regenerate.
        throw error;
      }
      const percentage = pendingPercentage(tile);
      if (percentage !== null && percentage !== lastPercentage) {
        lastPercentage = percentage;
        progress(Math.min(99, percentage));
      }
      if (isPending(tile)) { observe('generating', tile); return null; }
      const img = tile.querySelector('img');
      if (!img?.src || !img.complete || !img.naturalWidth) { observe('image-loading', tile); return null; }
      if (config.specSnapshot.urls.has(img.src)) {
        const owner = `${location.pathname}:${config.targetFilename}:${config.promptIndex}`;
        if ((assignments.has(img.src) && assignments.get(img.src) !== owner) ||
          (config.assignedMediaUrls || []).some(entry => entry.url === img.src && entry.promptIndex !== config.promptIndex)) {
          throw new Error('Flow returned an image already assigned to a different frame');
        }
        observe('old-image', tile);
        return null;
      }
      return { mediaUrl: img.src, tileTitle: tileTitle(tile) || config.basePrompt };
    }, cancelled, 300000, 'the submitted image');
  } catch (error) {
    if (error.message === 'Timed out waiting for the submitted image') {
      error.message = lastDetails?.reason === 'tile-missing'
        ? 'Lost track of the accepted Flow image after a grid update. Sync the existing image or resume tracking; it will not be regenerated automatically.'
        : `Flow image completion timed out (${lastDetails?.reason || 'no completion observed'}${lastPercentage !== undefined ? `, last progress ${lastPercentage}%` : ''}). The accepted prompt will not be regenerated automatically.`;
    }
    diagnosticLog(config, error.message === 'Cancelled' ? 'warn' : 'error', error.message, { lastObservation: lastDetails, automaticResubmission: false });
    throw error;
  }
  config.specImage = image;
  diagnosticLog(config, 'info', 'Generated image is ready.', { tileId: config.specTileId, title: image.tileTitle, filename: config.targetFilename });
  config.onSubmissionState?.(submissionInfo(config));
  config.specLogPhase = 'Delivery';
  if (cancelled()) throw new Error('Cancelled');
  const owner = `${location.pathname}:${config.targetFilename}:${config.promptIndex}`;
  const assigned = assignments.get(image.mediaUrl);
  if (assigned && assigned !== owner) throw new Error('Flow returned an image already assigned to a different frame');
  if ((config.assignedMediaUrls || []).some(entry => entry.url === image.mediaUrl && entry.promptIndex !== config.promptIndex)) {
    throw new Error('Flow returned an image already assigned to a different frame');
  }
  assignments.set(image.mediaUrl, owner);
  // Await delivery so the side panel has the reference title before the next
  // dependent batch starts. No hover, rename menu, or prompt-editor interaction.
  const captured = await sendRequest({
    type: 'SPEC_FRAME_IMAGE_CAPTURED', groupId: config.groupId,
    promptIndex: config.promptIndex, mediaUrl: image.mediaUrl,
    filename: config.targetFilename, tileTitle: image.tileTitle
  });
  if (!captured?.success) throw new Error(captured?.error || 'The side panel did not accept the generated image');
  if (cancelled()) throw new Error('Cancelled');
  const download = await sendRequest({
    type: 'DOWNLOAD_RESOURCE', url: image.mediaUrl, filename: config.targetFilename,
    folder: config.folderName, autoChangeFileName: true
  }, 30000);
  if (!download?.success) throw new Error(download?.error || 'Could not download the generated image');
  diagnosticLog(config, 'info', 'Image delivered and download started.', { filename: config.targetFilename });
  return image;
}

export async function runSpecGroup(group, remoteConfig, submit, notify) {
  const configs = new Map();
  const cancelled = () => !!group.isCancelling;
  const updateResult = (payload, changes) => {
    const index = group.payloads.indexOf(payload);
    let result = group.results.find(result => result.index === index);
    if (!result) {
      result = { index, promptIndex: payload.promptIndex, success: false, downloadComplete: false };
      group.results.push(result);
    }
    Object.assign(result, changes);
    notify(group);
  };
  const results = await globalThis.PipelineConcurrency.runIndependentBatch(group.payloads, {
    maxParallel: group.concurrentPrompts,
    isCancelled: cancelled,
    submit: async payload => {
      group.currentPromptIndex = group.payloads.indexOf(payload);
      notify(group);
      const saved = payload.resumeSubmission;
      const config = { ...payload, specSubmissionId: saved?.marker || crypto.randomUUID(), specSubmissionState: 'preparing' };
      configs.set(payload, config);
      config.onSubmissionState = submission => updateResult(payload, { submission });
      try {
        if (saved) {
          if (saved.state !== 'accepted' || (!saved.tileId && !saved.marker) || (saved.flowUrl && saved.flowUrl !== location.href)) {
            config.specSubmissionState = 'unknown';
            throw new Error('The previous submission needs manual reconciliation before generating another image.');
          }
          config.specTileId = saved.tileId;
          config.specPendingPrompt = saved.pendingPrompt;
          config.specSnapshot = { urls: new Set(saved.excludedMediaUrls || []) };
          if (saved.mediaUrl) config.specImage = { mediaUrl: saved.mediaUrl, tileTitle: saved.tileTitle || config.basePrompt };
          config.specSubmissionState = 'accepted';
          config.onSubmissionState(submissionInfo(config));
        } else {
          activeSubmitContext = config;
          const accepted = await submit(config, cancelled, remoteConfig);
          if (!accepted.success) throw new Error(accepted.error || 'Flow did not accept the image prompt');
          config.specSubmissionState = 'accepted';
          config.onSubmissionState(submissionInfo(config));
        }
        if (cancelled()) throw new Error('Cancelled');
        return config;
      } finally {
        if (activeSubmitContext === config) activeSubmitContext = null;
        group.currentPromptIndex = undefined;
      }
    },
    complete: async (payload, config) => {
      activeSubmissions.set(config.specSubmissionId, config);
      try {
        return await completeImage(config, cancelled, percentage => {
          chrome.runtime.sendMessage({ type: 'VIDEO_GENERATION_PROGRESS', data: {
            groupId: group.id, promptIndex: payload.promptIndex, percentage,
            status: 'generating', prompt: payload.prompt
          } }).catch(() => {});
        });
      } finally {
        activeSubmissions.delete(config.specSubmissionId);
      }
    },
    onResult: result => {
      const config = configs.get(result.item);
      if (!result.success && config) diagnosticLog(config, result.error?.message === 'Cancelled' ? 'warn' : 'error', result.error?.message || 'Image generation did not complete.', {
        submissionState: config.specSubmissionState,
        retryable: result.error?.retryable ?? config.specSubmissionState === 'preparing',
        tileId: config.specTileId, marker: config.specSubmissionId
      });
      if (config && result.error?.retryable === true) config.specSubmissionState = 'failed';
      group.processedCount++;
      updateResult(result.item, {
        success: result.success, downloadComplete: true,
        error: result.error?.message,
        retryable: result.error?.retryable ?? config?.specSubmissionState === 'preparing',
        submission: config ? submissionInfo(config) : null,
        cancelled: group.isCancelling || result.error?.message === 'Cancelled'
      });
    }
  });
  group.pendingIndexes = [];
  group.status = group.isCancelling ? 'cancelled' : results.length === group.totalCount && results.every(result => result.success) ? 'completed' : 'error';
}
