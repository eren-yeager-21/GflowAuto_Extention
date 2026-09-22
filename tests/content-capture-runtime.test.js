const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.ts-DFAayvhs.js'), 'utf8');
const start = source.indexOf('_=async(');
const end = source.indexOf(';function V(', start);
assert.ok(start >= 0 && end > start, 'locate the actual content-worker capture routine');

async function runCapture({ captureToken, failLog = false, failNotification = false, resourceCount = 1, singleResourceOnly = true } = {}) {
  const messages = [];
  const resources = Array.from({ length: resourceCount }, (_, index) => ({
    src: `https://example.test/fallback-${index}.png`,
    currentSrc: `https://example.test/generated-${index}.png?token=kept`,
    tagName: 'IMG',
    closest: () => ({ querySelector: () => ({ innerText: `Generated tile ${index}` }) })
  }));
  const tile = { 0: {}, length: 1, first() { return this; } };
  const context = {
    chrome: { runtime: { sendMessage(message) {
      messages.push(message);
      if (failLog && message.type === 'ACTION_LOG') throw new Error('Log delivery failed');
      if (failNotification && message.type === 'SPEC_FRAME_IMAGE_CAPTURED') {
        throw new Error('Side panel is closed');
      }
      return Promise.resolve({ success: true });
    } } },
    o: () => tile,
    D: id => id,
    O: () => ({ hasPercentage: false, hasResource: true, tileVideos: [], tileImages: resources }),
    normalizeTileResourceUrl: url => url.split('?')[0],
    I() {}, C() {}, y() {}, s: async () => {}, t: () => 'prompt', URL,
    n: async () => {}, a: async () => false, i: async () => {}
  };
  // Evaluate the production routine, not a copy of its implementation.
  vm.runInNewContext(source.slice(start, end), context);
  const result = await context._(['tile-22'], {
    mode: 'textToImage', outputCount: resourceCount, promptIndex: 21,
    prompt: 'Frame prompt', folderName: 'test', targetFilename: 'frame_022.png',
    groupId: 'group-test', captureToken, autoDownloadResourceQuality: 'original', singleResourceOnly
  }, () => false, { selectors: {} });
  return { result, messages };
}

async function main() {
  for (const captureToken of [undefined, 'reroll-test']) {
    const { result, messages } = await runCapture({ captureToken });
    assert.equal(result.success, true);
    assert.equal(result.capturedResources.length, 1, 'successful generation must include its mapped resource');
    const capture = result.capturedResources[0];
    assert.equal(capture.mediaUrl, 'https://example.test/generated-0.png?token=kept');
    assert.equal(capture.tileTitle, 'Generated tile 0');
    assert.equal(capture.filename, 'frame_022.png');
    assert.equal(capture.captureToken, captureToken || '');
    const notifications = messages.filter(message => message.type === 'SPEC_FRAME_IMAGE_CAPTURED');
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].mediaUrl, capture.mediaUrl);
    assert.equal(messages.filter(message => message.type === 'DOWNLOAD_RESOURCE').length, 1);
    const log = messages.find(message => message.data?.event === 'media_capture_emitted');
    assert.equal(log?.data.details.mediaType, 'img');
  }

  const failedLog = await runCapture({ failLog: true, captureToken: 'reroll-test' });
  assert.equal(failedLog.result.capturedResources.length, 1, 'a logger error must not erase captured metadata');
  assert.equal(failedLog.messages.filter(message => message.type === 'SPEC_FRAME_IMAGE_CAPTURED').length, 1,
    'a logger error must not suppress capture delivery');

  const closedPanel = await runCapture({ failNotification: true });
  assert.equal(closedPanel.result.capturedResources.length, 1,
    'terminal results must retain metadata when the side panel cannot receive a notification');

  const single = await runCapture({ resourceCount: 2 });
  assert.equal(single.result.capturedResources.length, 1);
  const multiple = await runCapture({ resourceCount: 2, singleResourceOnly: false });
  assert.equal(multiple.result.capturedResources.length, 2);
  assert.notEqual(multiple.result.capturedResources[0].mediaUrl, multiple.result.capturedResources[1].mediaUrl);
  console.log('content capture runtime tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
