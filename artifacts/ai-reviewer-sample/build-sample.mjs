import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { prompt, REVIEW_SCOPE } from '../../src/modules/ai-reviewer/contract.js';

const image = new URL('../../references/clean/anchor_infographic_map.png', import.meta.url);
const imageBytes = await readFile(image);
const settings = JSON.parse(await readFile(new URL('../../src/modules/ai-reviewer/defaults/settings.json', import.meta.url), 'utf8'));
settings.validator = await readFile(new URL('../../src/modules/ai-reviewer/defaults/validator.md', import.meta.url), 'utf8');
const visualPrompt = 'A simplified hand-drawn educational map on a white background. Show France in blue, Germany in yellow, Poland in orange, Czechia in pink, and Austria in green, with thick black outlines and legible uppercase country labels. Place one red location pin and a small cave icon in southern Germany near Austria. A tiny cartoon narrator may stand in the bottom-right corner. Preserve the intentional cartoon map style; exact cartographic boundary precision is not required.';
const job = { id: randomUUID(), frameId: 'sample_map_001', frameIndex: 0, attempt: 1, reviewScope: REVIEW_SCOPE,
  filename: 'sample_map_001.png', originalPrompt: visualPrompt, currentPrompt: visualPrompt,
  narration: 'A cave in southern Germany lies close to the Austrian border.', settings,
  candidateHash: createHash('sha256').update(imageBytes).digest('hex'),
  attachments: [{ filename: 'clipboard.png', name: 'sample_map_001.png', role: 'candidate', width: imageBytes.readUInt32BE(16), height: imageBytes.readUInt32BE(20) }], previousIssues: [] };
await writeFile(new URL('job.json', import.meta.url), JSON.stringify(job, null, 2));
await writeFile(new URL('prompt.txt', import.meta.url), prompt(job));
console.log(JSON.stringify({reviewId:job.id, candidateHash:job.candidateHash, image:image.pathname}));
