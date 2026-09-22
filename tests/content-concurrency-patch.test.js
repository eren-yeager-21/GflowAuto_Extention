const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'index.ts-DFAayvhs.js'),
  'utf8'
);

assert.equal(
  source.includes('for(let n=0;n<1;n++)o.push(L(e,t,z,J).catch(e=>{}));'),
  true,
  'Flow DOM automation must use one submitter to prevent prompt-box races'
);
assert.equal(
  source.includes('Math.min(e.concurrentPrompts||1,e.pendingIndexes.length)'),
  false,
  'parallel generation must not create simultaneous prompt-box workers'
);
assert.equal(
  source.includes('if(!e.deferGenerationWait)await m(r.stopButton,n,9e5)'),
  true,
  'independent submissions must move on without waiting for generation completion'
);
assert.equal(
  source.includes('if(o.filter(t=>t.id===e.id).length>=e.concurrentPrompts)'),
  true,
  'the submitter must wait when the active-generation limit is reached'
);

console.log('content concurrency patch tests passed');
