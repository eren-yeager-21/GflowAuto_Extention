const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');

const root = path.join(__dirname, '..');
const concurrencySource = fs.readFileSync(path.join(root, 'src/ui/side-panel/pipeline-concurrency.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(root, 'src/content/pipeline-generation.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function scheduler() {
  const context = {};
  vm.runInNewContext(concurrencySource, context);
  return context.PipelineConcurrency;
}

test('independent generations overlap, submissions stay serialized, and any completed slot is reused', async () => {
  const completions = [deferred(), deferred(), deferred(), deferred()];
  const acceptance = deferred();
  const submitted = [];
  const done = scheduler().runIndependentBatch([0, 1, 2, 3], {
    maxParallel: 2,
    submit: async index => { submitted.push(index); if (index === 0) await acceptance.promise; return index; },
    complete: index => completions[index].promise
  });
  await tick();
  assert.deepEqual(submitted, [0], 'the next prompt must wait for acceptance, not just a click');
  acceptance.resolve();
  await tick();
  assert.deepEqual(submitted, [0, 1], 'two images start before either completes');
  completions[1].resolve('second');
  await tick();
  assert.deepEqual(submitted, [0, 1, 2], 'a later image completing frees a slot immediately');
  completions[2].resolve('third');
  await tick();
  assert.deepEqual(submitted, [0, 1, 2, 3]);
  completions[0].resolve('first');
  completions[3].resolve('fourth');
  const results = await done;
  assert.equal(results.length, 4);
  assert.ok(results.every(result => result.success));
});

test('failure and cancellation stop new submissions', async () => {
  for (const cancel of [false, true]) {
    const completions = [deferred(), deferred()];
    const submitted = [];
    let cancelled = false;
    const done = scheduler().runIndependentBatch([0, 1, 2], {
      maxParallel: 2, isCancelled: () => cancelled,
      submit: async index => { submitted.push(index); return index; },
      complete: index => completions[index].promise
    });
    await tick();
    if (cancel) cancelled = true;
    completions[0].reject(new Error(cancel ? 'Cancelled' : 'Generation failed'));
    completions[1].resolve();
    await done;
    assert.deepEqual(submitted, [0, 1]);
  }
});

function tile(id, title = '', url = null, pending = false, mediaId = null) {
  const attributes = new Map(id ? [['data-tile-id', id]] : []);
  const image = url ? { src: url, complete: true, naturalWidth: 1024, getAttribute: key => key === 'data-media-id' ? mediaId : null } : null;
  return {
    textContent: pending ? '25%' : '', pending, pendingNode: {}, image,
    getAttribute: key => attributes.get(key) || null,
    setAttribute: (key, value) => attributes.set(key, value),
    hasAttribute: key => attributes.has(key),
    querySelector(selector) {
      if (selector.startsWith('.footer-title')) return { textContent: title };
      if (selector === 'img') return this.image;
      if (selector === '[data-media-id]') return this.image;
      if (selector === 'flow-pending-tile') return this.pending ? this.pendingNode : null;
      if (selector.startsWith('flow-pending-tile .subtitle')) return this.pending ? { textContent: this.prompt ?? title } : null;
      return null;
    },
    querySelectorAll: selector => selector === 'img' && image ? [image] : []
  };
}

function contentHarness() {
  const visible = [];
  const observers = new Set();
  const messages = [];
  const context = {
    document: { documentElement: {}, querySelectorAll: () => visible, querySelector: () => null },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
    setInterval, clearInterval, setTimeout, clearTimeout, AbortController,
    location: { pathname: '/project/test' }, crypto: { randomUUID },
    chrome: { runtime: { async sendMessage(message) { messages.push(message); return { success: true }; } } }
  };
  vm.createContext(context);
  vm.runInContext(concurrencySource, context);
  vm.runInContext(contentSource.replace(/^import[^\n]+;\n/, '').replace(/export /g, '') +
    '\nglobalThis.api = { startSubmissionObservation, stopSubmissionObservation, configureSpecImage, verifySpecImageSettings, tileIdentity, snapshotSubmission, acceptSubmission, runSpecGroup, waitForCondition };', context);
  return { ...context.api, context, visible, messages, mutate() { for (const observer of [...observers]) observer.callback(); }, observers };
}

test('submission binds only a new tile, ignores existing media, and rejects ambiguous tiles', async () => {
  const harness = contentHarness();
  harness.visible.push(tile('old', 'same prompt', 'https://media/old'));
  const config = { basePrompt: 'same prompt', specSubmissionId: 'new-submission' };
  harness.snapshotSubmission(config);
  const accepted = harness.acceptSubmission(config, () => false);
  harness.visible.push(tile('new', 'same prompt'));
  harness.mutate();
  const acceptedTile = await accepted;
  assert.equal(acceptedTile.getAttribute('data-tile-id'), 'new');
  assert.equal(acceptedTile.getAttribute('data-veo-submission'), 'new-submission');
  assert.equal(harness.observers.size, 0);

  const next = { basePrompt: 'same prompt', specSubmissionId: 'ambiguous' };
  harness.snapshotSubmission(next);
  harness.visible.push(tile('unrelated', 'unrelated prompt'), tile('new-2', 'same prompt'), tile('new-3', 'same prompt'));
  await assert.rejects(harness.acceptSubmission(next, () => false), /Ambiguous/);
});

test('a pending tile with an old reference preview is accepted before it generates a new image', async () => {
  const h = contentHarness();
  h.visible.push(tile('old', 'old prompt', 'https://media/reference'));
  const config = { basePrompt: 'a new prompt', specSubmissionId: 'new-pending' };
  h.snapshotSubmission(config);
  h.visible.unshift(tile('pending', 'a new prompt', 'https://media/reference', true));
  const accepted = await h.acceptSubmission(config, () => false);
  assert.equal(accepted.getAttribute('data-tile-id'), 'pending');
});

test('Flow semantic captions do not have to repeat the submitted prompt', async () => {
  const h = contentHarness();
  const config = { basePrompt: '2D hand-drawn animated explainer style. Minimalist hand-drawn cartographic image', specSubmissionId: 'semantic-caption' };
  h.snapshotSubmission(config);
  h.visible.push(tile('middle-east-map', 'Map of Middle East displayed', 'https://media/map'));
  await h.acceptSubmission(config, () => false);
  assert.equal(config.specTileId, 'middle-east-map');
  assert.equal(config.specSubmissionState, 'accepted');
});

test('current Flow settings are corrected from x2 to x1 and then verified without reopening', async () => {
  const h = contentHarness();
  let opened = false, count = 2, mode = 'Video', aspect = 'crop_square', model = 'Nano Banana Pro', menu = false;
  const clicks = [];
  const trigger = {
    get textContent() { return ` 🍌 ${model} ${aspect} x${count} `; },
    querySelector: () => ({ get textContent() { return aspect; } }),
    click() { opened = !opened; clicks.push('settings'); }
  };
  const toggle = (label, value, getValue, setValue) => ({
    textContent: value,
    getAttribute: () => getValue() === value ? 'true' : 'false',
    querySelector: selector => ({ textContent: selector === 'mat-icon' ? value : value }),
    click() { clicks.push(label); setValue(value); }
  });
  const controls = {
    Mode: [toggle('mode', 'Image', () => mode, value => { mode = value; })],
    'Aspect ratio': [toggle('aspect', 'crop_16_9', () => aspect, value => { aspect = value; })],
    'Output count': [toggle('count', 'x1', () => `x${count}`, () => { count = 1; })]
  };
  const modelButton = {
    querySelector: () => ({ textContent: ` 🍌 ${model} arrow_drop_down ` }),
    click() { menu = true; }
  };
  h.context.document.querySelector = selector => {
    if (selector === 'button[aria-label="Settings trigger"]') return trigger;
    if (selector === 'flow-prompt-box-settings') return opened ? {} : null;
    if (selector.includes('Select model family')) return opened ? modelButton : null;
    return null;
  };
  h.context.document.querySelectorAll = selector => {
    if (selector === 'button[role="menuitem"]') return menu ? [{ textContent: '🍌 Nano Banana 2', click() { model = 'Nano Banana 2'; menu = false; clicks.push('model'); } }] : [];
    const label = selector.match(/flow-toggles\[aria-label="([^"]+)"\]/)?.[1];
    return opened ? controls[label] || [] : [];
  };
  const config = { outputCount: 1, aspectRatio: '16:9', model: 'Nano Banana 2' };
  assert.equal(h.verifySpecImageSettings(config), false);
  await h.configureSpecImage(config, () => false);
  assert.equal(h.verifySpecImageSettings(config), true);
  assert.equal(opened, false);
  assert.deepEqual(clicks, ['settings', 'mode', 'aspect', 'count', 'model', 'settings']);
  await h.configureSpecImage(config, () => false);
  assert.equal(clicks.length, 6, 'the next prompt needs no settings delay or menu interaction');
  await assert.rejects(h.configureSpecImage({ ...config, outputCount: 2 }, () => false), /one image per prompt/);
});

test('ID-less pending prompt wins over older images newly revealed by virtual scrolling', async () => {
  const h = contentHarness();
  h.visible.push(tile(null, 'Existing image', 'https://media/existing', false, 'existing-media'));
  const config = { prompt: 'A map of the Middle East', specSubmissionId: 'current-flow' };
  h.snapshotSubmission(config);
  h.visible.splice(0, 1, tile(null, 'Existing image', 'https://media/changed-size', false, 'existing-media'));
  h.visible.push(tile(null, 'Older offscreen image', 'https://media/offscreen', false, 'offscreen-media'));
  const pending = tile(null, config.prompt, null, true);
  h.visible.unshift(pending);
  assert.equal(await h.acceptSubmission(config, () => false), pending);
  assert.equal(config.specTileId, null);
  assert.equal(config.specPendingPrompt, config.prompt);
});

test('the modern submitter waits for its pending prompt rather than binding a newly mounted old image', async () => {
  const h = contentHarness();
  const config = { prompt: 'A map', specSubmittedPrompt: 'A map', specSubmissionId: 'wait-for-prompt' };
  h.snapshotSubmission(config);
  h.visible.push(tile(null, 'Old image appearing during reflow', 'https://media/old', false, 'old-media'));
  let accepted = false;
  const wait = h.acceptSubmission(config, () => false).then(result => { accepted = true; return result; });
  await tick();
  assert.equal(accepted, false);
  const pending = tile(null, config.prompt, null, true);
  h.visible.unshift(pending);
  h.mutate();
  assert.equal(await wait, pending);
});

test('a unique new pending tile is accepted when Flow abbreviates or omits the prompt', async () => {
  for (const display of ['2D hand-drawn…', '', 'Short generated description']) {
    const h = contentHarness();
    const prompt = '2D hand-drawn map with many detailed instructions and reference directives';
    const config = { prompt, basePrompt: prompt, specSubmittedPrompt: prompt, specSubmissionId: 'abbreviated' };
    h.visible.push(tile(null, 'Older offscreen image', 'https://media/old', false, 'old'));
    h.snapshotSubmission(config);
    const pending = tile(null, display, null, true);
    h.visible.push(pending);
    assert.equal(await h.acceptSubmission(config, () => false), pending);
  }
});

test('identical independent prompts bind distinct pending elements without a caption-based exclusion', async () => {
  const h = contentHarness();
  const prompt = 'An identical map prompt';
  const first = { prompt, specSubmittedPrompt: prompt, specSubmissionId: 'first-map' };
  h.snapshotSubmission(first);
  const firstTile = tile(null, prompt, null, true);
  h.visible.push(firstTile);
  await h.acceptSubmission(first, () => false);
  const second = { prompt, specSubmittedPrompt: prompt, specSubmissionId: 'second-map' };
  h.snapshotSubmission(second);
  const secondTile = tile(null, prompt, null, true);
  h.visible.unshift(secondTile);
  assert.equal(await h.acceptSubmission(second, () => false), secondTile);
  assert.equal(firstTile.getAttribute('data-veo-submission'), 'first-map');
});

test('an existing pending tile is excluded by its DOM identity even if its displayed text changes', async () => {
  const h = contentHarness();
  const old = tile(null, 'Existing prompt', null, true);
  h.visible.push(old);
  const config = { prompt: 'New prompt', specSubmittedPrompt: 'New prompt', specSubmissionId: 'changed-label' };
  h.snapshotSubmission(config);
  old.prompt = 'New prompt';
  const waiting = h.acceptSubmission(config, () => false);
  await tick();
  assert.equal(old.getAttribute('data-veo-submission'), null);
  const fresh = tile(null, 'New prompt', null, true);
  h.visible.push(fresh);
  h.mutate();
  assert.equal(await waiting, fresh);
});

test('observing before the click reply retains a pending tile that finishes during the reply', async () => {
  const h = contentHarness();
  const config = { prompt: 'A fast map', specSubmittedPrompt: 'A fast map', specSubmissionId: 'fast-image' };
  h.snapshotSubmission(config);
  h.startSubmissionObservation(config, () => false);
  const pending = tile(null, '', null, true);
  h.visible.push(pending);
  h.mutate();
  await tick();
  pending.pending = false;
  pending.textContent = '';
  pending.image = { src: 'https://media/fast', complete: true, naturalWidth: 1024, getAttribute: () => 'fast-media' };
  h.mutate();
  assert.equal(await config.specAcceptancePromise, pending);
  assert.equal(config.specSubmissionState, 'accepted');
  assert.equal(h.observers.size, 0);
});

test('a failed Generate click stops the pre-click observer without leaving a running timeout', async () => {
  const h = contentHarness();
  const config = { prompt: 'A map', specSubmissionId: 'abort-click' };
  h.snapshotSubmission(config);
  h.startSubmissionObservation(config, () => false);
  h.stopSubmissionObservation(config);
  await assert.rejects(config.specAcceptancePromise, /Cancelled/);
  assert.equal(h.observers.size, 0);
});

test('a ready DOM node recycled into the submitted pending image can be accepted', async () => {
  const h = contentHarness();
  const recycled = tile(null, 'Old caption', 'https://media/old', false, 'old-media');
  h.visible.push(recycled);
  const config = { prompt: 'A new map', specSubmissionId: 'recycled' };
  h.snapshotSubmission(config);
  recycled.pending = true;
  recycled.prompt = config.prompt;
  recycled.textContent = '0%';
  assert.equal(await h.acceptSubmission(config, () => false), recycled);
});

test('a recycled completed container does not retain ownership of its new pending image', async () => {
  const h = contentHarness();
  const recycled = tile(null, 'Old image', 'https://media/old', false, 'old-media');
  recycled.setAttribute('data-veo-submission', 'previous-frame');
  h.visible.push(recycled);
  const config = { prompt: 'Next frame', specSubmittedPrompt: 'Next frame', specSubmissionId: 'next-frame' };
  h.snapshotSubmission(config);
  recycled.pending = true;
  recycled.prompt = '';
  recycled.textContent = '0%';
  assert.equal(await h.acceptSubmission(config, () => false), recycled);
  assert.equal(recycled.getAttribute('data-veo-submission'), 'next-frame');
});

test('current ID-less pending tiles survive replacement and persist media identity when ready', async () => {
  const h = contentHarness();
  const payload = { groupId: 'real-dom', promptIndex: 0, prompt: 'A new map', targetFilename: 'frame_0.png' };
  const group = { id: 'real-dom', concurrentPrompts: 1, totalCount: 1, processedCount: 0, results: [], payloads: [payload] };
  const run = h.runSpecGroup(group, {}, async config => {
    h.snapshotSubmission(config);
    h.visible.push(tile(null, config.prompt, null, true));
    await h.acceptSubmission(config, () => false);
    return { success: true };
  }, () => {});
  await tick();
  h.visible[0] = tile(null, payload.prompt, null, true);
  h.mutate();
  assert.ok(h.visible[0].getAttribute('data-veo-submission'), 'a replacement pending tile is rebound by its exact prompt');
  h.visible[0].pending = false;
  h.visible[0].textContent = '';
  h.visible[0].image = { src: 'https://media/new', complete: true, naturalWidth: 1024, getAttribute: () => 'new-media-id' };
  h.mutate();
  await run;
  assert.equal(group.status, 'completed');
  assert.equal(group.results[0].submission.tileId, 'new-media-id');
  assert.equal(h.messages.filter(m => m.type === 'SPEC_FRAME_IMAGE_CAPTURED').length, 1);
});

test('content workers capture out-of-order results and follow native tile identity after DOM replacement', async () => {
  const harness = contentHarness();
  const group = { id: 'group', concurrentPrompts: 2, totalCount: 3, processedCount: 0, results: [],
    payloads: [0, 1, 2].map(promptIndex => ({ groupId: 'group', promptIndex, basePrompt: `prompt ${promptIndex}`, targetFilename: `frame_${promptIndex}.png`, folderName: 'frames' })) };
  const submitted = [];
  const submit = async config => {
    harness.snapshotSubmission(config);
    const newTile = tile(`tile-${config.promptIndex}`, config.basePrompt, null, true);
    harness.visible.unshift(newTile);
    await harness.acceptSubmission(config, () => group.isCancelling);
    submitted.push(config.promptIndex);
    return { success: true };
  };
  const run = harness.runSpecGroup(group, {}, submit, () => {});
  await tick();
  assert.deepEqual(submitted, [0, 1]);
  harness.visible[0] = tile('tile-1', 'prompt 1', 'https://media/one');
  harness.mutate();
  await tick();
  assert.deepEqual(submitted, [0, 1, 2]);
  harness.visible.splice(0, harness.visible.length,
    tile('tile-0', 'prompt 0', 'https://media/zero'), tile('tile-2', 'prompt 2', 'https://media/two'));
  harness.mutate();
  await run;
  assert.equal(group.status, 'completed');
  const captures = harness.messages.filter(message => message.type === 'SPEC_FRAME_IMAGE_CAPTURED');
  assert.deepEqual(captures.map(message => [message.promptIndex, message.mediaUrl]),
    [[1, 'https://media/one'], [0, 'https://media/zero'], [2, 'https://media/two']]);
  assert.equal(harness.observers.size, 0);
});

test('duplicate media stops the batch before a later prompt is submitted or the image is assigned twice', async () => {
  const harness = contentHarness();
  const group = { id: 'duplicate', concurrentPrompts: 1, totalCount: 3, processedCount: 0, results: [],
    payloads: [0, 1, 2].map(promptIndex => ({ groupId: 'duplicate', promptIndex, basePrompt: `prompt ${promptIndex}`, targetFilename: `frame_${promptIndex}.png`, folderName: 'frames' })) };
  const submitted = [];
  await harness.runSpecGroup(group, {}, async config => {
    // Test identity protection even if a tile later receives an incorrect URL.
    config.specSnapshot = { urls: new Set() };
    config.specTileId = `tile-${config.promptIndex}`;
    harness.visible.unshift(tile(config.specTileId, config.basePrompt, 'https://media/duplicate'));
    submitted.push(config.promptIndex);
    return { success: true };
  }, () => {});
  assert.equal(group.status, 'error');
  assert.deepEqual(submitted, [0, 1]);
  assert.equal(harness.messages.filter(message => message.type === 'SPEC_FRAME_IMAGE_CAPTURED').length, 1);
  assert.match(group.results[1].error, /already assigned/);
});

test('pausing content cancels accepted images and stops queued submissions', async () => {
  const harness = contentHarness();
  const group = { id: 'pause', concurrentPrompts: 2, totalCount: 4, processedCount: 0, results: [],
    payloads: [0, 1, 2, 3].map(promptIndex => ({ groupId: 'pause', promptIndex, basePrompt: `prompt ${promptIndex}` })) };
  const submitted = [];
  const run = harness.runSpecGroup(group, {}, async config => {
    config.specSnapshot = { urls: new Set() };
    config.specTileId = `tile-${config.promptIndex}`;
    harness.visible.push(tile(config.specTileId, config.basePrompt, null, true));
    submitted.push(config.promptIndex);
    return { success: true };
  }, () => {});
  await tick();
  group.isCancelling = true;
  harness.mutate();
  await run;
  assert.deepEqual(submitted, [0, 1]);
  assert.equal(group.status, 'cancelled');
  assert.equal(harness.messages.filter(message => message.type === 'SPEC_FRAME_IMAGE_CAPTURED').length, 0);
  assert.equal(harness.observers.size, 0);
});

test('a lost acceptance on one prompt does not cancel collection of other accepted images', async () => {
  const h = contentHarness();
  const group = { id: 'tracking-failure', concurrentPrompts: 2, totalCount: 3, processedCount: 0, results: [],
    payloads: [0, 1, 2].map(promptIndex => ({ groupId: 'tracking-failure', promptIndex, basePrompt: `prompt ${promptIndex}`, targetFilename: `frame_${promptIndex}.png`, folderName: 'frames' })) };
  const submitted = [];
  const run = h.runSpecGroup(group, {}, async config => {
    submitted.push(config.promptIndex);
    if (config.promptIndex === 1) {
      h.context.markSubmissionDispatched(config);
      throw new Error('Timed out waiting for Flow to accept the image prompt');
    }
    config.specSnapshot = { urls: new Set() };
    config.specTileId = 'accepted-first';
    h.visible.push(tile('accepted-first', 'Automatically generated title', null, true));
    return { success: true };
  }, () => {});
  await tick();
  h.visible[0] = tile('accepted-first', 'Automatically generated title', 'https://media/first');
  h.mutate();
  await run;
  assert.deepEqual(submitted, [0, 1]);
  assert.equal(group.results.find(result => result.promptIndex === 0).success, true);
  const failed = group.results.find(result => result.promptIndex === 1);
  assert.equal(failed.retryable, false);
  assert.equal(failed.submission.state, 'unknown');
  assert.match(failed.error, /Timed out waiting/);
  assert.equal(h.messages.filter(message => message.type === 'SPEC_FRAME_IMAGE_CAPTURED').length, 1);
});

test('a download failure resumes the already generated image without another submission or a visible tile', async () => {
  const h = contentHarness();
  let rejectDownload = true;
  h.context.chrome.runtime.sendMessage = async message => {
    h.messages.push(message);
    return message.type === 'DOWNLOAD_RESOURCE' && rejectDownload ? { success: false, error: 'Download failed' } : { success: true };
  };
  const payload = { promptIndex: 0, basePrompt: 'prompt 0', targetFilename: 'frame_0.png', folderName: 'frames' };
  const group = { id: 'download-failure', concurrentPrompts: 1, totalCount: 1, processedCount: 0, results: [], payloads: [{ ...payload, groupId: 'download-failure' }] };
  let submissions = 0;
  const submit = async config => {
    submissions++;
    config.specSnapshot = { urls: new Set() };
    config.specTileId = 'generated';
    h.visible.push(tile('generated', 'Generated image', 'https://media/ready'));
    return { success: true };
  };
  await h.runSpecGroup(group, {}, submit, () => {});
  assert.equal(group.status, 'error');
  assert.equal(group.results[0].retryable, false);
  assert.equal(group.results[0].submission.mediaUrl, 'https://media/ready');
  rejectDownload = false;
  h.visible.splice(0);
  const resume = { ...group, id: 'resume', processedCount: 0, results: [],
    payloads: [{ ...payload, groupId: 'resume', resumeSubmission: group.results[0].submission }] };
  await h.runSpecGroup(resume, {}, submit, () => {});
  assert.equal(submissions, 1);
  assert.equal(resume.status, 'completed');
  assert.equal(h.messages.filter(message => message.type === 'DOWNLOAD_RESOURCE').length, 2);
});

test('the installed Flow bridge releases the prompt editor after tile acceptance while the image is still pending', async () => {
  const h = contentHarness();
  const bundle = fs.readFileSync(path.join(root, 'assets/index.ts-DFAayvhs.js'), 'utf8');
  const start = bundle.indexOf('M=async(e,t,n)=>');
  const end = bundle.indexOf(',B=e=>', start);
  assert.ok(start >= 0 && end > start);
  const delays = [];
  let clicked = false;
  Object.assign(h.context, {
    configureSpecImage: async () => {}, verifySpecImageSettings: () => true,
    I() {}, C() {}, y() {}, ensureCaretAtEnd() {}, Event: class {},
    o: selector => ({ get: () => selector === 'submit' ? { disabled: false, getAttribute: () => null } : { dispatchEvent() {} } }),
    a: async () => ({ length: 1 }),
    i: async selector => {
      if (selector === 'submit') {
        clicked = true;
        h.visible.push(tile('new-tile', 'a new prompt', null, true));
        h.mutate();
      }
    },
    s: async ms => { delays.push(ms); }, p: async () => {}, u: async () => {},
    m: async () => { throw new Error('Spec submission must not wait for the global Stop button'); }
  });
  vm.runInContext('const ' + bundle.slice(start, end) + ';globalThis.fill = M;', h.context);
  const config = { specPipeline: true, specSubmissionId: 'installed-bridge', mode: 'textToImage', basePrompt: 'a new prompt', prompt: 'a new prompt' };
  const accepted = await h.context.fill(config, { selectors: { submitButton: 'submit', promptTextarea: 'editor' } }, () => false);
  assert.equal(accepted, true);
  assert.equal(clicked, true);
  assert.equal(h.visible[0].pending, true);
  assert.equal(config.specTileId, 'new-tile');
  assert.ok(!delays.includes(2000) && !delays.includes(1000), 'no fixed post-submit or button-readiness delay');
  assert.ok(bundle.includes('if(e.specPipeline)return{success:!!e.specTileIds?.length,tileIds:e.specTileIds||[]}'));
  assert.ok(bundle.includes('await runSpecGroup(e,t,x,J)'), 'installed group runner uses the new scheduler');
  const normalClick = h.context.i;
  let fastTile;
  h.context.i = async selector => {
    if (selector !== 'submit') return;
    assert.ok(h.observers.size > 0, 'the installed submitter must observe before the actual click');
    fastTile = tile(null, '', null, true);
    h.visible.unshift(fastTile);
    h.mutate();
    await tick();
    fastTile.pending = false;
    fastTile.textContent = '';
    fastTile.image = { src: 'https://media/fast-reply', complete: true, naturalWidth: 1024, getAttribute: () => 'fast-reply-media' };
    h.mutate();
  };
  const fast = { ...config, specSubmissionId: 'fast-click-reply' };
  assert.equal(await h.context.fill(fast, { selectors: { submitButton: 'submit', promptTextarea: 'editor' } }, () => false), true);
  assert.equal(fastTile.pending, false, 'the pending state ended before the click helper returned');
  assert.equal(fastTile.getAttribute('data-veo-submission'), 'fast-click-reply');
  assert.equal(h.observers.size, 0);
  h.context.i = normalClick;
  h.context.acceptSubmission = async () => { throw new Error('Timed out waiting for the newly submitted tile'); };
  const uncertain = { ...config, specSubmissionId: 'lost-tile' };
  await assert.rejects(h.context.fill(uncertain, { selectors: { submitButton: 'submit', promptTextarea: 'editor' } }, () => false), /newly submitted tile/);
  assert.equal(uncertain.specSubmissionState, 'unknown', 'a failed acceptance must not be reported as safe to regenerate');
  h.context.verifySpecImageSettings = () => false;
  clicked = false;
  const changedSettings = { ...config, specSubmissionState: 'preparing' };
  await assert.rejects(h.context.fill(changedSettings, { selectors: { submitButton: 'submit', promptTextarea: 'editor' } }, () => false), /settings changed before submission/);
  assert.equal(clicked, false, 'invalid settings must stop before Generate');
  assert.equal(changedSettings.specSubmissionState, 'preparing');
});

test('the installed status broadcaster preserves submission identity and retry safety', () => {
  const h = contentHarness();
  const bundle = fs.readFileSync(path.join(root, 'assets/index.ts-DFAayvhs.js'), 'utf8');
  const start = bundle.indexOf('J=e=>{try{chrome.runtime.sendMessage');
  const end = bundle.indexOf(';async function X', start);
  assert.ok(start >= 0 && end > start);
  h.context.H = 'broadcast';
  vm.runInContext('const ' + bundle.slice(start, end) + ';globalThis.broadcast = J;', h.context);
  h.context.broadcast({ id: 'broadcast', status: 'error', processedCount: 1, totalCount: 1, createdAt: 1,
    payloads: [{ prompt: 'Map prompt', promptIndex: 0 }], results: [{ index: 0, promptIndex: 0, success: false,
      downloadComplete: true, error: 'Tracking failed', retryable: false,
      submission: { state: 'accepted', tileId: 'native-tile', marker: 'submission-marker' } }] });
  const result = h.messages[0].data.results[0];
  assert.equal(result.submission.tileId, 'native-tile');
  assert.equal(result.submission.state, 'accepted');
  assert.equal(result.retryable, false);
  assert.equal(result.error, 'Tracking failed');
});
