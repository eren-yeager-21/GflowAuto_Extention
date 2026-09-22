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
assert.equal(source.includes("frame.status = 'pending';") && source.includes("status === 'paused' && !result"), true);

console.log('spec pipeline tools tests passed');
