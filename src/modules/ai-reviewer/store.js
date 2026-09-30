let connection;
export function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('flow-ai-reviewer-v1', 1);
    request.onupgradeneeded = () => { for (const name of ['jobs', 'assets', 'context']) request.result.createObjectStore(name, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
export async function get(store, id) { const db = await database(); return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function all(store) { const db = await database(); return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function put(store, value) { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Reviewer storage transaction aborted.')); }); }
export async function hash(blob) { const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''); }
export async function cacheImage(blob, metadata = {}) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type) || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Reviewer images must be PNG, JPEG, WebP, or GIF and at most 20 MB.');
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width, height = bitmap.height; bitmap.close();
  const id = await hash(blob);
  await put('assets', { id, blob, width, height, ...metadata });
  return { assetId: id, width, height, mime: blob.type };
}
export async function wireAsset(assetId, filename) {
  const value = await get('assets', assetId);
  if (!value) throw new Error(`Cached image is missing: ${filename}`);
  const bytes = new Uint8Array(await value.blob.arrayBuffer());
  let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { filename, mime: value.blob.type, base64: btoa(binary) };
}
