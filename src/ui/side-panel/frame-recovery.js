(function () {
  let options = {}, dialog;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const needsRecovery = frame => !frame.result_url && ['accepted', 'unknown'].includes(frame.flow_submission?.state);
  function renderAction(frame, index) {
    return `<button type="button" class="btn-dark-pill btn-recover-frame" id="frame-recover-${index}" data-index="${index}" ${options.isRunning?.() ? 'disabled' : ''} style="display:${needsRecovery(frame) ? 'inline-flex' : 'none'}">Choose existing image</button>`;
  }
  function updateFrame(frame, index) {
    const button = document.getElementById(`frame-recover-${index}`);
    if (button) { button.style.display = needsRecovery(frame) ? 'inline-flex' : 'none'; button.disabled = !!options.isRunning?.(); }
  }
  async function open(index) {
    if (options.isRunning?.()) throw new Error('Pause the pipeline before reconnecting an image.');
    const owner = options.getSpec(), frame = owner?.visuals[index], destination = owner?.collection_url;
    if (!frame || !needsRecovery(frame)) return;
    dialog?.close(); dialog?.remove();
    const view = document.createElement('dialog'); dialog = view;
    view.className = 'reference-editor-dialog frame-recovery-dialog';
    view.innerHTML = `<div class="reference-dialog-header"><h2>Reconnect Frame #${frame.frame_number || index + 1}</h2><button type="button" class="reference-close" aria-label="Close">✕</button></div><p class="reference-hint">Choose the image Flow already generated for ${escape(frame.target_filename)}. Your selection maps it to this frame without submitting another prompt.</p><p>${escape(frame.verbatim_script || '')}</p><label>Find image<input type="search" data-search placeholder="Search Flow titles"/></label><p class="reference-editor-status" role="status">Reading images from the Flow collection…</p><div class="frame-recovery-grid"></div>`;
    document.body.appendChild(view); view.showModal();
    view.querySelector('.reference-close').onclick = () => { view.close(); view.remove(); };
    const status = (message, error = false) => { const target = view.querySelector('[role=status]'); target.textContent = message; target.classList.toggle('error', error); };
    try {
      const response = await options.scan();
      if (options.getSpec() !== owner || owner.collection_url !== destination || !view.isConnected) return;
      if (response?.success === false || response?.error || !Array.isArray(response?.tiles)) throw new Error(response?.error || 'Could not read the Flow collection.');
      const images = response.tiles.filter(tile => tile.imgSrc && !owner.visuals.some(other => other !== frame &&
        (other.result_url === tile.imgSrc || tile.tileId && other.flow_submission?.tileId === tile.tileId)));
      const grid = view.querySelector('.frame-recovery-grid');
      grid.innerHTML = images.map((tile, tileIndex) => `<button type="button" class="frame-recovery-image" data-tile="${tileIndex}"><img src="${escape(tile.imgSrc)}" alt="${escape(tile.title)}" loading="lazy"/><span>${escape(tile.title || 'Untitled image')}</span></button>`).join('');
      status(images.length ? 'Select the correct image by its preview. Images assigned to other frames are excluded.' : 'No unassigned completed images are visible. Scroll to the generated image in Flow, close this window, and reopen it.');
      view.querySelector('[data-search]').oninput = event => {
        const query = event.target.value.trim().toLowerCase();
        grid.querySelectorAll('[data-tile]').forEach(button => { button.hidden = !String(images[Number(button.dataset.tile)].title || '').toLowerCase().includes(query); });
      };
      grid.onclick = event => {
        const button = event.target.closest('[data-tile]'); if (!button || button.disabled) return;
        try {
          if (options.isRunning?.() || options.getSpec() !== owner || owner.visuals[index] !== frame || owner.collection_url !== destination || !needsRecovery(frame)) throw new Error('The pipeline or frame changed. Pause and reopen this image picker.');
          options.apply(index, images[Number(button.dataset.tile)], response.flowUrl);
          view.close(); view.remove();
        } catch (error) { status(error.message, true); }
      };
    } catch (error) { status(error.message, true); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.btn-recover-frame');
    if (button && !button.disabled) void open(Number(button.dataset.index)).catch(error => options.log?.(error.message));
  });
  globalThis.PipelineRecovery = { configure(value) { options = value; }, renderAction, updateFrame };
})();
