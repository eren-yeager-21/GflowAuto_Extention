const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'flow-destination.js'),
  'utf8'
);
const context = { URL };
vm.runInNewContext(source, context);
const { normalizeFlowUrl, isSameFlowUrl, chooseFlowTab } = context.FlowDestination;

assert.equal(normalizeFlowUrl(' https://flow.google.com/project/abc/ '), 'https://flow.google.com/project/abc');
assert.equal(normalizeFlowUrl('http://flow.google.com/project/abc'), '');
assert.equal(normalizeFlowUrl('https://example.com/project/abc'), '');
assert.equal(isSameFlowUrl('https://flow.google.com/project/abc/', 'https://flow.google.com/project/abc'), true);
assert.equal(isSameFlowUrl('https://flow.google.com/project/abc?collection=1', 'https://flow.google.com/project/abc?collection=2'), false);

const tabs = [
  { id: 1, url: 'https://flow.google.com/project/other', active: true },
  { id: 2, url: 'https://flow.google.com/project/wanted?collection=7', active: false }
];
assert.equal(chooseFlowTab(tabs, 'https://flow.google.com/project/wanted?collection=7').id, 2);
assert.equal(chooseFlowTab(tabs, '').id, 1);
assert.equal(chooseFlowTab([{ id: 3, url: 'https://example.com' }], ''), null);

console.log('flow-destination tests passed');
