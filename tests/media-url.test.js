const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'media-url.js'),
  'utf8'
);
const context = {};
vm.runInNewContext(source, context);
const mediaUrlTools = context.MediaUrlTools;

assert.equal(mediaUrlTools.normalize('https://example.test/frame.png?token=one'), 'https://example.test/frame.png');
assert.equal(mediaUrlTools.normalize('https://example.test/frame.png?token=two'), 'https://example.test/frame.png');
assert.equal(mediaUrlTools.normalize('blob:https://flow.google.com/id#fragment'), 'blob:https://flow.google.com/id');
assert.equal(mediaUrlTools.normalize(''), '');

console.log('media URL tests passed');
