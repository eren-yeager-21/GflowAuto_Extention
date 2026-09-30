(function () {
  let options = {};
  let catalog = [];
  let catalogOwner;
  let catalogDestination;
  let dialog;
  let refreshing = false;
  const clean = value => String(value || '').replace(/^@/, '').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = value => (Array.isArray(value) ? value : value ? [value] : []).map(value => clean(value && typeof value === 'object' ? value.name || value.tag || value.id : value)).filter(Boolean);
  const imageUrl = value => /^https:\/\//i.test(String(value || '')) ? String(value) : '';
  const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  const spec = () => options.getSpec?.();
  const library = () => spec()?.reference_library || [];

  function normalizeLibrary(value) {
    return (Array.isArray(value) ? value : []).filter(entry => entry && clean(entry.name)).map(entry => ({
      id: entry.id ? String(entry.id) : crypto.randomUUID(), name: clean(entry.name),
      kind: 'image',
      preview_url: imageUrl(entry.preview_url), tile_id: entry.tile_id ? String(entry.tile_id) : null,
      unique_title_verified: entry.unique_title_verified === true,
      flow_url: entry.flow_url || null
    }));
  }

  function ensureReference(entry) {
    const found = library().find(ref => ref.kind === entry.kind && sameName(ref.name, entry.name) &&
      (!entry.tile_id || ref.tile_id === entry.tile_id));
    if (found) return found;
    const added = normalizeLibrary([{ ...entry, id: crypto.randomUUID() }])[0];
    library().push(added);
    return added;
  }

  function legacyEntries(frame) {
    const chars = options.resolveCharacterLabels?.(list(frame.character_references)) || list(frame.character_references);
    const seen = new Set();
    return [
      ...list(frame.reference_image).map(name => ({ name, kind: 'image', role: 'style' })),
      ...chars.map(name => ({ name, kind: 'image', role: 'character' })),
      ...list(frame.style_references).map(name => ({ name, kind: 'image', role: 'style' })),
      ...list(frame.image_references).map(name => ({ name, kind: 'image', role: 'image' }))
    ].filter(entry => {
      const key = `${entry.kind}:${entry.role}:${clean(entry.name).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(entry => {
      const matches = library().filter(ref => ref.kind === entry.kind && sameName(ref.name, entry.name));
      return { ...entry, ...(matches.length === 1 ? matches[0] : {}) };
    });
  }

  function entries(frame) {
    if (!Array.isArray(frame.reference_assignments)) return legacyEntries(frame);
    return frame.reference_assignments.map(assignment => {
      const ref = library().find(ref => ref.id === assignment.reference_id);
      return ref ? { ...ref, role: assignment.role || 'image' } : {
        id: assignment.reference_id, name: 'Missing reference', kind: 'image', role: assignment.role || 'image', missing: true
      };
    });
  }

  function initialize() {
    if (!spec()) return;
    if (catalogOwner !== spec() || catalogDestination !== spec().collection_url) {
      catalog = [];
      catalogOwner = spec();
      catalogDestination = spec().collection_url;
    }
    if (!Array.isArray(spec().reference_library)) spec().reference_library = [];
    spec().reference_library = normalizeLibrary(spec().reference_library);
    (spec().characters || []).forEach(char => {
      const name = (options.resolveCharacterLabels?.([char.flow_tag || char.name || char.id]) || [clean(char.name)])[0];
      if (!name) return;
      // A saved project may still label this seed as a Flow character. Reuse
      // its ID so existing frame assignments keep pointing to the image.
      const existing = library().find(ref => sameName(ref.name, name));
      if (existing) {
        existing.kind = 'image';
        existing.preview_url = imageUrl(char.image_url || existing.preview_url);
      } else ensureReference({ name, kind: 'image', preview_url: char.image_url || char.preview_url });
    });
    (spec().characters || []).forEach(character => legacyEntries(character).forEach(ensureReference));
    spec().visuals.forEach(frame => legacyEntries(frame).forEach(ensureReference));
  }

  function thumbnail(entry, large = false) {
    const url = imageUrl(entry.preview_url);
    const displayUrl = window.PipelineReferencePreview?.source(url) || url;
    return url ? `<button type="button" class="reference-preview-button" data-preview-url="${escape(url)}" data-preview-name="${escape(entry.name)}" title="Preview reference"><img class="reference-thumb ${large ? 'large' : ''}" src="${escape(displayUrl)}" alt="${escape(entry.name)}" loading="lazy" /></button>`
      : `<span class="reference-thumb reference-placeholder ${large ? 'large' : ''}" aria-label="Preview unavailable">▧</span>`;
  }

  function frameReferenceState(frame, index) {
    const refs = entries(frame);
    const previous = options.resolvePreviousFrame?.(frame, index);
    const signature = JSON.stringify([refs, previous?.result_url, previous?.target_filename, !!options.isRunning?.()]);
    return { refs, previous, signature };
  }

  function renderFrame(frame, index, state = frameReferenceState(frame, index)) {
    const { refs, previous, signature } = state;
    return `<section class="frame-references" id="frame-references-${index}" data-reference-signature="${escape(signature)}">
      <div class="reference-heading"><strong>References <span>${refs.length + (previous ? 1 : 0)}</span></strong>
        <button type="button" class="btn-dark-pill btn-edit-references" data-index="${index}" ${options.isRunning?.() ? 'disabled' : ''}>Edit references</button></div>
      <div class="reference-chip-list">${refs.map(entry => `<div class="reference-chip ${entry.missing ? 'missing' : ''}">${thumbnail(entry)}
        <span><strong>${escape(entry.name)}</strong><small>${escape(entry.role)} · Flow image</small></span></div>`).join('')}
        ${previous ? `<div class="reference-chip">${thumbnail({ name: previous.target_filename, preview_url: previous.result_url })}<span><strong>Frame #${previous.frame_number}</strong><small>Previous frame · ${escape(previous.target_filename)}</small></span></div>` : ''}
      </div>${!refs.length && !previous ? '<p class="reference-hint">No references attached.</p>' : ''}</section>`;
  }

  function updateFrame(frame, index) {
    const node = document.getElementById(`frame-references-${index}`);
    if (!node) return;
    const state = frameReferenceState(frame, index);
    if (node.dataset.referenceSignature === state.signature) return;
    const temporary = document.createElement('div');
    temporary.innerHTML = renderFrame(frame, index, state);
    node.replaceWith(temporary.firstElementChild);
  }

  function renderCharacter(character, index) {
    const refs = entries(character);
    return `<section class="frame-references character-references" id="character-references-${index}">
      <div class="reference-heading"><strong>References <span>${refs.length}</span></strong>
        <button type="button" class="btn-dark-pill btn-edit-character-references" data-index="${index}" ${options.isRunning?.() ? 'disabled' : ''}>Edit references</button></div>
      <div class="reference-chip-list">${refs.map(entry => `<div class="reference-chip ${entry.missing ? 'missing' : ''}">${thumbnail(entry)}
        <span><strong>@${escape(entry.name)}</strong><small>${escape(entry.role)} · Flow image</small></span></div>`).join('')}
      </div>${!refs.length ? '<p class="reference-hint">No references attached to this character image.</p>' : ''}</section>`;
  }

  function renderLibrarySummary() {
    return `<div class="reference-library-summary">${library().slice(0, 12).map(entry => `<div class="reference-chip">${thumbnail(entry)}<span><strong>${escape(entry.name)}</strong><small>Flow ${entry.kind}</small></span></div>`).join('')}
      ${!library().length ? '<p class="reference-hint">Add existing Flow images to your reference library.</p>' : ''}
      ${library().length > 12 ? `<p class="reference-hint">${library().length} references available. Open Manage references to see all.</p>` : ''}</div>`;
  }

  function close() {
    dialog?.remove();
    dialog = null;
  }

  function openDialog(title, body) {
    close();
    dialog = document.createElement('dialog');
    dialog.className = 'reference-editor-dialog';
    dialog.innerHTML = `<div class="reference-dialog-header"><h2>${escape(title)}</h2><button type="button" class="reference-close" aria-label="Close reference editor">✕</button></div>${body}`;
    document.body.appendChild(dialog);
    dialog.querySelector('.reference-close').addEventListener('click', close);
    dialog.addEventListener('cancel', close);
    dialog.showModal();
    return dialog;
  }

  function setStatus(message, error = false) {
    const target = dialog?.querySelector('.reference-editor-status');
    if (target) { target.textContent = message; target.classList.toggle('error', error); }
  }

  async function refreshCatalog() {
    if (options.isRunning?.()) throw new Error('Pause the pipeline before browsing Flow references.');
    if (refreshing) throw new Error('A Flow reference refresh is already in progress.');
    refreshing = true;
    options.onBusyChange?.();
    const owner = spec();
    const destination = owner?.collection_url;
    try {
      const images = await options.scanImages();
      if (spec() !== owner || owner.collection_url !== destination) throw new Error('The loaded project changed. Refresh references for the current project.');
      if (images?.error || images?.success === false) throw new Error(images.error || 'Could not read Flow images.');
      catalog = (images.tiles || []).filter(tile => tile.imgSrc && tile.title).map(tile => ({
        name: clean(tile.title), kind: 'image', tile_id: tile.tileId || null,
        preview_url: imageUrl(tile.imgSrc), flow_url: images.flowUrl || null
      })).filter(entry => entry.name);
      if (images.completeScan === true) {
        const counts = new Map();
        catalog.forEach(entry => counts.set(entry.name.toLowerCase(), (counts.get(entry.name.toLowerCase()) || 0) + 1));
        catalog.forEach(entry => { entry.unique_title_verified = counts.get(entry.name.toLowerCase()) === 1; });
      }
      library().forEach(ref => {
        const matches = catalog.filter(item => sameName(item.name, ref.name));
        if (matches.length === 1) Object.assign(ref, matches[0]);
      });
      options.onChange?.();
      return catalog.length;
    } finally { refreshing = false; options.onBusyChange?.(); }
  }

  function saveFrameLists(frame) {
    const refs = entries(frame);
    frame.character_references = refs.filter(ref => ref.role === 'character').map(ref => ref.name);
    frame.style_references = refs.filter(ref => ref.role === 'style').map(ref => ref.name);
    frame.image_references = refs.filter(ref => ref.role === 'image').map(ref => ref.name);
  }

  function openLibrary(editId = null, returnFrame = null, returnCharacter = null) {
    if (!spec() || options.isRunning?.()) return;
    initialize();
    const edited = library().find(entry => entry.id === editId);
    const host = openDialog('Manage references', `
      <p class="reference-hint">Use images already in this Flow project. Editing a library reference updates its assigned frames for future generations.</p>
      <div class="reference-dialog-actions"><button type="button" class="btn-dark-pill" id="reference-refresh">Refresh from Flow</button>${returnFrame !== null || returnCharacter !== null ? `<button type="button" class="btn-dark-pill" id="reference-back">Back to ${returnFrame !== null ? 'frame' : 'character'}</button>` : ''}</div>
      <form id="reference-library-form">
        <label>Choose an existing Flow reference<select id="reference-catalog"><option value="">Enter its exact Flow name below</option>${catalog.map((entry, index) => `<option value="${index}">${escape(entry.name)} · ${entry.kind}${entry.tile_id ? ` · ${escape(entry.tile_id.slice(0, 8))}` : ''}</option>`).join('')}</select></label>
        <div class="reference-form-row"><label>Flow name<input id="reference-name" required value="${escape(edited?.name || '')}" placeholder="Exact image title" /></label>
          <label>Source<input value="Flow image" disabled /></label></div>
        <div id="reference-source-preview">${edited ? thumbnail(edited, true) : ''}</div>
        <button type="submit" class="btn-dark-pill">${edited ? 'Save reference' : 'Add reference'}</button>${edited ? '<button type="button" class="btn-dark-pill" id="reference-new">Add another reference</button>' : ''}
      </form><p class="reference-editor-status" role="status"></p>
      <div class="reference-library-list">${library().map(entry => `<article class="reference-library-card">${thumbnail(entry, true)}<div><strong>${escape(entry.name)}</strong><p>Flow ${entry.kind}</p></div><button type="button" class="btn-dark-pill reference-edit-library" data-id="${escape(entry.id)}">Edit</button></article>`).join('')}</div>`);
    let selected = edited;
    host.querySelector('#reference-catalog').addEventListener('change', event => {
      selected = event.target.value !== '' ? catalog[Number(event.target.value)] : null;
      if (selected) {
        host.querySelector('#reference-name').value = selected.name;
      }
      host.querySelector('#reference-source-preview').innerHTML = selected ? thumbnail(selected, true) : '';
    });
    host.querySelector('#reference-refresh').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      setStatus('Reading references from the selected Flow project…');
      try {
        const count = await refreshCatalog();
        if (dialog === host) { openLibrary(editId, returnFrame, returnCharacter); setStatus(`${count} Flow images found in the current collection.`); }
      } catch (error) { if (dialog === host) setStatus(error.message, true); }
      finally { if (dialog === host) host.querySelector('#reference-refresh').disabled = false; }
    });
    host.querySelector('#reference-back')?.addEventListener('click', () => returnFrame !== null ? openFrame(returnFrame) : openCharacter(returnCharacter));
    host.querySelector('#reference-new')?.addEventListener('click', () => openLibrary(null, returnFrame, returnCharacter));
    host.querySelectorAll('.reference-edit-library').forEach(button => button.addEventListener('click', () => openLibrary(button.dataset.id, returnFrame, returnCharacter)));
    host.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (options.isRunning?.() || refreshing) return;
      try {
        const name = clean(host.querySelector('#reference-name').value);
        const kind = 'image';
        if (!name) throw new Error('Enter an existing Flow reference name.');
        let source = selected && selected.kind === kind && sameName(selected.name, name) ? selected : null;
        if (!source) {
          const matches = catalog.filter(entry => entry.kind === kind && sameName(entry.name, name));
          if (matches.length > 1) throw new Error('Several Flow images share this name. Select the intended image from the list.');
          source = matches[0] || { name, kind };
        }
        if (edited) {
          const previousName = edited.name;
          const affected = [...spec().visuals, ...(spec().characters || [])].filter(item => entries(item).some(entry => entry.id === edited.id));
          affected.forEach(frame => {
            if (!Array.isArray(frame.reference_assignments)) frame.reference_assignments = entries(frame).map(entry => ({ reference_id: entry.id, role: entry.role }));
            if (frame.reference_statement && name !== previousName) {
              const escapedName = previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              frame.reference_statement = frame.reference_statement.replace(new RegExp(`@${escapedName}(?=$|[\\s,.;:!?\\)\\]])`, 'g'), () => `@${name}`);
            }
          });
          Object.assign(edited, { name, kind, tile_id: source.tile_id || null, preview_url: imageUrl(source.preview_url),
            unique_title_verified: source.unique_title_verified === true && sameName(source.name, name),
            flow_url: source.flow_url || null });
        }
        else ensureReference({ ...source, name, kind });
        [...spec().visuals, ...(spec().characters || [])].filter(item => Array.isArray(item.reference_assignments)).forEach(saveFrameLists);
        options.onChange?.();
        openLibrary(null, returnFrame, returnCharacter);
        setStatus('Reference saved. Attach it to a frame using Edit references.');
      } catch (error) { setStatus(error.message, true); }
    });
  }

  function openFrame(index) {
    const frame = spec()?.visuals[index];
    if (!frame || options.isRunning?.()) return;
    initialize();
    const draft = entries(frame).map(entry => ({ ...entry }));
    const previous = options.resolvePreviousFrame?.(frame, index);
    const earlier = spec().visuals.slice(0, index);
    const guidance = frame.reference_statement || (Array.isArray(frame.reference_instructions) ? frame.reference_instructions.join('\n') : '');
    const host = openDialog(`References · Frame #${frame.frame_number}`, `
      <p class="reference-hint">Choose the references to include when generating this frame.</p>
      ${frame.status === 'completed' || frame.flow_submission ? '<p class="reference-note">This frame already has a result or submission. Edits apply to a future Re-roll; Resume keeps the existing submission.</p>' : ''}
      <form id="frame-reference-form"><div id="frame-reference-rows"></div>
        <div class="reference-dialog-actions"><button type="button" class="btn-dark-pill" id="frame-reference-add">+ Add reference</button><button type="button" class="btn-dark-pill" id="frame-reference-library">Manage reference library</button></div>
        <label>Previous-frame reference<select id="frame-reference-previous"><option value="">None · independent generation</option>${earlier.map(visual => `<option value="${escape(visual.target_filename)}" ${visual === previous ? 'selected' : ''}>Frame #${visual.frame_number} · ${escape(visual.target_filename)}</option>`).join('')}</select></label>
        <p class="reference-hint">A previous-frame reference makes this frame wait for that earlier image.</p>
        <label>Reference guidance (optional)<textarea id="frame-reference-guidance" rows="5" placeholder="Describe what each reference should influence. Leave empty for automatic guidance.">${escape(guidance)}</textarea></label>
        <p class="reference-editor-status" role="status"></p><div class="reference-dialog-actions"><button type="submit" class="btn-dark-pill">Save references</button><button type="button" class="btn-dark-pill" id="frame-reference-cancel">Cancel</button></div>
      </form>`);
    const renderRows = () => {
      const container = host.querySelector('#frame-reference-rows');
      container.innerHTML = draft.map((entry, row) => `<div class="reference-assignment-row">${thumbnail(entry)}<div>
        <label>Reference<select data-row="${row}" class="reference-assignment-source"><option value="">Select a reference</option>${library().map(ref => `<option value="${escape(ref.id)}" ${ref.id === entry.id ? 'selected' : ''}>${escape(ref.name)} · ${ref.kind}${ref.tile_id ? ` · ${escape(ref.tile_id.slice(0, 8))}` : ''}</option>`).join('')}</select></label>
        <label>Use for<select data-row="${row}" class="reference-assignment-role">${['character', 'style', 'image'].map(role => `<option value="${role}" ${entry.role === role ? 'selected' : ''}>${role === 'image' ? 'Scene / object' : role === 'style' ? 'Visual style' : 'Character'}</option>`).join('')}</select></label></div>
        <button type="button" class="btn-dark-pill reference-remove-assignment" data-row="${row}" aria-label="Remove reference">✕</button></div>`).join('') || '<p class="reference-hint">No image or character references attached.</p>';
      container.querySelectorAll('.reference-assignment-source').forEach(select => select.addEventListener('change', () => {
        const row = Number(select.dataset.row), ref = library().find(ref => ref.id === select.value);
        draft[row] = { ...(ref || { name: '', kind: 'image' }), role: draft[row].role };
        renderRows();
      }));
      container.querySelectorAll('.reference-assignment-role').forEach(select => select.addEventListener('change', () => { draft[Number(select.dataset.row)].role = select.value; }));
      container.querySelectorAll('.reference-remove-assignment').forEach(button => button.addEventListener('click', () => { draft.splice(Number(button.dataset.row), 1); renderRows(); }));
    };
    renderRows();
    host.querySelector('#frame-reference-add').addEventListener('click', () => { draft.push({ name: '', kind: 'image', role: 'image' }); renderRows(); });
    host.querySelector('#frame-reference-library').addEventListener('click', () => {
      if (draft.length !== entries(frame).length || JSON.stringify(draft) !== JSON.stringify(entries(frame))) {
        setStatus('Save or cancel your frame edits before opening the library.', true);
        return;
      }
      openLibrary(null, index);
    });
    host.querySelector('#frame-reference-cancel').addEventListener('click', close);
    host.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (options.isRunning?.() || refreshing) return;
      try {
        if (draft.some(entry => !entry.id || entry.missing || !library().some(ref => ref.id === entry.id))) throw new Error('Choose a reference for every row, or remove the empty row.');
        const seen = new Set();
        frame.reference_assignments = draft.filter(entry => {
          const key = `${entry.id}:${entry.role}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }).map(entry => ({ reference_id: entry.id, role: entry.role }));
        frame.frame_reference = host.querySelector('#frame-reference-previous').value || null;
        frame.continuity = frame.frame_reference ? 'continue' : 'anchor';
        frame.reference_statement = host.querySelector('#frame-reference-guidance').value.trim() || null;
        frame.reference_instructions = [];
        saveFrameLists(frame);
        options.onChange?.(index);
        close();
      } catch (error) { setStatus(error.message, true); }
    });
  }

  function openCharacter(index) {
    const character = spec()?.characters[index];
    if (!character || options.isRunning?.()) return;
    initialize();
    const draft = entries(character).map(entry => ({ ...entry }));
    const host = openDialog(`References · ${character.name}`, `
      <p class="reference-hint">These Flow images will be tagged before this character image's prompt is submitted.</p>
      ${character.flow_submission ? '<p class="reference-note">An image was already submitted. Reference edits apply to a future generation.</p>' : ''}
      <form id="character-reference-form"><div id="character-reference-rows"></div>
        <div class="reference-dialog-actions"><button type="button" class="btn-dark-pill" id="character-reference-add">+ Add reference</button><button type="button" class="btn-dark-pill" id="character-reference-library">Manage reference library</button></div>
        <p class="reference-editor-status" role="status"></p><div class="reference-dialog-actions"><button type="submit" class="btn-dark-pill">Save references</button><button type="button" class="btn-dark-pill" id="character-reference-cancel">Cancel</button></div>
      </form>`);
    const renderRows = () => {
      const container = host.querySelector('#character-reference-rows');
      container.innerHTML = draft.map((entry, row) => `<div class="reference-assignment-row">${thumbnail(entry)}<div>
        <label>Reference<select data-row="${row}" class="reference-assignment-source"><option value="">Select a reference</option>${library().map(ref => `<option value="${escape(ref.id)}" ${ref.id === entry.id ? 'selected' : ''}>${escape(ref.name)} · ${ref.kind}</option>`).join('')}</select></label>
        <label>Use for<select data-row="${row}" class="reference-assignment-role">${['character', 'style', 'image'].map(role => `<option value="${role}" ${entry.role === role ? 'selected' : ''}>${role === 'image' ? 'Scene / object' : role === 'style' ? 'Visual style' : 'Character'}</option>`).join('')}</select></label></div>
        <button type="button" class="btn-dark-pill reference-remove-assignment" data-row="${row}" aria-label="Remove reference">✕</button></div>`).join('') || '<p class="reference-hint">No references attached.</p>';
      container.querySelectorAll('.reference-assignment-source').forEach(select => select.addEventListener('change', () => {
        const row = Number(select.dataset.row), ref = library().find(ref => ref.id === select.value);
        draft[row] = { ...(ref || { name: '', kind: 'image' }), role: draft[row].role };
        renderRows();
      }));
      container.querySelectorAll('.reference-assignment-role').forEach(select => select.addEventListener('change', () => { draft[Number(select.dataset.row)].role = select.value; }));
      container.querySelectorAll('.reference-remove-assignment').forEach(button => button.addEventListener('click', () => { draft.splice(Number(button.dataset.row), 1); renderRows(); }));
    };
    renderRows();
    host.querySelector('#character-reference-add').addEventListener('click', () => { draft.push({ name: '', kind: 'image', role: 'style' }); renderRows(); });
    host.querySelector('#character-reference-library').addEventListener('click', () => {
      if (JSON.stringify(draft) !== JSON.stringify(entries(character))) {
        setStatus('Save or cancel your character edits before opening the library.', true);
        return;
      }
      openLibrary(null, null, index);
    });
    host.querySelector('#character-reference-cancel').addEventListener('click', close);
    host.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (options.isRunning?.() || refreshing) return;
      try {
        if (draft.some(entry => !entry.id || entry.missing || !library().some(ref => ref.id === entry.id))) throw new Error('Choose a reference for every row, or remove the empty row.');
        const ownTag = clean(character.flow_tag || character.name);
        if (draft.some(entry => sameName(entry.name, ownTag))) throw new Error('A character image cannot use itself as a reference.');
        const seen = new Set();
        character.reference_assignments = draft.filter(entry => {
          const key = `${entry.id}:${entry.role}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }).map(entry => ({ reference_id: entry.id, role: entry.role }));
        saveFrameLists(character);
        options.onChange?.();
        close();
      } catch (error) { setStatus(error.message, true); }
    });
  }

  function imageAssetForGeneration(ref) {
    const seed = (spec()?.characters || []).find(character => sameName(character.flow_tag || character.name, ref.name) && character.status === 'verified');
    const uniquelyVerified = seed?.image_title_unique === true || ref.unique_title_verified === true;
    return { name: ref.name, tileId: uniquelyVerified ? (seed?.image_tile_id || ref.tile_id) : null,
      previewUrl: uniquelyVerified ? (seed?.image_url || ref.preview_url) : null,
      uniqueTitleVerified: uniquelyVerified, referenceExistingOnly: true };
  }

  function forCharacterGeneration(character) {
    const refs = entries(character);
    if (refs.some(ref => ref.missing)) throw new Error(`A reference assigned to ${character.name} is missing. Edit its references before generating.`);
    const ownTag = clean(character.flow_tag || character.name);
    if (refs.some(ref => sameName(ref.name, ownTag))) throw new Error(`${character.name} cannot use its own image as a reference.`);
    return {
      references: refs,
      images: refs.map(imageAssetForGeneration),
      characters: [], characterAssets: []
    };
  }

  function forGeneration(frame) {
    if (!Array.isArray(frame.reference_assignments)) return null;
    const refs = entries(frame);
    if (refs.some(ref => ref.missing)) throw new Error(`A reference assigned to ${frame.target_filename} is missing. Edit its references before generating.`);
    return {
      characters: [], characterAssets: [],
      images: refs.map(imageAssetForGeneration),
      names: [...new Set(refs.map(ref => ref.name))]
    };
  }

  function usageGuidance(frame) {
    if (!Array.isArray(frame.reference_assignments)) return '';
    return entries(frame).filter(ref => !ref.missing).map(ref => ref.role === 'character'
      ? `Use @${ref.name} for the relevant character's identity, anatomy, and appearance.`
      : ref.role === 'style' ? `Use @${ref.name} for visual style, linework, and color treatment.`
        : `Use @${ref.name} for the relevant scene environment, objects, and composition.`).join('\n');
  }

  document.addEventListener('click', event => {
    const characterEdit = event.target.closest?.('.btn-edit-character-references');
    if (characterEdit) { if (!characterEdit.disabled) openCharacter(Number(characterEdit.dataset.index)); return; }
    const edit = event.target.closest?.('.btn-edit-references');
    if (edit) { if (!edit.disabled) openFrame(Number(edit.dataset.index)); return; }
    const button = event.target.closest?.('.reference-preview-button');
    if (!button) return;
    const url = imageUrl(button.dataset.previewUrl);
    if (!url) return;
    const preview = document.createElement('dialog');
    preview.className = 'reference-editor-dialog reference-preview-dialog';
    preview.innerHTML = `<div class="reference-dialog-header"><h2>${escape(button.dataset.previewName)}</h2><button type="button" class="reference-close" aria-label="Close reference preview">✕</button></div><img class="reference-full-preview" src="${escape(window.PipelineReferencePreview?.source(url) || url)}" alt="${escape(button.dataset.previewName)}" />`;
    document.body.appendChild(preview);
    preview.querySelector('button').addEventListener('click', () => preview.remove());
    preview.addEventListener('cancel', () => preview.remove());
    preview.showModal();
  });

  window.PipelineReferences = { configure(value) { options = value; }, normalizeLibrary, initialize, entries,
    renderFrame, renderCharacter, updateFrame, renderLibrarySummary, openFrame, openCharacter, openLibrary,
    forGeneration, forCharacterGeneration, usageGuidance, isBusy: () => refreshing };
})();
