const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const helperSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'reroll-history.js'),
  'utf8'
);
const context = {};
vm.runInNewContext(helperSource, context);
const history = context.RerollHistory;

const frame = {
  result_url: 'https://example.test/frame-old.png',
  flow_tile_title: 'Old tile',
  completed_at: '2026-01-01T00:00:00.000Z',
  status: 'completed',
  progress: 100
};

assert.equal(history.begin(frame).result_url, 'https://example.test/frame-old.png');
assert.equal(history.commit(frame), true);
frame.result_url = 'https://example.test/frame-new.png';
frame.flow_tile_title = 'New tile';
assert.equal(frame.reroll_previous.result_url, 'https://example.test/frame-old.png');
assert.equal(history.restore(frame), true);
assert.equal(frame.result_url, 'https://example.test/frame-old.png');
assert.equal(frame.flow_tile_title, 'Old tile');
assert.equal(frame.reroll_previous, null);

frame.result_url = 'https://example.test/frame-current.png';
frame.reroll_previous = { result_url: 'https://example.test/older.png' };
history.begin(frame);
history.cancel(frame);
assert.equal(frame.reroll_previous.result_url, 'https://example.test/older.png');

const backgroundSource = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'index.ts-B2QzyOff.js'),
  'utf8'
);
assert.equal(
  backgroundSource.includes('filename:r.get(e.url),conflictAction:"overwrite"'),
  true,
  'determined frame filenames must overwrite existing files'
);
assert.equal(
  backgroundSource.includes('conflictAction:"overwrite"})'),
  true,
  'fallback determined filenames must also overwrite existing files'
);
assert.equal(
  backgroundSource.includes('filename:e,saveAs:!1,conflictAction:"overwrite"'),
  true,
  'automatic resource downloads must request overwrite behavior'
);

const panelSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'spec-pipeline.js'),
  'utf8'
);
assert.equal(panelSource.includes("conflictAction: 'overwrite'"), true);
assert.equal(panelSource.includes('btn-revert-frame'), true);
assert.equal(panelSource.includes('rerollHistory.commit(frame)'), true);
assert.equal(panelSource.includes('reroll_previous: rerollHistory.normalizeSnapshot'), true);

const indexSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'index.html'),
  'utf8'
);
assert.equal(indexSource.includes('./reroll-history.js'), true);

console.log('re-roll versioning tests passed');
