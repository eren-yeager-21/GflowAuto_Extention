const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'pipeline-concurrency.js'),
  'utf8'
);
const context = {};
vm.runInNewContext(source, context);
const scheduler = context.PipelineConcurrency;

assert.equal(scheduler.normalizeMaxParallel(undefined), 3);
assert.equal(scheduler.normalizeMaxParallel('3'), 3);
assert.equal(scheduler.normalizeMaxParallel(0), 1);
assert.equal(scheduler.normalizeMaxParallel(99), 99);

const frames = [
  { id: 'frame_001', continuity: 'anchor' },
  { id: 'frame_002', continuity: 'continue' },
  { id: 'frame_003', continuity: 'anchor' },
  { id: 'frame_004', frame_reference: 'frame_003.png', continuity: 'anchor' }
];
const partition = scheduler.partitionFrameIndexes(frames);
assert.deepEqual(Array.from(partition.independent), [0, 2]);
assert.deepEqual(Array.from(partition.dependent), [1, 3]);

console.log('pipeline concurrency tests passed');
