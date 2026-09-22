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
assert.equal(scheduler.normalizeMaxParallel(99), 10);
assert.equal(scheduler.MAX_PARALLEL, 10);

const frames = [
  { id: 'frame_001', continuity: 'anchor' },
  { id: 'frame_002', continuity: 'anchor' },
  { id: 'frame_003', continuity: 'continue' },
  { id: 'frame_004', frame_reference: 'frame_003.png', continuity: 'anchor' },
  { id: 'frame_005', continuity: 'anchor' },
  { id: 'frame_006', continuity: 'anchor' }
];
const plan = scheduler.buildExecutionPlan(frames);
assert.deepEqual(
  Array.from(plan, step => step.type === 'independent'
    ? { type: step.type, indexes: Array.from(step.indexes) }
    : { type: step.type, index: step.index }),
  [
    { type: 'independent', indexes: [0, 1] },
    { type: 'dependent', index: 2 },
    { type: 'dependent', index: 3 },
    { type: 'independent', indexes: [4, 5] }
  ]
);

console.log('pipeline concurrency tests passed');
