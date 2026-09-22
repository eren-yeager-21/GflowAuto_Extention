const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'spec-pipeline.js'),
  'utf8'
);

assert.equal(source.includes("const DEBUG_STORAGE_KEY = 'spec_pipeline_diagnostics_v1'"), true);
assert.equal(source.includes('const MAX_DEBUG_ENTRIES = 500'), true);
assert.equal(source.includes('function persistDebugEntries()'), true);
assert.equal(source.includes('function loadDebugEntries()'), true);
assert.equal(source.includes('chrome.storage.local.remove([DEBUG_STORAGE_KEY])'), true);
assert.equal(source.includes('function sanitizeDiagnosticMessage(message)'), true);
assert.equal(source.includes("diagnostic('generation_group_created'"), true);
assert.equal(source.includes("diagnostic('generation_group_status'"), true);
assert.equal(source.includes("diagnostic('capture_received'"), true);
assert.equal(source.includes("diagnostic('preview_load_failed'"), true);
assert.equal(source.includes("diagnostic('uncaught_error'"), true);
assert.equal(source.includes("diagnostic('unhandled_rejection'"), true);
assert.equal(source.includes('mapRerollFromNewFlowTile'), false);
assert.equal((source.match(/window\.addEventListener\('error'/g) || []).length, 1);
assert.equal((source.match(/window\.addEventListener\('unhandledrejection'/g) || []).length, 1);

console.log('pipeline diagnostics tests passed');
