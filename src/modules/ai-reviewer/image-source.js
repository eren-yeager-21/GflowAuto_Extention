import { cacheImage, get } from './store.js';

export function imageSource(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('This frame has no generated image source. Sync the frame or choose its generated image file.');
  let url; try { url = new URL(value); } catch { throw new Error('The saved generated image address is invalid. Choose its generated image file.'); }
  if (url.username || url.password) throw new Error('Image addresses containing embedded credentials are unsupported.');
  if (url.protocol === 'https:' || url.protocol === 'blob:') return url.href;
  if (url.protocol === 'data:' && /^data:image\/(?:png|jpeg|webp|gif)[;,]/i.test(value)) {
    if (value.length > 28 * 1024 * 1024) throw new Error('The embedded generated image is too large. Choose an image file under 20 MB.');
    return value;
  }
  throw new Error(`Unsupported image source (${url.protocol}). Choose the generated PNG, JPEG, WebP, or GIF file.`);
}
export function sourceInfo(value) {
  try { const url = new URL(value); return { scheme: url.protocol.replace(':', ''), host: url.hostname || (url.protocol === 'blob:' ? new URL(url.pathname).hostname : null) }; }
  catch { return { scheme: 'unknown', host: null }; }
}
function workerAccessible(value) {
  const url = new URL(value);
  return url.protocol === 'data:' || (url.protocol === 'https:' && (['flow.google.com', 'labs.google', 'flow-content.google'].includes(url.hostname) || /(^|\.)(googleusercontent\.com|googleapis\.com)$/.test(url.hostname)));
}
async function cacheBytes(blob) {
  if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Generated image must be nonempty and at most 20 MB.');
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const signature = String.fromCharCode(...header);
  const mime = header[0] === 137 && signature.slice(1, 4) === 'PNG' ? 'image/png'
    : header[0] === 255 && header[1] === 216 && header[2] === 255 ? 'image/jpeg'
    : signature.startsWith('GIF87a') || signature.startsWith('GIF89a') ? 'image/gif'
    : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime) throw new Error('The image response is not PNG, JPEG, WebP, or GIF. It may be an expired link or a sign-in page.');
  return cacheImage(blob.type === mime ? blob : new Blob([blob], { type: mime }));
}
async function fetchDirect(source) {
  const parsed = new URL(source);
  const original = /(^|\.)googleusercontent\.com$/.test(parsed.hostname) ? source.replace(/=(?:s|w|h)\d+[^?]*(?=\?|$)/, '=s0') : source;
  let response;
  try { response = await fetch(original, { credentials: 'include', signal: AbortSignal.timeout(25000) }); }
  catch (error) { if (original === source) throw error; }
  if ((!response?.ok) && original !== source) response = await fetch(source, { credentials: 'include', signal: AbortSignal.timeout(25000) });
  if (!response?.ok) throw new Error(`Image download returned HTTP ${response?.status || 'unknown'}.`);
  if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('Generated image exceeds 20 MB.');
  return cacheBytes(await response.blob());
}

// Executed as a packaged function in Flow's isolated world. Blob URLs belong
// to the page that created them, and some image URLs require that page's session.
// Only an exact image source or saved media identity already present in Flow is read.
export async function captureCandidateInFlow(source, savedTileId) {
  try {
    if (!['flow.google.com', 'labs.google'].includes(location.hostname)) throw new Error('The source tab is not Flow.');
    const loaded = img => img.complete && img.naturalWidth && img.naturalHeight;
    const images = Array.from(document.querySelectorAll('img'));
    let image = images.find(img => [img.currentSrc, img.src].includes(source) && loaded(img));
    if (!image) {
      const address = new URL(source);
      const editId = ['flow.google.com', 'labs.google'].includes(address.hostname) ? address.pathname.match(/\/edit\/([^/]+)\/?$/)?.[1] : null;
      const identities = new Set([editId, savedTileId].filter(value => typeof value === 'string' && value.length <= 200));
      const candidates = new Set();
      for (const node of document.querySelectorAll('[data-media-id], [data-tile-id]')) {
        if (![node.getAttribute('data-media-id'), node.getAttribute('data-tile-id')].some(id => identities.has(id))) continue;
        for (const img of node.tagName === 'IMG' ? [node] : node.querySelectorAll('img')) if (loaded(img)) candidates.add(img);
      }
      for (const anchor of document.querySelectorAll('a[href]')) {
        let id; try { id = new URL(anchor.href).pathname.match(/\/edit\/([^/]+)\/?$/)?.[1]; } catch { continue; }
        if (!identities.has(id)) continue;
        const tile = anchor.closest('flow-grid-tile-container, flow-image-tile');
        for (const img of (tile || anchor).querySelectorAll('img')) if (loaded(img)) candidates.add(img);
      }
      const unique = new Map(Array.from(candidates, img => [img.currentSrc || img.src, img]));
      if (unique.size > 1) throw new Error('Several images share the saved Flow identity. Choose this frame\'s generated image file.');
      image = unique.values().next().value;
    }
    if (!image) throw new Error('The saved image is not currently loaded in Flow. Scroll to that frame in Flow or choose its generated image file.');
    if (image.naturalWidth * image.naturalHeight > 80000000) throw new Error('Generated image is too large to capture.');
    let blob, networkError;
    try {
      const response = await fetch(image.currentSrc || image.src, { credentials: 'include', signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('Image exceeds 20 MB.');
      blob = await response.blob();
      if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new Error('The image address returned a page instead of image bytes.');
    } catch (error) { blob = null; networkError = error.message; }
    if (!blob) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      try {
        canvas.getContext('2d').drawImage(image, 0, 0);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      } catch { throw new Error(`Flow could not expose image bytes (${networkError || 'protected image'}). Choose its generated image file.`); }
    }
    if (!blob || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Captured image must be nonempty and at most 20 MB.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return { success: true, base64: btoa(binary), mime: blob.type };
  } catch (error) { return { success: false, error: error.message }; }
}
async function flowTab(job) {
  const expected = job.flowUrl || job.submission?.flowUrl || job.mediaUrl;
  const project = value => { try { return new URL(value).pathname.match(/\/project\/([^/]+)/)?.[1] || null; } catch { return null; } };
  const expectedProject = project(expected);
  const matches = tab => tab?.url?.startsWith('https://flow.google.com/project/') && (!expectedProject || project(tab.url) === expectedProject);
  if (Number.isInteger(job.flowTabId)) {
    const tab = await chrome.tabs.get(job.flowTabId).catch(() => null);
    if (matches(tab)) return tab;
  }
  const tabs = (await chrome.tabs.query({ url: 'https://flow.google.com/*' })).filter(matches);
  if (tabs.length === 1) return tabs[0];
  throw new Error(tabs.length ? 'Several Flow tabs match. Select the source collection in the pipeline.' : 'Open the source Flow project or choose the generated image file.');
}
export async function obtainCandidate(job) {
  if (job.candidateAssetId) {
    const value = await get('assets', job.candidateAssetId);
    if (!value) throw new Error('The selected generated image file is no longer cached. Choose the file again.');
    return { assetId: value.id, width: value.width, height: value.height, mime: value.blob.type };
  }
  const source = imageSource(job.mediaUrl);
  const sourceUrl = new URL(source);
  const editorPage = ['flow.google.com', 'labs.google'].includes(sourceUrl.hostname) && /\/project\/[^/]+\/edit\//.test(sourceUrl.pathname);
  let directError;
  if (workerAccessible(source) && !editorPage) {
    try { return await fetchDirect(source); } catch (error) { directError = error.message; }
  }
  try {
    const tab = await flowTab(job);
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureCandidateInFlow, args: [source, job.submission?.tileId] });
    const value = results[0]?.result;
    if (!value?.success) throw new Error(value?.error || 'Flow returned no image bytes.');
    const bytes = Uint8Array.from(atob(value.base64), character => character.charCodeAt(0));
    return cacheBytes(new Blob([bytes], { type: value.mime }));
  } catch (error) {
    const info = sourceInfo(source);
    throw new Error(`Could not read the generated image (${info.scheme}${info.host ? `, ${info.host}` : ''}). ${error.message}${directError ? ` Download: ${directError}` : ''}`);
  }
}
