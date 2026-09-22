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

const stored = {};
const events = [];
const view = { innerHTML: '' };
const resumeButton = { addEventListener(type, callback) { this[type] = callback; } };
const switchButton = { addEventListener(type, callback) { this[type] = callback; } };
const select = { value: '0' };
const alerts = [];
let failWrite = false;
let pendingSaves = [];
const context = vm.createContext({
  URL, crypto: require('node:crypto').webcrypto, IMAGE_MODEL: 'Nano Banana 2',
  STORAGE_KEY_PREFIX: 'flow_pipeline_session_', LATEST_KEY: 'flow_pipeline_latest_project',
  LATEST_SESSION_KEY: 'flow_pipeline_latest_session',
  currentSpec: null, activeSessionStorageKey: null, localFrameTitleMap: new Map(),
  pipelineRunning: false, activeRerollIndex: null, alert: message => alerts.push(message),
  diagnostic: (event, message, details) => events.push({ event, message, details }),
  renderPipelineDashboard() {}, checkFlowCharacters() {}, setupDropzone() {},
  formatReferenceGuidance: frame => frame.formatted_reference_guidance || '',
  getSpecView: () => view,
  document: { getElementById(id) {
    return { 'btn-resume-session': resumeButton, 'saved-session-select': select, 'btn-reset-spec': switchButton }[id] || null;
  }, querySelectorAll: () => [] },
  chrome: {
    runtime: {},
    storage: { local: {
      get(keys, callback) { callback(structuredClone(stored)); },
      set(data) {
        if (failWrite) return Promise.reject(new Error('Quota exceeded'));
        Object.assign(stored, structuredClone(data));
        return Promise.resolve();
      }
    } }
  }
});
for (const file of ['reroll-history.js', 'pipeline-concurrency.js']) {
  vm.runInContext(fs.readFileSync(path.join(panelDir, file), 'utf8'), context);
}
context.rerollHistory = context.RerollHistory;
context.pipelineConcurrency = context.PipelineConcurrency;
for (const name of [
  'getStorageKey', 'createSessionStorageKey', 'getSavedSessionEntries', 'checkSavedSessions',
  'generateMappingData', 'savePipelineMapping', 'registerLocalFrameTitle', 'getLocalFrameTitle',
  'parseAndLoadSpec', 'renderUploadScreen', 'escapeHtml', 'attachDashboardEvents'
]) vm.runInContext(productionFunction(name), context);
const save = context.savePipelineMapping;
context.savePipelineMapping = () => {
  const pending = save();
  pendingSaves.push(pending);
  return pending;
};
async function flushSaves() {
  const pending = pendingSaves;
  pendingSaves = [];
  await Promise.all(pending);
}

const previous = {
  project_name: 'Previous project', last_updated: '2026-09-21T12:00:00.000Z', characters: [],
  visuals: [{ id: 'frame_001', target_filename: 'frame_001.png', prompt: 'Previous prompt',
    status: 'completed', result_url: 'https://example.test/previous.png?signature=keep',
    flow_tile_title: 'Previous title', completed_at: '2026-09-21T12:00:00.000Z',
    reroll_previous: { result_url: 'https://example.test/older.png', flow_tile_title: 'Older title' } }]
};
const oldKey = context.getStorageKey(previous.project_name);
const incoming = { project_name: 'New project', visuals: [{ prompt: 'New prompt' }] };

async function main() {
  stored[oldKey] = structuredClone(previous);
  stored.flow_pipeline_latest_project = previous.project_name;
  context.parseAndLoadSpec(incoming);
  await flushSaves();
  const newKey = context.activeSessionStorageKey;
  assert.notEqual(newKey, oldKey);
  assert.deepEqual(stored[oldKey], previous, 'import must preserve the old project session');
  let sessions = context.getSavedSessionEntries(stored);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find(session => session.key === oldKey).completedCount, 1);
  assert.equal(sessions.find(session => session.key === newKey).completedCount, 0);

  context.renderUploadScreen();
  assert.ok(view.innerHTML.includes('Saved Sessions (2)'));
  assert.ok(view.innerHTML.includes('Previous project'));
  assert.ok(view.innerHTML.includes('1/1 completed'));
  assert.ok(view.innerHTML.includes('0/1 completed'), 'an incomplete latest session does not hide recovery');
  select.value = String(sessions.findIndex(session => session.key === oldKey));
  resumeButton.click();
  await flushSaves();
  assert.equal(context.activeSessionStorageKey, oldKey, 'resume updates the selected legacy key');
  assert.equal(context.currentSpec.visuals[0].result_url, previous.visuals[0].result_url);
  assert.equal(context.currentSpec.visuals[0].reroll_previous.result_url, previous.visuals[0].reroll_previous.result_url);

  const preserved = structuredClone(stored[oldKey]);
  context.parseAndLoadSpec({ ...incoming, project_name: previous.project_name });
  await flushSaves();
  const duplicateKey = context.activeSessionStorageKey;
  assert.notEqual(duplicateKey, oldKey, 'same-project import receives a separate key');
  assert.deepEqual(stored[oldKey], preserved, 'same-project import must not overwrite progress');
  assert.equal(context.currentSpec.visuals[0].flow_tile_title, null, 'a new session must not inherit old frame titles');
  context.currentSpec.visuals[0].status = 'completed';
  await context.savePipelineMapping();
  assert.equal(context.activeSessionStorageKey, duplicateKey);
  assert.equal(stored[duplicateKey].visuals[0].status, 'completed', 'subsequent saves use the same session');

  stored.flow_pipeline_latest_session = 'missing-key';
  assert.equal(context.getSavedSessionEntries(stored).length, 3, 'a stale latest pointer must not hide other sessions');
  stored.flow_pipeline_session_invalid = { project_name: 'Bad', visuals: [null] };
  stored.spec_pipeline_diagnostics_v1 = [{ message: 'Not a session' }];
  assert.equal(context.getSavedSessionEntries(stored).length, 3);

  failWrite = true;
  assert.equal(await context.savePipelineMapping(), false);
  assert.ok(events.some(event => event.event === 'session_save_failed'));
  context.attachDashboardEvents();
  const activeSpec = context.currentSpec;
  await switchButton.click();
  assert.equal(context.currentSpec, activeSpec, 'failed save must leave the current session open');
  assert.ok(alerts[0].includes('Could not save this session'));
  failWrite = false;
  for (const busyState of ['generation', 'reroll']) {
    context.pipelineRunning = busyState === 'generation';
    context.activeRerollIndex = busyState === 'reroll' ? 0 : null;
    await switchButton.click();
    assert.equal(context.currentSpec, activeSpec, 'session switching must not interrupt active generation');
  }
  context.pipelineRunning = false;
  context.activeRerollIndex = null;
  const wrappedSave = context.savePipelineMapping;
  let finishSave;
  context.savePipelineMapping = () => new Promise(resolve => { finishSave = resolve; });
  const switching = switchButton.click();
  assert.equal(context.currentSpec, activeSpec, 'switch must wait for the save to finish');
  finishSave(true);
  await switching;
  assert.equal(context.currentSpec, null);
  assert.equal(context.activeSessionStorageKey, null);
  assert.ok(view.innerHTML.includes('Saved Sessions (3)'));
  context.savePipelineMapping = wrappedSave;
  context.chrome.runtime.lastError = { message: 'Storage read failed' };
  context.renderUploadScreen();
  assert.ok(view.innerHTML.includes('Unable to read saved sessions'));
  assert.ok(!view.innerHTML.includes('No saved sessions found'));
  assert.ok(events.some(event => event.event === 'session_list_failed'));
  console.log('saved session recovery tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
