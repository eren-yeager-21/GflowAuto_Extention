const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(raw, existingTiles = []) {
  const listeners = new Set();
  const messages = [];
  const alerts = [];
  const tab = { id: 7, url: 'https://flow.google.com/project/test', status: 'complete', active: true };
  const context = {
    console: { log() {}, warn() {} }, URL, crypto: { randomUUID },
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert: message => { alerts.push(message); },
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    chrome: {
      runtime: { onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } },
      storage: { local: { set: async () => {}, get: async () => ({}) } },
      tabs: {
        get: (id, callback) => callback(tab), query: (options, callback) => callback([tab]),
        sendMessage(id, message, callback) { messages.push(message); callback?.(message.type === 'SCAN_PROJECT_TILES' ? { tiles: existingTiles } : { success: true }); }
      }
    }
  };
  vm.createContext(context);
  for (const name of ['flow-destination.js', 'pipeline-concurrency.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src/ui/side-panel', name), 'utf8'), context);
  }
  const source = fs.readFileSync(path.join(root, 'src/ui/side-panel/spec-pipeline.js'), 'utf8');
  // Expose the actual closure for testing; production keeps these private.
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.api = { startPipeline, pausePipeline, regenerateSingleFrame, parseAndLoadSpec, syncFlowProjectTiles,
      generateMappingData, frameReferenceImages,
      state: () => ({ currentSpec, pipelineRunning, pipelinePaused, activeBatch }) };
  })();`), context);
  context.api.parseAndLoadSpec(raw);
  return {
    ...context.api, messages, alerts,
    groups: () => messages.filter(message => message.type === 'AUTO_FILL_FLOW'),
    emit(message, tabId = 7) {
      let acknowledgement;
      for (const listener of [...listeners]) listener(message, { tab: { id: tabId } }, response => { acknowledgement = response; });
      return acknowledgement;
    },
    capture(group, index, url = `https://media/${index}`, tabId = 7) {
      return this.emit({ type: 'SPEC_FRAME_IMAGE_CAPTURED', groupId: group.groupId, promptIndex: index, mediaUrl: url, tileTitle: `prompt ${index}` }, tabId);
    },
    status(group, status, results = []) { this.emit({ type: 'PROMPT_GROUP_STATUS', data: { id: group.groupId, status, results } }); }
  };
}

const frame = (index, extra = {}) => ({ id: `frame_${index}`, target_filename: `frame_${index}.png`, prompt: `prompt ${index}`, continuity: 'anchor', ...extra });
const result = (index, success = true) => ({ promptIndex: index, success, downloadComplete: true, error: success ? undefined : 'Generation failed' });

test('side panel batches independent frames, waits for barriers, and resolves the freshly captured reference', async () => {
  const h = harness({ parallel_gen_value: 2, max_retries: 1, visuals: [frame(0), frame(1), frame(2, { continuity: 'continue' }), frame(3)] });
  assert.equal(h.state().currentSpec.max_parallel_generations, 2);
  assert.equal(h.generateMappingData().max_parallel_generations, 2);
  const run = h.startPipeline();
  await tick();
  const first = h.groups()[0];
  assert.equal(first.concurrentPrompts, 2);
  assert.deepEqual(Array.from(first.payloads, payload => payload.promptIndex), [0, 1]);
  assert.equal(first.promptDelaySecondsMin, 0);
  assert.ok(first.payloads.every(payload => payload.model === 'Nano Banana 2' && payload.specPipeline));
  assert.equal(h.capture(first, 1).success, true, 'capture receipt must acknowledge delivery to the worker');
  h.status(first, 'running', [result(1)]);
  await tick();
  assert.equal(h.groups().length, 1, 'dependent work must wait for the whole preceding batch');
  h.capture(first, 0);
  h.status(first, 'completed', [result(1), result(0)]);
  await tick();
  const dependent = h.groups()[1];
  assert.equal(dependent.concurrentPrompts, 1);
  assert.deepEqual(Array.from(dependent.payloads, payload => payload.promptIndex), [2]);
  assert.equal(dependent.payloads[0].images[0].name, 'prompt 1');
  assert.equal(dependent.payloads[0].images[0].referenceExistingOnly, true);
  h.capture(dependent, 2);
  h.status(dependent, 'completed', [result(2)]);
  await tick();
  const last = h.groups()[2];
  h.capture(last, 3);
  h.status(last, 'completed', [result(3)]);
  await run;
  assert.ok(h.state().currentSpec.visuals.every(visual => visual.status === 'completed'));
  assert.equal(h.state().pipelineRunning, false);
});

test('failed prerequisite prevents dependent submissions; resume skips finished frames', async () => {
  const h = harness({ max_retries: 1, visuals: [frame(0), frame(1), frame(2, { frame_reference: 'frame_0.png' })] });
  const run = h.startPipeline();
  await tick();
  const first = h.groups()[0];
  h.capture(first, 1);
  h.status(first, 'error', [result(1), result(0, false)]);
  await run;
  assert.equal(h.groups().length, 1);
  assert.equal(h.state().currentSpec.visuals[0].status, 'error');
  const resume = h.startPipeline();
  await tick();
  const retry = h.groups()[1];
  assert.deepEqual(Array.from(retry.payloads, payload => payload.promptIndex), [0]);
  h.capture(retry, 0);
  h.status(retry, 'completed', [result(0)]);
  await tick();
  const dependent = h.groups()[2];
  assert.equal(dependent.payloads[0].images[0].name, 'prompt 0');
  h.capture(dependent, 2);
  h.status(dependent, 'completed', [result(2)]);
  await resume;
});

test('pause locks the submitter until cancellation completes and ignores stale or foreign captures', async () => {
  const h = harness({ max_retries: 1, visuals: [frame(0), frame(1)] });
  const run = h.startPipeline();
  await tick();
  const first = h.groups()[0];
  assert.equal(h.capture(first, 0, 'https://foreign/image', 99).success, false);
  assert.equal(h.state().currentSpec.visuals[0].result_url, null);
  h.pausePipeline();
  assert.equal(h.messages.at(-1).type, 'CANCEL_PROMPT_GROUP');
  assert.equal(h.state().pipelineRunning, true);
  await h.startPipeline();
  assert.equal(h.groups().length, 1);
  h.status(first, 'cancelled');
  await run;
  h.capture(first, 0, 'https://stale/image');
  assert.equal(h.state().currentSpec.visuals[0].result_url, null);
  assert.equal(h.state().currentSpec.visuals[0].status, 'pending');
  const resume = h.startPipeline();
  await tick();
  const next = h.groups()[1];
  assert.notEqual(first.groupId, next.groupId);
  h.capture(next, 0);
  h.capture(next, 1);
  h.status(next, 'completed', [result(0), result(1)]);
  await resume;
});

test('invalid explicit dependencies fail instead of silently using the previous frame', async () => {
  const h = harness({ visuals: [frame(0, { status: 'completed', result_url: 'https://media/0' }), frame(1, { continuity: 'continue', frame_reference: 'missing.png' })] });
  await h.startPipeline();
  assert.equal(h.groups().length, 0);
  assert.equal(h.state().currentSpec.visuals[1].status, 'error');
  assert.match(h.state().currentSpec.visuals[1].error, /requires a completed reference/);
});

test('re-roll can run after pausing and uses the same locked generation lifecycle', async () => {
  const h = harness({ max_retries: 1, visuals: [frame(0)] });
  const run = h.startPipeline();
  await tick();
  h.pausePipeline();
  h.status(h.groups()[0], 'cancelled');
  await run;
  const reroll = h.regenerateSingleFrame(0);
  await tick();
  assert.equal(h.state().pipelineRunning, true);
  assert.equal(h.groups().length, 2);
  const group = h.groups()[1];
  h.capture(group, 0);
  h.status(group, 'completed', [result(0)]);
  await reroll;
  assert.equal(h.state().pipelineRunning, false);
  assert.equal(h.state().currentSpec.visuals[0].status, 'completed');
});

test('an uncertain submission stops automatic retries while preserving the other completed images', async () => {
  const h = harness({ max_retries: 3, visuals: [frame(0), frame(1), frame(2)] });
  const run = h.startPipeline();
  await tick();
  const group = h.groups()[0];
  h.capture(group, 0);
  h.status(group, 'error', [result(0), { ...result(1, false), error: 'Timed out waiting for the submitted tile', retryable: false,
    submission: { state: 'unknown', marker: 'possibly-submitted' } }]);
  await run;
  assert.equal(h.groups().length, 1, 'no retry should click Generate for the same uncertain image');
  assert.equal(h.state().currentSpec.visuals[0].status, 'completed');
  const saved = h.generateMappingData();
  assert.equal(saved.visuals[1].flow_submission.state, 'unknown');
  const restored = harness(saved);
  await restored.startPipeline();
  assert.equal(restored.groups().length, 0, 'reloading must not forget that a prompt may already have been accepted');
  assert.match(restored.state().currentSpec.visuals[1].error, /may already have been submitted/);
});

test('saved accepted images resume collection instead of being submitted again', async () => {
  const submission = { state: 'accepted', tileId: 'known-tile', marker: 'known-submission', excludedMediaUrls: [] };
  const h = harness({ visuals: [frame(0, { status: 'error', retryable: false, flow_submission: submission })] });
  const run = h.startPipeline();
  await tick();
  const group = h.groups()[0];
  assert.equal(group.payloads[0].resumeSubmission.tileId, 'known-tile');
  h.capture(group, 0);
  h.status(group, 'completed', [result(0)]);
  await run;
  assert.equal(h.state().currentSpec.visuals[0].status, 'completed');
});

test('legacy Failed to fill prompt states require reconciliation; explicit re-roll authorizes a fresh submission', async () => {
  const h = harness({ visuals: [frame(0, { status: 'error', error: 'Failed to fill prompt' })] });
  await h.startPipeline();
  assert.equal(h.groups().length, 0);
  const reroll = h.regenerateSingleFrame(0);
  await tick();
  const group = h.groups()[0];
  assert.equal(group.payloads[0].resumeSubmission, null);
  h.capture(group, 0);
  h.status(group, 'completed', [result(0)]);
  await reroll;
});

test('Sync Flow Images recovers a unique semantic title but refuses duplicate or reused images', async () => {
  const h = harness({ visuals: [
    frame(0, { status: 'error', error: 'Failed to fill prompt', flow_tile_title: 'Map of Middle East' }),
    frame(1, { status: 'error', error: 'Failed to fill prompt', flow_tile_title: 'Prehistoric travelers' }),
    frame(2, { status: 'error', error: 'Failed to fill prompt', flow_tile_title: 'Map of Middle East' })
  ] }, [
    { tileId: 'map', title: 'Map of Middle East displayed', imgSrc: 'https://media/map' },
    { tileId: 'traveler-a', title: 'Prehistoric travelers carrying weapons', imgSrc: 'https://media/traveler-a' },
    { tileId: 'traveler-b', title: 'Prehistoric travelers carrying weapons', imgSrc: 'https://media/traveler-b' }
  ]);
  await h.syncFlowProjectTiles();
  const visuals = h.state().currentSpec.visuals;
  assert.equal(visuals[0].status, 'completed');
  assert.equal(visuals[0].flow_submission, null);
  assert.equal(visuals[0].result_url, 'https://media/map');
  assert.equal(visuals[1].status, 'error');
  assert.equal(visuals[2].status, 'error');
  assert.match(h.alerts.at(-1), /Recovered 1/);
});
