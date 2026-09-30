import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { contextPrompt } from '../../src/modules/ai-reviewer/context.js';
import { prompt, REVIEW_SCOPE } from '../../src/modules/ai-reviewer/contract.js';

const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const root = new URL('../../src/modules/ai-reviewer/', import.meta.url);
const settings = await readJson(new URL('defaults/settings.json', root));
settings.validator = await readFile(new URL('defaults/validator.md', root), 'utf8');
const manifest = await readJson(new URL('context/index.json', root));
function jpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) throw new Error('Invalid JPEG marker.');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    offset += length;
  }
  throw new Error('JPEG dimensions unavailable.');
}
const sheets = [];
for (const filename of manifest.images) sheets.push({ filename, ...jpegDimensions(await readFile(new URL('context/contact_sheets/' + filename, root))) });
const seed = { images: sheets, transcriptName: 'transcript.txt', transcript: await readFile(new URL('context/transcript.txt', root), 'utf8') };
const context = { id: 'context-sample-' + randomUUID(), kind: 'context', settings, reviewScope: REVIEW_SCOPE };
await writeFile(new URL('context-job.json', import.meta.url), JSON.stringify(context, null, 2));
await writeFile(new URL('context-prompt.txt', import.meta.url), contextPrompt(context, seed));

const candidate = new URL('../../references/clean/anchor_infographic_map.png', import.meta.url);
const bytes = await readFile(candidate);
const attachment = { filename: 'CANDIDATE__sample_map.png', role: 'candidate', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
await copyFile(candidate, new URL(attachment.filename, import.meta.url));
await copyFile(candidate, new URL('PREVIOUS_FRAME__sample_map.png', import.meta.url));
const visual = 'A simplified hand-drawn educational map on a white background. Show France in blue, Germany in yellow, Poland in orange, Czechia in pink, and Austria in green, with thick black outlines and legible uppercase country labels. Place exactly one red location pin and one small cave icon in southern Germany near Austria. A tiny cartoon narrator may stand in the bottom-right corner. Preserve the intentional cartoon map style; exact cartographic boundary precision is not required.';
const job = { id: randomUUID(), kind: 'review', frameId: 'sample_map_001', frameIndex: 0, attempt: 1, reviewScope: REVIEW_SCOPE, contextId: context.id,
  filename: 'sample_map_001.png', originalPrompt: visual, currentPrompt: visual, narration: 'A cave in southern Germany lies close to Austria.', settings,
  candidateHash: createHash('sha256').update(bytes).digest('hex'), attachments: [attachment], previousFrame: null };
await writeFile(new URL('pass-job.json', import.meta.url), JSON.stringify(job, null, 2));
await writeFile(new URL('pass-prompt.txt', import.meta.url), prompt(job));
const mismatch = visual.replace('exactly one red location pin', 'exactly three separate red location pins');
const negative = { ...job, id: randomUUID(), frameId: 'sample_map_002', frameIndex: 1, filename: 'sample_map_002.png', originalPrompt: mismatch, currentPrompt: mismatch,
  narration: 'Three red pins mark three separate locations in southern Germany, close to Austria.',
  previousFrame: { frameId: job.frameId, filename: job.filename },
  attachments: [attachment, { ...attachment, role: 'previous-frame', filename: 'PREVIOUS_FRAME__sample_map.png' }] };
await writeFile(new URL('fail-job.json', import.meta.url), JSON.stringify(negative, null, 2));
await writeFile(new URL('fail-prompt.txt', import.meta.url), prompt(negative));
console.log(JSON.stringify({ contextId: context.id, passId: job.id, failId: negative.id, sheets: sheets.length }));
