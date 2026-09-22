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
);const backgroundSource = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'index.ts-B2QzyOff.js'),
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
  source.includes('const beforeOutputItems=o(n.selectors.outputItems)') &&
    source.includes('outputItemCountBeforeSubmit=beforeOutputItems.length'),
  true,
  'each submission must snapshot stable Flow tile state'
);
assert.equal(
  source.includes('beforeResourceUrls=new Set(e.outputResourceUrlsBeforeSubmit||[])'),
  true,
  'result lookup must identify a tile whose stable state was absent before submission'
);
assert.equal(
  source.includes('data-veo-prompt-key') && source.includes('e.startsWith("veo_prompt_")'),
  true,
  'new tiles must receive a stable per-prompt selector'
);
assert.equal(
  panelSource.includes('capture_rejected_duplicate'),
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
assert.equal(
  source.includes('Tile ${r+1} is accepted and still waiting for generation progress...'),
  true,
  'an accepted placeholder tile must remain active while Flow starts generation'
);
assert.equal(
  source.includes('error (no % and no image/video after 3 retries)') || source.includes('w=h.length+g.length'),
  false,
  'a placeholder without early progress must not be treated as a terminal error'
);
assert.equal(
  backgroundSource.includes('chrome.runtime.onConnect.addListener') &&
    backgroundSource.includes('spec-pipeline-keepalive'),
  true,
  'the background worker must receive the side-panel keep-alive port'
);
assert.equal(
  /keepAliveTimer\s*=\s*setInterval\(sendPing,\s*\d+\)/.test(panelSource) &&
    panelSource.includes('clearInterval(keepAliveTimer)'),
  true,
  'the side panel must maintain one recoverable keep-alive timer'
);
assert.equal(
  source.includes('outputItemCountBeforeSubmit=beforeOutputItems.length') &&
    source.includes('outputResourceUrlsBeforeSubmit=beforeOutputItems.toArray()'),
  true,
  'tile matching must snapshot stable counts and resource URLs before submission'
);
assert.equal(
  source.includes('findIndex(t=>!(e.outputItemsBeforeSubmit||[]).includes(t))'),
  false,
  'tile matching must not use DOM node identity because Flow re-renders old cards'
);
assert.equal(
  source.includes('return i.hasPercentage||!i.hasResource') &&
    source.includes('t&&beforeResourceUrls.has(t)?0:-1'),
  true,
  'tile matching must require generation state or a verified inserted position'
);
assert.equal(
  source.includes('i?!beforeResourceUrls.has(i):s.isGenerating'),
  false,
  'a newly visible URL alone must not identify a generated tile'
);
assert.equal(
  source.includes('priorResourceUrls.has(normalizeTileResourceUrl(e.currentSrc||e.src))'),
  true,
  'resources that existed before the prompt must be excluded from capture'
);
assert.equal(
  source.includes('event:"pre_submit_snapshot"') &&
    source.includes('event:"tile_candidate_selected"') &&
    source.includes('event:"tile_candidate_wait"') &&
    source.includes('event:"media_capture_emitted"'),
  true,
  'the content worker must emit structured tile-selection diagnostics'
);
assert.equal(
  source.includes('currentSrc||e.src') && source.includes('currentSrc||P[e].src'),
  true,
  'capture must prefer the browser-selected current media source'
);
assert.equal(
  source.includes('mediaType:String(P[e].tagName||"").toLowerCase()'),
  true,
  'capture diagnostics must record whether Flow emitted an image or video element'
);
console.log('content concurrency patch tests passed');
