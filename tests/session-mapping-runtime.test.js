const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const panelDir = path.join(__dirname, '..', 'src', 'ui', 'side-panel');
const source = fs.readFileSync(path.join(panelDir, 'spec-pipeline.js'), 'utf8');
function productionFunction(name) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }', start);
  assert.ok(start >= 0 && end > start, `locate production function ${name}`);
  return source.slice(start, end + '\n  }'.length);
}

const events = [];
const context = vm.createContext({
  URL, IMAGE_MODEL: 'Nano Banana 2', currentSpec: null, localFrameTitleMap: new Map(),
  activeSessionStorageKey: null, STORAGE_KEY_PREFIX: 'flow_pipeline_session_',
  crypto: require('node:crypto').webcrypto,
  pipelineRunning: false, activeRerollIndex: null, activeFrameDownloads: new Set(),
  diagnostic: (event, message, details) => events.push({ event, message, details }),
  renderPipelineDashboard() {}, checkFlowCharacters() {}, savePipelineMapping() {},
  updateFrameCard() {}, updateProjectStats() {},
  formatReferenceGuidance: frame => frame.formatted_reference_guidance || '',
  resolveFlowTileTitleForFrame: () => null
});
for (const file of ['reroll-history.js', 'pipeline-concurrency.js', 'media-url.js']) {
  vm.runInContext(fs.readFileSync(path.join(panelDir, file), 'utf8'), context);
}
context.rerollHistory = context.RerollHistory;
context.pipelineConcurrency = context.PipelineConcurrency;
context.mediaUrlTools = context.MediaUrlTools;
for (const name of [
  'getStorageKey', 'createSessionStorageKey', 'registerLocalFrameTitle', 'getLocalFrameTitle', 'parseAndLoadSpec',
  'generateMappingData', 'renderFramesList', 'escapeHtml', 'escapeAttr',
  'summarizeMediaUrl', 'applyCapturedFrameImage'
]) vm.runInContext(productionFunction(name), context);

const saved = {
  project_name: 'Saved session',
  visuals: [1, 2].map(number => ({
    id: `frame_00${number}`, frame_number: number, target_filename: `frame_00${number}.png`,
    prompt: `Frame ${number}`, continuity: number === 1 ? 'anchor' : 'continue',
    status: 'completed', completed_at: '2026-09-21T12:00:00.000Z',
    result_url: `https://example.test/image-${number}.png?signature=original&size=large`,
    flow_tile_title: `Original image ${number}`,
    reroll_previous: number === 1 ? { result_url: 'https://example.test/older.png', flow_tile_title: 'Older image' } : null
  }))
};
const inputBefore = JSON.stringify(saved);
context.parseAndLoadSpec(saved);
assert.equal(JSON.stringify(saved), inputBefore, 'restoring must not mutate the input mapping');
const restored = context.generateMappingData();
const rendered = context.renderFramesList();
for (const [index, frame] of saved.visuals.entries()) {
  assert.equal(restored.visuals[index].result_url, frame.result_url, 'restore preserves the complete URL');
  assert.equal(restored.visuals[index].flow_tile_title, frame.flow_tile_title);
  assert.equal(restored.visuals[index].status, 'completed');
  assert.ok(rendered.includes(`src="${frame.result_url}"`), 'preview uses the saved URL without stripping its query');
}
assert.equal(restored.visuals[0].reroll_previous.result_url, saved.visuals[0].reroll_previous.result_url);

const frame = context.currentSpec.visuals[0];
const untouchedFrame = context.currentSpec.visuals[1];
const lateCapture = {
  promptIndex: 0, mediaUrl: 'https://example.test/late.png', tileTitle: 'Late result', captureToken: 'old-reroll'
};
assert.equal(context.applyCapturedFrameImage(lateCapture), false,
  'a capture from a previous re-roll must not overwrite a restored frame');
assert.equal(frame.result_url, saved.visuals[0].result_url);

context.rerollHistory.begin(frame);
frame.reroll_in_progress = true;
frame.reroll_capture_token = 'active-reroll';
assert.equal(context.applyCapturedFrameImage({ ...lateCapture, captureToken: undefined }), false);
assert.equal(context.applyCapturedFrameImage(lateCapture), false);
assert.equal(context.applyCapturedFrameImage({ ...lateCapture, promptIndex: 1, captureToken: 'active-reroll' }), false,
  'a re-roll token must not permit a capture to change a different frame');
assert.equal(context.applyCapturedFrameImage({ ...lateCapture, captureToken: 'active-reroll' }), true);
assert.equal(frame.result_url, lateCapture.mediaUrl);
assert.equal(frame.reroll_previous.result_url, saved.visuals[0].result_url);
assert.equal(untouchedFrame.result_url, saved.visuals[1].result_url);
assert.equal(untouchedFrame.flow_tile_title, saved.visuals[1].flow_tile_title);

frame.reroll_in_progress = false;
delete frame.reroll_capture_token;
assert.equal(context.rerollHistory.restore(frame), true);
assert.equal(context.applyCapturedFrameImage({ ...lateCapture, captureToken: 'active-reroll' }), false,
  'a delayed notification after Revert must not undo the restored image');
assert.equal(frame.result_url, saved.visuals[0].result_url);
assert.ok(events.some(event => event.event === 'capture_rejected_stale_token'));
console.log('session mapping runtime tests passed');
