const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'spec-pipeline.js'),
  'utf8'
);

assert.equal(source.includes('id="spec-generation-mode" disabled'), true);
assert.equal(source.includes('<option value="textToImage" selected>Text to Image</option>'), true);
assert.equal(source.includes('id="spec-image-model"') && source.includes("const IMAGE_MODEL = 'Nano Banana 2'"), true);
assert.equal(source.includes('id="max-parallel-generations"'), true);
assert.equal(source.includes('pipelineConcurrency.MAX_PARALLEL'), true);
assert.equal(source.includes('id="spec-debug-log"'), true);
assert.equal(source.includes('id="btn-copy-debug-log"'), true);
assert.equal(source.includes('id="btn-clear-debug-log"'), true);
assert.equal(source.includes('class="spec-view-tabs"'), true);
assert.equal(source.includes('data-spec-tab="control"') && source.includes('data-spec-tab="settings"') && source.includes('data-spec-tab="debug"'), true);
assert.equal(source.includes('function setActiveSpecTab(tabName)'), true);
assert.equal(source.includes('<details class="spec-tools-panel'), false);
assert.equal(source.includes("frame.status = 'pending';") && source.includes("status === 'paused' && !result"), true);
assert.equal(source.includes('executeFrameGeneration(frame, refImages, idx, { maxRetries: 0 })'), true);
assert.equal(source.includes('payload.maxRetries = Math.max(0, options.maxRetries);'), true);

const rerollStart = source.indexOf('async function regenerateSingleFrame');
const rerollLock = source.indexOf('activeRerollIndex = idx;', rerollStart);
const rerollTabLookup = source.indexOf('await getFlowTargetTab();', rerollStart);
assert.equal(rerollStart >= 0 && rerollLock > rerollStart && rerollLock < rerollTabLookup, true);

console.log('spec pipeline tools tests passed');
