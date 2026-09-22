const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'reroll-tile-fallback.js'),
  'utf8'
);
const context = {};
vm.runInNewContext(source, context);
const fallback = context.RerollTileFallback;

const oldTile = { title: 'Old frame', imgSrc: 'https://example.test/old.png' };
const newTile = { title: 'New frame', imgSrc: 'https://example.test/new.png' };
assert.equal(fallback.chooseNewTile([oldTile], [newTile, oldTile]).imgSrc, newTile.imgSrc);
assert.equal(fallback.chooseNewTile([], [newTile]).imgSrc, newTile.imgSrc);
assert.equal(fallback.chooseNewTile([oldTile], [{ ...oldTile, title: 'Renamed old frame' }]), null);
assert.equal(fallback.chooseNewTile([oldTile], [oldTile]), null);

console.log('reroll tile fallback tests passed');