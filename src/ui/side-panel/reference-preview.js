(function () {
  const previews = new Map();
  const pending = new Map();
  const unavailable = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="80" viewBox="0 0 90 80"><rect width="90" height="80" rx="7" fill="#222632"/><rect x="23" y="20" width="44" height="35" rx="3" fill="none" stroke="#7d879a" stroke-width="3"/><circle cx="36" cy="32" r="4" fill="#7d879a"/><path d="m26 51 12-12 9 8 7-7 10 11" fill="none" stroke="#7d879a" stroke-width="3"/></svg>')}`;

  function allowed(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
        (['flow.google.com', 'labs.google', 'flow-content.google'].includes(parsed.hostname) ||
          /(^|\.)(googleusercontent\.com|googleapis\.com)$/.test(parsed.hostname));
    } catch { return false; }
  }

  async function load(url) {
    if (previews.has(url)) return previews.get(url);
    if (pending.has(url)) return pending.get(url);
    const task = (async () => {
      let response;
      try { response = await fetch(url, { credentials: 'include', cache: 'force-cache', signal: AbortSignal.timeout(12000) }); }
      catch { response = await fetch(url, { credentials: 'omit', cache: 'force-cache', signal: AbortSignal.timeout(12000) }); }
      if (!response.ok && [401, 403].includes(response.status)) {
        response = await fetch(url, { credentials: 'omit', cache: 'force-cache', signal: AbortSignal.timeout(12000) });
      }
      if (!response.ok) throw new Error(`Image preview returned HTTP ${response.status}.`);
      const length = Number(response.headers.get('content-length'));
      if (length > 5 * 1024 * 1024) throw new Error('Image preview is too large.');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/') || !blob.size || blob.size > 5 * 1024 * 1024) {
        throw new Error('The preview address did not return a supported image.');
      }
      const local = URL.createObjectURL(blob);
      previews.set(url, local);
      return local;
    })();
    pending.set(url, task);
    try { return await task; }
    finally { pending.delete(url); }
  }

  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('.reference-thumb, .reference-full-preview')) return;
    if (image.dataset.previewRetried) return;
    image.dataset.previewRetried = 'true';
    const original = image.getAttribute('src');
    if (!allowed(original)) {
      image.alt = 'Preview unavailable';
      image.src = unavailable;
      return;
    }
    const originalAlt = image.alt;
    image.alt = 'Loading Flow preview';
    image.src = unavailable;
    load(original).then(local => {
      if (!image.isConnected) return;
      image.alt = originalAlt;
      image.src = local;
    }).catch(() => {
      if (!image.isConnected) return;
      image.alt = 'Preview unavailable';
      image.title = 'The Flow image preview could not be loaded. Refresh references from Flow to update its address.';
      image.src = unavailable;
    });
  }, true);

  window.addEventListener('pagehide', () => previews.forEach(local => URL.revokeObjectURL(local)));
  window.PipelineReferencePreview = { source: url => previews.get(url) || url };
})();
