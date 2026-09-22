const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'index.ts-DFAayvhs.js'),
  'utf8'
);
const panelSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'spec-pipeline.js'),
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
assert.equal(
  source.includes('e.outputItemsBeforeSubmit=o(n.selectors.outputItems).toArray()'),
  true,
  'each submission must snapshot existing Flow tiles'
);
assert.equal(
  source.includes('findIndex(t=>!(e.outputItemsBeforeSubmit||[]).includes(t))'),
  true,
  'result lookup must select a newly created Flow tile'
);
assert.equal(
  source.includes('data-veo-prompt-key') && source.includes('e.startsWith("veo_prompt_")'),
  true,
  'new tiles must receive a stable per-prompt selector'
);
assert.equal(
  panelSource.includes('Duplicate Flow tile capture blocked:'),
  true,
  'the side panel must reject a result URL already assigned to another frame'
);
assert.equal(
  source.includes('case"PAUSE_PROMPT_GROUP"') && source.includes('isPausing:!1'),
  true,
  'the content worker must support a distinct soft-pause state'
);
assert.equal(
  source.includes('if(e.isPausing){e.pendingIndexes.includes(i)||e.pendingIndexes.unshift(i);return}'),
  true,
  'a pause during the submission delay must return the untouched frame to the pending queue'
);
assert.equal(
  source.includes('if(e.isPausing){e.status="paused"') && source.includes('pendingPromptIndexes'),
  true,
  'a paused group must wait for active downloads and report its pending frames'
);
assert.equal(
  panelSource.includes("sendToFlowTab({ type: 'PAUSE_PROMPT_GROUP', groupId })"),
  true,
  'the Spec Pipeline Pause button must request a graceful pause instead of cancellation'
);
assert.equal(
  panelSource.includes("if (msg.type === 'ACTION_LOG' && msg.data)"),
  true,
  'the Spec Pipeline Debug Log must receive Flow action log entries'
);
assert.equal(
  panelSource.includes('if (pipelineRunning && pipelinePaused) {'),
  true,
  'a pause before Flow accepts the group must prevent that group from being submitted'
);

assert.equal(
  source.includes('c.singleResourceOnly?g.resourceElements.slice(0,1):g.resourceElements'),
  true,
  'a Spec frame must capture and download only one Flow resource'
);

assert.equal(
  source.includes('capturedResources') && source.includes('captureToken:c.captureToken||""'),
  true,
  'captured image metadata must be returned with the terminal group result'
);
console.log('content concurrency patch tests passed');
