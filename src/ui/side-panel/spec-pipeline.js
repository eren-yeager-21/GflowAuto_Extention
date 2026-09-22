// Spec-Driven Google Flow Pipeline Engine & UI Controller

(function () {
  const flowDestination = globalThis.FlowDestination;
  const pipelineConcurrency = globalThis.PipelineConcurrency;
  const rerollHistory = globalThis.RerollHistory;
  const rerollTileFallback = globalThis.RerollTileFallback;
  const IMAGE_MODEL = 'Nano Banana 2';
  if (!flowDestination || !pipelineConcurrency || !rerollHistory || !rerollTileFallback) {
    throw new Error('A required side-panel helper was not loaded.');
  }

  // State
  let currentSpec = null;
  let pipelineRunning = false;
  let pipelinePaused = false;
  let activeFrameIndex = -1;
  let activeGenerationGroupId = null;
  let activeRerollIndex = null;
  let activeSpecTab = 'control';
  const activeFrameDownloads = new Set();
  const debugEntries = [];
  const MAX_DEBUG_ENTRIES = 300;

  function appendDebugEntry(entry) {
    const normalized = {
      level: entry?.level || 'info',
      message: String(entry?.message || ''),
      timestamp: Number(entry?.timestamp) || Date.now()
    };
    debugEntries.push(normalized);
    if (debugEntries.length > MAX_DEBUG_ENTRIES) debugEntries.shift();
    renderDebugLog();
  }

  function log(...args) {
    console.log('[SpecPipeline]', ...args);
    appendDebugEntry({
      level: 'info',
      message: args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')
    });
  }

  // Persistent Keep-Alive Port to Background Service Worker
  let keepAlivePort = null;
  function maintainKeepAlivePort() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connect) {
        keepAlivePort = chrome.runtime.connect({ name: 'spec-pipeline-keepalive' });
        keepAlivePort.onDisconnect.addListener(() => {
          keepAlivePort = null;
          setTimeout(maintainKeepAlivePort, 1000);
        });
        setInterval(() => {
          if (keepAlivePort) {
            try { keepAlivePort.postMessage({ type: 'PING' }); } catch (e) {}
          }
        }, 15000);
      }
    } catch (e) {
      console.warn('[SpecPipeline] Could not connect keep-alive port:', e);
    }
  }
  maintainKeepAlivePort();

  // Local Frame Title Mapping Registry (frame_key -> generated Flow tile title)
  // Maps: "frame_001.png" -> "Smartphone vibrating on nightsta…", "frame_001" -> "Smartphone vibrating on nightsta…"
  const localFrameTitleMap = new Map();

  function registerLocalFrameTitle(key, title) {
    if (!key || !title) return;
    const cleanKey = String(key).trim();
    const cleanTitle = String(title).trim();
    if (/^(frame_\d+\.png|test_frame_\d+\.png)$/i.test(cleanTitle)) return;
    localFrameTitleMap.set(cleanKey, cleanTitle);
    if (cleanKey.endsWith('.png')) {
      localFrameTitleMap.set(cleanKey.replace(/\.png$/, ''), cleanTitle);
    } else {
      localFrameTitleMap.set(`${cleanKey}.png`, cleanTitle);
    }
  }

  function getLocalFrameTitle(frameRef) {
    if (!frameRef) return null;
    const clean = String(frameRef).replace(/\(.*?\)/g, '').trim();
    if (localFrameTitleMap.has(clean)) return localFrameTitleMap.get(clean);
    if (localFrameTitleMap.has(`${clean}.png`)) return localFrameTitleMap.get(`${clean}.png`);
    if (clean.endsWith('.png') && localFrameTitleMap.has(clean.replace(/\.png$/, ''))) {
      return localFrameTitleMap.get(clean.replace(/\.png$/, ''));
    }
    if (currentSpec && currentSpec.visuals) {
      const v = currentSpec.visuals.find(item => 
        item.id === clean || 
        item.target_filename === clean || 
        item.target_filename === `${clean}.png` ||
        (item.frame_number && String(item.frame_number) === clean) ||
        (item.frame_number && `frame_${String(item.frame_number).padStart(3, '0')}` === clean)
      );
      if (v && v.flow_tile_title && !/^(frame_\d+\.png|test_frame_\d+\.png)$/i.test(v.flow_tile_title)) {
        return v.flow_tile_title;
      }
    }
    return null;
  }

  const STORAGE_KEY_PREFIX = 'flow_pipeline_session_';
  const LATEST_KEY = 'flow_pipeline_latest_project';

  function getSpecView() {
    return document.getElementById('spec-pipeline-app');
  }

  function getStorageKey(projectName) {
    const safeName = (projectName || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `${STORAGE_KEY_PREFIX}${safeName}`;
  }

  function generateMappingData() {
    if (!currentSpec) return null;
    return {
      project_name: currentSpec.project_name,
      collection_url: currentSpec.collection_url || null,
      collection_tab_id: currentSpec.collection_tab_id || null,
      last_updated: new Date().toISOString(),
      generation_mode: 'textToImage',
      default_model: IMAGE_MODEL,
      max_parallel_generations: currentSpec.max_parallel_generations,
      default_aspect_ratio: currentSpec.default_aspect_ratio,
      output_folder: currentSpec.output_folder,
      characters: currentSpec.characters.map(c => ({
        id: c.id,
        name: c.name,
        flow_tag: c.flow_tag,
        reference_image: c.reference_image,
        character_prompt: c.character_prompt || c.prompt || c.description || "",
        status: c.status
      })),
      visuals: currentSpec.visuals.map(v => ({
        id: v.id,
        frame_number: v.frame_number,
        verbatim_script: v.verbatim_script || "",
        prompt: v.prompt,
        negative: v.negative,
        character_references: v.character_references,
        frame_reference: v.frame_reference || null,
        continuity: v.continuity,
        target_filename: v.target_filename,
        flow_tile_title: v.flow_tile_title || getLocalFrameTitle(v.target_filename) || null,
        status: v.status,
        progress: v.progress,
        result_url: v.result_url || null,
        reroll_previous: rerollHistory.normalizeSnapshot(v.reroll_previous),
        completed_at: v.completed_at || null,
        error: v.error || null,
        reference_instructions: v.reference_instructions || [],
        formatted_reference_guidance: v.formatted_reference_guidance || null
      })),
      frame_title_mapping: Object.fromEntries(localFrameTitleMap)
    };
  }

  function savePipelineMapping() {
    const data = generateMappingData();
    if (!data) return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const key = getStorageKey(data.project_name);
      chrome.storage.local.set({
        [key]: data,
        [LATEST_KEY]: data.project_name
      }).catch(() => {});
    }
  }

  function checkSavedSession(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      if (callback) callback(null);
      return;
    }
    chrome.storage.local.get([LATEST_KEY], (res) => {
      const latestProj = res && res[LATEST_KEY];
      if (!latestProj) {
        if (callback) callback(null);
        return;
      }
      const key = getStorageKey(latestProj);
      chrome.storage.local.get([key], (projRes) => {
        const saved = projRes && projRes[key];
        if (saved) {
          if (saved.frame_title_mapping) {
            Object.entries(saved.frame_title_mapping).forEach(([k, val]) => registerLocalFrameTitle(k, val));
          }
          if (saved.visuals) {
            saved.visuals.forEach(v => {
              if (v.flow_tile_title) registerLocalFrameTitle(v.target_filename, v.flow_tile_title);
            });
          }
        }
        if (callback) callback(saved || null);
      });
    });
  }

  function exportMappingFile() {
    const data = generateMappingData();
    if (!data) return;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeFolder = (currentSpec.output_folder || 'flow_pipeline').trim();
    const filename = `${safeFolder}/pipeline_mapping.json`;
    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false,
        conflictAction: 'overwrite'
      });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pipeline_mapping.json';
      a.click();
    }
  }

  function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getCleanFlowTileTitle(rawTitle) {
    if (!rawTitle) return '';
    return String(rawTitle)
      .replace(/\.[^/.]+$/, '')          // strip file extensions (.png, .jpg)
      .replace(/(\u2026|\.{2,})$/, '')   // strip trailing ellipsis … or ...
      .trim();
  }

  function resolveReferencedVisual(frame, frameIndex) {
    if (!currentSpec || !currentSpec.visuals) return null;
    const rawRef = frame.frame_reference || frame.frame_ref;
    if (rawRef) {
      const cleanRef = String(rawRef).replace(/\(.*?\)/g, '').trim();
      const matched = currentSpec.visuals.find(v => 
        v.id === cleanRef || 
        v.target_filename === cleanRef || 
        v.target_filename === `${cleanRef}.png` ||
        (v.frame_number && String(v.frame_number) === cleanRef) ||
        (v.frame_number && `frame_${String(v.frame_number).padStart(3, '0')}` === cleanRef)
      );
      if (matched) return matched;
    }
    if (frame.continuity === 'continue' && frameIndex > 0 && currentSpec.visuals[frameIndex - 1]) {
      return currentSpec.visuals[frameIndex - 1];
    }
    return null;
  }

  function resolveFlowTileTitleForFrame(frame, frameIndex) {
    if (!frame) return '';
    const refVisual = resolveReferencedVisual(frame, frameIndex);
    let title = null;
    if (refVisual) {
      title = getLocalFrameTitle(refVisual.target_filename) || 
              getLocalFrameTitle(refVisual.id) || 
              refVisual.flow_tile_title;
    }
    const rawRef = frame.frame_reference || frame.frame_ref;
    if (!title && rawRef) {
      title = getLocalFrameTitle(rawRef);
    }
    if (title && !/^(frame_\d+\.png|test_frame_\d+\.png)$/i.test(title)) {
      return getCleanFlowTileTitle(title);
    }
    if (refVisual) {
      return getCleanFlowTileTitle(refVisual.target_filename || refVisual.id);
    }
    return rawRef ? getCleanFlowTileTitle(rawRef) : '';
  }

  /**
   * Generates authoritative reference instructions based on attached references.
   * - If referenceStatement is explicitly provided, uses it directly.
   * - If visual style/character reference: "## Use provided reference strictly for visual style, stick figure anatomy, line weight, and character proportions. Render all scene environment, actions, and props as specified in this prompt."
   * - If continuous frame reference: "## Use the provided frame reference {cleanFlowTitle} to maintain continuous scene layout, camera perspective, lighting, color palette, and environmental coherence for generating the current frame."
   * - If both: Combines both directives.
   */
    const UNIVERSAL_REFERENCE_RULES = 
`## Selective Relevance Directive:
- Consider and apply references ONLY where they are directly relevant to the specific action and subject described in this prompt.
- Discard and ignore any reference elements, characters, or props that are not explicitly called for in this scene prompt.

## Strict Text & Prop Exclusion:
- Under NO circumstances copy any written text, typography, dates, names, title cards, captions, or decorative icons (such as hats, plaques, or display pedestals) from reference images into this frame.
- Replicate only the clean 2D line art style and specified scene composition.`;

  function getReferenceGuidanceStatement(charRefs = [], frameRefName = null, referenceStatement = null, continuity = null) {
    if (referenceStatement && String(referenceStatement).trim()) {
      let stmt = String(referenceStatement).trim();
      if (!stmt.startsWith('### Reference Guidance:')) {
        stmt = `### Reference Guidance:\n${stmt}`;
      }
      if (!stmt.includes('Selective Relevance Directive')) {
        stmt = `${stmt}\n\n${UNIVERSAL_REFERENCE_RULES}`;
      }
      return stmt;
    }
    const chars = (Array.isArray(charRefs) ? charRefs : [charRefs]).map(c => String(c).trim()).filter(Boolean);
    const hasChars = chars.length > 0;
    const cleanFrame = frameRefName ? getCleanFlowTileTitle(frameRefName) : null;
    const hasFrame = Boolean(cleanFrame) || continuity === 'continue';

    let baseDirectives = '';
    if (hasChars && hasFrame) {
      const framePart = cleanFrame ? ` ${cleanFrame}` : '';
      baseDirectives = `## Use provided reference strictly for visual style, stick figure anatomy, line weight, and character proportions.\n## Use the provided frame reference${framePart} to maintain continuous scene layout, camera perspective, lighting, color palette, and environmental coherence for generating the current frame.`;
    } else if (hasChars && !hasFrame) {
      baseDirectives = `## Use provided reference strictly for visual style, stick figure anatomy, line weight, and character proportions. Render all scene environment, actions, and props as specified in this prompt.`;
    } else if (!hasChars && hasFrame) {
      const framePart = cleanFrame ? ` ${cleanFrame}` : '';
      baseDirectives = `## Use the provided frame reference${framePart} to maintain continuous scene layout, camera perspective, lighting, color palette, and environmental coherence for generating the current frame.`;
    }

    if (baseDirectives) {
      return `### Reference Guidance:\n${baseDirectives}\n\n${UNIVERSAL_REFERENCE_RULES}`;
    }
    return '';
  }

  function formatReferenceGuidance(frame, frameIndex) {
    if (!frame) return '';
    const charRefLabels = resolveCharacterReferenceLabels(frame.character_references, currentSpec?.characters || []);
    const cleanFlowTitle = resolveFlowTileTitleForFrame(frame, frameIndex);

    // If an explicit reference_statement is provided, translate placeholders and literal frame references
    if (frame.reference_statement && String(frame.reference_statement).trim()) {
      let stmt = String(frame.reference_statement).trim();
      if (cleanFlowTitle) {
        stmt = stmt.replace(/\{(?:frame_name|frame_reference|flow_tile_title)\}/gi, cleanFlowTitle);
        const refVisual = resolveReferencedVisual(frame, frameIndex);
        if (refVisual && !/^(frame_\d+|test_frame_\d+)$/i.test(cleanFlowTitle)) {
          const fn = refVisual.target_filename;
          const fnNoExt = fn ? fn.replace(/\.[^/.]+$/, '') : '';
          const id = refVisual.id;
          if (fn) {
            stmt = stmt.replace(new RegExp(escapeRegex(fn), 'gi'), cleanFlowTitle);
          }
          if (fnNoExt && fnNoExt !== fn) {
            stmt = stmt.replace(new RegExp(`\\b${escapeRegex(fnNoExt)}\\b`, 'gi'), cleanFlowTitle);
          }
          if (id && id !== fnNoExt && id !== fn) {
            stmt = stmt.replace(new RegExp(`\\b${escapeRegex(id)}\\b`, 'gi'), cleanFlowTitle);
          }
        }
      }
      if (!stmt.startsWith('### Reference Guidance:')) {
        stmt = `### Reference Guidance:\n${stmt}`;
      }
      if (!stmt.includes('Selective Relevance Directive')) {
        stmt = `${stmt}\n\n${UNIVERSAL_REFERENCE_RULES}`;
      }
      return stmt;
    }

    // Legacy reference_instructions
    if (frame.reference_instructions) {
      let legacy = '';
      if (Array.isArray(frame.reference_instructions) && frame.reference_instructions.length > 0) {
        legacy = frame.reference_instructions.map(inst => `- ${inst}`).join('\n');
      } else if (typeof frame.reference_instructions === 'object' && Object.keys(frame.reference_instructions).length > 0) {
        const lines = Object.entries(frame.reference_instructions).map(([k, v]) => {
          const usage = typeof v === 'object' ? (v.usage || v.reason || JSON.stringify(v)) : String(v);
          return `- ${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}: ${usage}`;
        });
        legacy = lines.join('\n');
      }
      if (legacy) {
        return `### Reference Guidance:\n${legacy}\n\n${UNIVERSAL_REFERENCE_RULES}`;
      }
    }

    // Auto-synthesized guidance statement
    return getReferenceGuidanceStatement(charRefLabels, cleanFlowTitle, null, frame.continuity);
  }

  function buildPromptWithReferenceGuidance(basePrompt, charRefs = [], frameRefName = null, referenceStatement = null, continuity = null) {
    if (!basePrompt) return '';
    const cleanBase = basePrompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
    const guidance = getReferenceGuidanceStatement(charRefs, frameRefName, referenceStatement, continuity);
    return guidance ? `${cleanBase}\n\n${guidance}` : cleanBase;
  }


  function resolveCharacterReferenceLabels(charRefs = [], characters = []) {
    const list = Array.isArray(charRefs) ? charRefs : [charRefs];
    return list.map(ref => {
      const clean = String(ref || '').replace(/^@/, '').trim();
      const norm = clean.toLowerCase().replace(/[\s_-]+/g, '');
      const foundChar = characters.find(c => 
        (c.id && c.id.toLowerCase().replace(/[\s_-]+/g, '') === norm) || 
        (c.name && c.name.toLowerCase().replace(/[\s_-]+/g, '') === norm) || 
        (c.flow_tag && c.flow_tag.replace(/^@/, '').toLowerCase().replace(/[\s_-]+/g, '') === norm)
      );
      const chosen = (foundChar && foundChar.reference_image) ? foundChar.reference_image : (foundChar ? (foundChar.name || foundChar.flow_tag) : ref);
      return String(chosen || '').replace(/^@/, '').trim();
    }).filter(Boolean);
  }

  const CHARACTER_CREATION_SAMPLE = {
    project_name: "Ancient Humans Pleasure - Character Suite",
    default_model: "Nano Banana 2",
    default_aspect_ratio: "16:9",
    output_folder: "ancient_humans_scenes",
    characters: [
      {
        id: "CHAR_NARRATOR",
        name: "narrator_stickfigure",
        flow_tag: "@narrator_stickfigure",
        reference_image: "ref_stick_figure_narrator",
        character_prompt: "Minimalist black ink line art stick figure narrator avatar with pale cream fill head (#FFFDD0), vintage brown fedora with dark ribbon band, friendly open conversational hand gestures. Clean bold outlines, flat color fills, zero gradients, pure white background."
      },
      {
        id: "CHAR_PALEO_MAN",
        name: "Early_man_stickfigure",
        flow_tag: "@Early_man_stickfigure",
        reference_image: "ref_prehistoric_human",
        character_prompt: "Minimalist black ink line art stick figure paleolithic hunter-gatherer with shaggy brown hair silhouette, animal fur pelt tunic over one shoulder, bare feet, holding a chipped flint hand axe. Clean bold outlines, flat color fills, zero gradients, pure white background."
      },
      {
        id: "CHAR_PALEO_WOMAN",
        name: "Early_women_stickfigure",
        flow_tag: "@Early_women_stickfigure",
        reference_image: "women_early_human",
        character_prompt: "Minimalist black ink line art stick figure female hunter-gatherer with animal fur garment and gathered hair silhouette. Clean bold outlines, flat color fills, zero gradients, pure white background."
      },
      {
        id: "CHAR_ARCHAEOLOGIST",
        name: "archieologiest_stick_fig",
        flow_tag: "@archieologiest_stick_fig",
        reference_image: "ref_archaeologist",
        character_prompt: "Minimalist black ink line art stick figure field archaeologist wearing tan brimmed safari hat, khaki utility vest outlines, holding trowel and magnifying glass. Clean bold outlines, flat color fills, zero gradients, pure white background."
      },
      {
        id: "CHAR_MAP_ANCHOR",
        name: "maps_reference",
        flow_tag: "@maps_reference",
        reference_image: "ref_world_map",
        character_prompt: "Historical stylized parchment world map visual anchor, clean bold black ink continental outlines, subtle warm beige fill, vintage cartographic linework, pure white background."
      },
      {
        id: "CHAR_FLUTE_PLAYER_NEW",
        name: "flute_player_stickfigure",
        flow_tag: "@flute_player_stickfigure",
        reference_image: "Stick figure playing bone flute",
        character_prompt: "Minimalist black ink line art stick figure paleolithic musician playing a carved hollow bone flute by the campfire, simple tunic, relaxed pose. Clean bold outlines, flat color fills, zero gradients, pure white background."
      }
    ],
    visuals: [
      {
        id: "test_frame_001",
        frame_number: 1,
        prompt: "Minimalist black ink line art with flat color fills, edge-to-edge full-bleed composition, zero gradients. Narrator sitting relaxed on a simple modern wooden bench, gesturing outward with open friendly hands. Pale cream wall background, warm soft lighting. Full-bleed 16:9 wide shot.",
        character_references: ["@narrator_stickfigure"],
        continuity: "anchor",
        target_filename: "test_frame_001.png"
      },
      {
        id: "test_frame_002",
        frame_number: 2,
        prompt: "Minimalist black ink line art with flat color fills, edge-to-edge full-bleed composition, zero gradients. Paleolithic hunter-gatherer sitting cross-legged by a crackling campfire inside a dark limestone cave, holding a carved hollow bone flute. Warm orange firelight glow against rugged stone walls. Full-bleed 16:9 wide shot.",
        character_references: ["@Early_man_stickfigure"],
        frame_reference: "test_frame_001",
        continuity: "anchor",
        target_filename: "test_frame_002.png"
      }
    ]
  };

  function initUI() {
    const tabSpecBtn = document.getElementById('tab-btn-spec');
    const tabClassicBtn = document.getElementById('tab-btn-classic');
    const specContainer = document.getElementById('spec-container');
    const classicContainer = document.getElementById('classic-container');

    if (tabSpecBtn && tabClassicBtn) {
      tabSpecBtn.onclick = () => {
        tabSpecBtn.classList.add('active');
        tabClassicBtn.classList.remove('active');
        if (specContainer) specContainer.style.display = 'block';
        if (classicContainer) classicContainer.style.display = 'none';
      };

      tabClassicBtn.onclick = () => {
        tabClassicBtn.classList.add('active');
        tabSpecBtn.classList.remove('active');
        if (specContainer) specContainer.style.display = 'none';
        if (classicContainer) classicContainer.style.display = 'block';
      };
    }

    const specView = getSpecView();
    if (specView && specView.children.length === 0) {
      renderUploadScreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  function renderUploadScreen() {
    const specView = getSpecView();
    if (!specView) return;

    checkSavedSession((saved) => {
      const completedCount = saved && saved.visuals ? saved.visuals.filter(v => v.status === 'completed').length : 0;
      const totalCount = saved && saved.visuals ? saved.visuals.length : 0;
      const hasResumable = completedCount > 0 && totalCount > 0;

      specView.innerHTML = `
        <div class="spec-header">
          <h2>🎬 Spec-Driven Flow Pipeline</h2>
          <p>Upload a structured storyboard or spec file (.json) to automate character creation, sequential frame chaining, and downloads.</p>
        </div>

        ${hasResumable ? `
          <div class="resume-banner" id="resume-banner">
            <div class="resume-banner-title">
              <span>🔄 Saved Session Available: ${escapeHtml(saved.project_name)}</span>
            </div>
            <div class="resume-banner-sub">
              Progress: <strong>${completedCount}/${totalCount} frames completed</strong>. Last saved: ${new Date(saved.last_updated).toLocaleTimeString()}
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary btn-sm" id="btn-resume-session">▶ Resume Session</button>
              <button class="btn btn-secondary btn-sm" id="btn-discard-session">Discard & Start Fresh</button>
            </div>
          </div>
        ` : ''}

        <div class="dropzone" id="spec-dropzone">
          <div class="dropzone-icon">📁</div>
          <div class="dropzone-text">Click or Drop Specification File Here</div>
          <div class="dropzone-sub">Supports storyboard.json, spec.json, pipeline_mapping.json</div>
          <input type="file" id="spec-file-input" accept=".json" style="display: none;" />
        </div>

        <div class="sample-load-bar">
          <button class="btn-link" id="load-char-sample-btn">👤 Load Character Creation Sample</button>
          <button class="btn-link" id="load-sample-btn">⚡ Load Full Storyboard (32 Beats)</button>
        </div>
      `;

      setupDropzone();

      if (hasResumable) {
        const btnResume = document.getElementById('btn-resume-session');
        const btnDiscard = document.getElementById('btn-discard-session');
        if (btnResume) {
          btnResume.addEventListener('click', () => {
            parseAndLoadSpec(saved);
          });
        }
        if (btnDiscard) {
          btnDiscard.addEventListener('click', () => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              const key = getStorageKey(saved.project_name);
              chrome.storage.local.remove([key, LATEST_KEY], () => {
                renderUploadScreen();
              });
            } else {
              renderUploadScreen();
            }
          });
        }
      }
    });
  }

  function setupDropzone() {
    const dropzone = document.getElementById('spec-dropzone');
    const fileInput = document.getElementById('spec-file-input');
    const loadSampleBtn = document.getElementById('load-sample-btn');
    const loadCharBtn = document.getElementById('load-char-sample-btn');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFile(e.target.files[0]);
        }
      });
    }

    if (loadSampleBtn) {
      loadSampleBtn.addEventListener('click', loadSampleSpec);
    }
    if (loadCharBtn) {
      loadCharBtn.addEventListener('click', loadCharSampleSpec);
    }
  }

  function loadCharSampleSpec() {
    parseAndLoadSpec(CHARACTER_CREATION_SAMPLE);
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        parseAndLoadSpec(json);
      } catch (err) {
        alert('Invalid JSON specification file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // Built-in sample generator based on beats_000_to_030.json
  function loadSampleSpec() {
    const sample = {
      project_name: "Ancient Humans Pleasure",
      default_model: "Nano Banana 2",
      default_aspect_ratio: "16:9",
      output_folder: "ancient_humans_scenes",
      characters: [
        { id: "CHAR_HOST", name: "expression_stick_figure", flow_tag: "@expression_stick_figure", status: "checking" },
        { id: "CHAR_PALEO", name: "male_early_human", flow_tag: "@male_early_human", status: "checking" },
        { id: "CHAR_FEMALE", name: "women_early_human", flow_tag: "@women_early_human", status: "checking" },
        { id: "CHAR_COMMON", name: "common_stickfigure", flow_tag: "@common_stickfigure", status: "checking" },
        { id: "CHAR_MAP", name: "maps_reference", flow_tag: "@maps_reference", status: "checking" }
      ],
      visuals: [
        {
          id: "frame_001",
          frame_number: 1,
          prompt: "Bored figure slouched on a simple modern sofa, one arm extending reflexively sideways toward a sleek smartphone lying on a low coffee table beside the sofa. Small ink spiral boredom symbol floating just above the head. Half-lidded tired eyes, flat line mouth. Muted cream background, clean bold black ink line art, minimalist webcomic panel layout.",
          character_references: ["@expression_stick_figure"],
          continuity: "anchor",
          target_filename: "frame_001.png",
          status: "pending"
        },
        {
          id: "frame_002",
          frame_number: 2,
          prompt: "Pure white background split into three clean vertical panels separated by bold black dashed lines. Left panel: a pair of headphones with a floating musical eighth note. Center panel: a video game controller gamepad. Right panel: a video play button on a screen. Bold uppercase hand-lettered labels beneath each: MUSIC, GAME, WATCH. Flat ink illustration, comic strip layout, no characters.",
          character_references: ["@expression_stick_figure", "@title_reference"],
          continuity: "continue",
          target_filename: "frame_002.png",
          status: "pending"
        },
        {
          id: "frame_003",
          frame_number: 3,
          prompt: "Wide interior shot of a dark Pleistocene limestone cave. Rough textured cave walls with natural rock formations. A warm glowing orange campfire crackling in the center foreground, casting soft warm light and long shadows across the cave floor and walls. Figure sitting cross-legged beside the fire staring into the flames. Atmospheric cave scene, cel-shaded warm firelight against dark stone, bold black ink outlines, minimalist webcomic style.",
          character_references: ["@male_early_human"],
          continuity: "anchor",
          target_filename: "frame_003.png",
          status: "pending"
        },
        {
          id: "frame_004",
          frame_number: 4,
          prompt: "Same dark limestone cave interior with glowing campfire as background. Figure sitting by the fire, tapping fingers restlessly on knee, head tilted with bored expression, wavy mouth line. A modern smartphone floating mid-air above the scene with a bold red ❌ painted across it, desaturated. Cave walls and firelight in background unchanged. Bold black ink outlines, editorial cartoon style.",
          character_references: ["@male_early_human"],
          continuity: "continue",
          target_filename: "frame_004.png",
          status: "pending"
        }
      ]
    };

    parseAndLoadSpec(sample);
  }

  // Normalizer: handles Custom Spec, beats_*.json, and saved pipeline_mapping.json
  function parseAndLoadSpec(raw) {
    const spec = {
      project_name: raw.project_name || raw.project || "Google Flow Production",
      collection_url: raw.collection_url || raw.flow_collection_url || raw.collection?.url || "",
      collection_tab_id: Number.isInteger(raw.collection_tab_id) ? raw.collection_tab_id : null,
      generation_mode: 'textToImage',
      default_model: IMAGE_MODEL,
      max_parallel_generations: pipelineConcurrency.normalizeMaxParallel(
        raw.max_parallel_generations ?? raw.parallel_gen_value
      ),
      default_aspect_ratio: raw.default_aspect_ratio || raw.aspect_ratio || "16:9",
      output_folder: raw.output_folder || "ancient_humans_scenes",
      characters: [],
      visuals: []
    };

    // Normalize characters
    if (Array.isArray(raw.characters)) {
      spec.characters = raw.characters.map((c, i) => {
        const charPrompt = c.character_prompt || c.prompt || c.description || "";
        return {
          id: c.id || `char_${i + 1}`,
          name: c.name || `Character ${i + 1}`,
          flow_tag: c.flow_tag || (c.name ? `@${c.name}` : `@char_${i + 1}`),
          reference_image: c.reference_image || null,
          character_prompt: charPrompt,
          prompt: charPrompt,
          description: charPrompt,
          status: c.status || "checking"
        };
      });
    } else if (typeof raw.characters === 'object' && raw.characters !== null) {
      spec.characters = Object.entries(raw.characters).map(([k, c]) => {
        const charPrompt = c.character_prompt || c.prompt || c.description || "";
        return {
          id: k,
          name: c.name || k,
          flow_tag: `@${(c.name || k).replace(/\s+/g, '_')}`,
          reference_image: c.reference_image || null,
          character_prompt: charPrompt,
          prompt: charPrompt,
          description: charPrompt,
          status: c.status || "checking"
        };
      });
    }

    // Pre-register known tile mappings before resolving guidance
    if (raw.frame_title_mapping && typeof raw.frame_title_mapping === 'object') {
      Object.entries(raw.frame_title_mapping).forEach(([k, val]) => {
        registerLocalFrameTitle(k, val);
      });
    }
    const rawVisuals = raw.visuals || raw.beats || [];
    rawVisuals.forEach(v => {
      if (v.flow_tile_title) {
        if (v.target_filename) registerLocalFrameTitle(v.target_filename, v.flow_tile_title);
        if (v.id) registerLocalFrameTitle(v.id, v.flow_tile_title);
      }
    });

    // Normalize visuals / beats
    spec.visuals = rawVisuals.map((v, i) => {
      const num = i + 1;
      const numPad = String(num).padStart(3, '0');
      const targetFilename = v.target_filename || `frame_${numPad}.png`;
      const continuity = v.continuity || (i === 0 ? "anchor" : (v.prompt && v.prompt.toLowerCase().startsWith("same") ? "continue" : "anchor"));

      let charRefs = v.character_references || [];
      if (typeof charRefs === 'string') charRefs = [charRefs];

      const rawFrameRef = v.frame_reference || v.frame_ref || null;
      
      // Preserve clean base prompt without embedded guidance
      const rawPrompt = v.prompt || v.scene_prompt || "";
      const basePrompt = rawPrompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
      const refInstructions = Array.isArray(v.reference_instructions) ? v.reference_instructions : [];
      const referenceStatement = v.reference_statement ? String(v.reference_statement).trim() : null;

      const status = v.status || "pending";
      const progress = status === 'completed' ? 100 : (v.progress || 0);

      return {
        id: v.id || `frame_${numPad}`,
        frame_number: num,
        verbatim_script: typeof v.verbatim_script === 'string' ? v.verbatim_script.trim() : "",
        prompt: basePrompt,
        negative: v.negative || v.negative_prompt || "",
        character_references: charRefs,
        frame_reference: rawFrameRef,
        continuity: continuity,
        target_filename: targetFilename,
        flow_tile_title: v.flow_tile_title || getLocalFrameTitle(targetFilename) || null,
        status: status,
        progress: progress,
        result_url: v.result_url || null,
        reroll_previous: rerollHistory.normalizeSnapshot(v.reroll_previous),
        completed_at: v.completed_at || null,
        error: v.error || null,
        reference_statement: referenceStatement,
        reference_instructions: refInstructions,
        formatted_reference_guidance: v.formatted_reference_guidance || null
      };
    });

    currentSpec = spec;

    // Dynamically format reference guidance with registered tile titles
    spec.visuals.forEach((v, i) => {
      v.formatted_reference_guidance = formatReferenceGuidance(v, i);
      if (v.flow_tile_title) {
        registerLocalFrameTitle(v.target_filename, v.flow_tile_title);
        registerLocalFrameTitle(v.id, v.flow_tile_title);
      }
    });
    savePipelineMapping();
    renderPipelineDashboard();
    checkFlowCharacters();
  }

  function renderPipelineDashboard() {
    if (!currentSpec) return;

    const completedCount = currentSpec.visuals.filter(v => v.status === 'completed').length;
    const totalCount = currentSpec.visuals.length;
    const remainingCount = totalCount - completedCount;
    const nextPendingIndex = currentSpec.visuals.findIndex(v => v.status !== 'completed');
    const nextFrameNum = nextPendingIndex >= 0 ? currentSpec.visuals[nextPendingIndex].frame_number : totalCount;

    const specView = getSpecView();
    if (!specView) return;

    specView.innerHTML = `
      <div class="project-card">
        <div class="project-title-row">
          <div class="project-name">${escapeHtml(currentSpec.project_name)}</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-link" id="btn-export-mapping" title="Save mapping JSON to output folder">📋 Save Mapping</button>
            <button class="btn-link" id="btn-reset-spec">Switch Spec</button>
          </div>
        </div>
        <div class="collection-destination">
          <label for="collection-url-input">Google Flow collection URL</label>
          <div class="collection-destination-row">
            <input id="collection-url-input" type="url" value="${escapeAttr(currentSpec.collection_url || '')}" placeholder="Open your collection in Flow and paste its URL" spellcheck="false" />
            <button class="btn btn-secondary btn-sm" id="btn-use-open-flow">Use open Flow page</button>
          </div>
          <div id="collection-destination-status" class="collection-destination-status" role="status" aria-live="polite">
            ${currentSpec.collection_url ? 'Generation is locked to this Flow page.' : 'Optional: leave empty to use the currently open Flow project page.'}
          </div>
        </div>
      </div>

      <div class="spec-view-tabs" role="tablist" aria-label="Spec Pipeline views">
        <button class="spec-view-tab ${activeSpecTab === 'control' ? 'active' : ''}" data-spec-tab="control" role="tab" aria-selected="${activeSpecTab === 'control'}">☷ <span>Control</span></button>
        <button class="spec-view-tab ${activeSpecTab === 'settings' ? 'active' : ''}" data-spec-tab="settings" role="tab" aria-selected="${activeSpecTab === 'settings'}">⚙ <span>Settings</span></button>
        <button class="spec-view-tab ${activeSpecTab === 'debug' ? 'active' : ''}" data-spec-tab="debug" role="tab" aria-selected="${activeSpecTab === 'debug'}">⌕ <span>Debug Logs</span></button>
      </div>

      <section class="spec-view-panel ${activeSpecTab === 'control' ? 'active' : ''}" data-spec-panel="control" role="tabpanel">
        <div class="project-card">
          <div class="project-stats">
            <div class="stat-box"><div class="stat-val" id="stat-total">${totalCount}</div><div class="stat-lbl">Total Frames</div></div>
            <div class="stat-box"><div class="stat-val" id="stat-completed" style="color: var(--success-color);">${completedCount}</div><div class="stat-lbl">Completed</div></div>
            <div class="stat-box"><div class="stat-val" id="stat-pending">${remainingCount}</div><div class="stat-lbl">Remaining</div></div>
          </div>
          <div class="pipeline-actions">
            <button class="btn btn-primary" id="btn-start-pipeline" ${pipelineRunning || (completedCount === totalCount && totalCount > 0) ? 'disabled' : ''}>${pipelineRunning ? (pipelinePaused ? '⏳ Finishing active generations...' : '⏳ Generating...') : (completedCount > 0 && remainingCount > 0) ? `▶ Resume Pipeline (Frame #${nextFrameNum})` : completedCount === totalCount ? '✓ All Completed' : '▶ Start Pipeline'}</button>
            <button class="btn btn-secondary" id="btn-pause-pipeline" ${!pipelineRunning || pipelinePaused ? 'disabled' : ''}>${pipelinePaused && pipelineRunning ? '⏳ Pausing...' : '⏸ Pause'}</button>
            <button class="btn btn-secondary" id="btn-download-all" ${completedCount === 0 ? 'disabled' : ''}>⬇ Download All</button>
          </div>
        </div>

        <div class="section-title"><span>Characters & References (${currentSpec.characters.length})</span><div style="display: flex; gap: 6px;"><button class="btn-link" id="btn-recheck-chars">Verify with Flow</button><button class="btn-link" id="btn-create-missing-chars">➕ Create Missing</button></div></div>
        <div class="characters-list" id="chars-container">${renderCharactersList()}</div>
        <div class="section-title"><span>Visual Production Sequence (${totalCount} Frames)</span><button class="btn-link" id="btn-sync-tiles" title="Scan open Flow project to auto-map generated tile titles">🔄 Sync Flow Titles</button></div>
        <div class="frames-list" id="frames-container">${renderFramesList()}</div>
      </section>

      <section class="spec-view-panel ${activeSpecTab === 'settings' ? 'active' : ''}" data-spec-panel="settings" role="tabpanel">
        <div class="project-card spec-tab-card">
          <div class="spec-tab-panel-title">⚙ Settings</div>
          <div class="spec-settings-grid">
            <label for="spec-generation-mode">Generation mode</label><select id="spec-generation-mode" disabled><option value="textToImage" selected>Text to Image</option></select>
            <label for="spec-image-model">Image model</label><input id="spec-image-model" value="${escapeAttr(IMAGE_MODEL)}" disabled />
            <label for="spec-aspect-ratio">Aspect ratio</label><select id="spec-aspect-ratio">${['16:9', '9:16', '1:1'].map(value => `<option value="${value}" ${currentSpec.default_aspect_ratio === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
            <label for="max-parallel-generations">Max active independent generations</label><select id="max-parallel-generations">${Array.from({ length: pipelineConcurrency.MAX_PARALLEL }, (_, index) => index + 1).map(value => `<option value="${value}" ${currentSpec.max_parallel_generations === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
            <label>Output per frame</label><input value="1 image" disabled />
            <label>Automatic download</label><input value="Original quality" disabled />
          </div>
          <div class="spec-settings-note">Frame to Video and Text to Video modes will be added in a future feature.</div>
        </div>
      </section>

      <section class="spec-view-panel ${activeSpecTab === 'debug' ? 'active' : ''}" data-spec-panel="debug" role="tabpanel">
        <div class="project-card spec-tab-card">
          <div class="spec-debug-header"><div class="spec-tab-panel-title">🐞 Debug Logs</div><div class="spec-debug-actions"><button class="btn-link" id="btn-copy-debug-log">Copy</button><button class="btn-link" id="btn-clear-debug-log">Clear</button></div></div>
          <div id="spec-debug-log" class="spec-debug-log"></div>
        </div>
      </section>
    `;
    attachDashboardEvents();
    renderDebugLog();
  }

  function renderDebugLog() {
    const container = document.getElementById('spec-debug-log');
    if (!container) return;
    if (debugEntries.length === 0) {
      container.innerHTML = '<div class="spec-debug-empty">No pipeline activity yet.</div>';
      return;
    }
    container.innerHTML = debugEntries.map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      return `<div class="spec-debug-entry ${escapeAttr(entry.level)}"><span>${escapeHtml(time)}</span> ${escapeHtml(entry.message)}</div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  function getDebugLogText() {
    return debugEntries.map(entry =>
      `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}] ${entry.message}`
    ).join('\n');
  }

  function renderCharactersList() {
    if (!currentSpec || currentSpec.characters.length === 0) {
      return `<div style="color: var(--text-muted); font-size: 11px;">No character seeds specified.</div>`;
    }
    return currentSpec.characters.map(c => `
      <div class="character-card" id="char-card-${escapeAttr(c.id)}">
        <div class="char-header-row">
          <div class="char-info">
            <div class="char-avatar">👤</div>
            <div>
              <div class="char-name">${escapeHtml(c.name)}</div>
              <div class="char-tag">${escapeHtml(c.flow_tag)}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge ${c.status === 'verified' ? 'badge-verified' : c.status === 'creating' ? 'badge-missing' : 'badge-missing'}" id="char-badge-${escapeAttr(c.id)}">
              ${c.status === 'verified' ? '✓ Registered in Flow' : c.status === 'creating' ? '⏳ Creating in Flow...' : '⚠️ Missing in Flow'}
            </span>
            ${c.status !== 'verified' ? `
              <button class="btn btn-secondary btn-xs btn-create-char" data-id="${escapeAttr(c.id)}" ${c.status === 'creating' ? 'disabled' : ''}>
                ➕ Create in Flow
              </button>
            ` : ''}
          </div>
        </div>

        ${(c.prompt || c.description) ? `
          <div class="char-prompt-container">
            <div class="char-prompt-label-row">
              <span class="char-prompt-label">Character Prompt</span>
              <button class="btn-copy-prompt" data-id="${escapeAttr(c.id)}" title="Copy character prompt to clipboard">
                📋 Copy Prompt
              </button>
            </div>
            <div class="char-prompt-body" id="char-prompt-text-${escapeAttr(c.id)}">${escapeHtml(c.prompt || c.description)}</div>
            ${c.reference_image ? `<div class="char-ref-pill">🎨 Style Ref: ${escapeHtml(c.reference_image)}</div>` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderFramesList() {
    if (!currentSpec || currentSpec.visuals.length === 0) {
      return `<div style="color: var(--text-muted); font-size: 11px;">No frames found in spec.</div>`;
    }

    return currentSpec.visuals.map((f, idx) => {
      const flowTitle = f.flow_tile_title || getLocalFrameTitle(f.target_filename) || '';
      const refTitle = resolveFlowTileTitleForFrame(f, idx);
      const hasRef = Boolean(f.frame_reference || (f.continuity === 'continue' && idx > 0));
      const refLabel = f.frame_reference || (currentSpec.visuals[idx - 1] ? currentSpec.visuals[idx - 1].target_filename : 'Previous Frame');
      return `
      <div class="frame-card ${f.status === 'generating' ? 'active' : ''} ${f.status === 'completed' ? 'completed' : ''} ${f.status === 'error' ? 'failed' : ''}" id="frame-card-${idx}">
        <div class="frame-card-header">
          <div class="frame-id-row">
            <span class="frame-num">Frame #${f.frame_number}</span>
            <span class="continuity-badge ${f.continuity}">
              ${f.continuity === 'continue' ? '🔗 Continue (Chains Frame #' + (f.frame_number - 1) + ')' : '📍 Anchor (New Scene)'}
            </span>
          </div>
          <span class="badge ${f.status === 'completed' ? 'badge-verified' : f.status === 'error' ? 'badge-missing' : ''}" id="frame-status-${idx}">
            ${f.status === 'generating' ? 'Generating ' + f.progress + '%' : f.status.toUpperCase()}
          </span>
        </div>

        ${f.verbatim_script ? `
          <div class="frame-content-block frame-verbatim-block">
            <div class="frame-content-label">🎙 Verbatim Script</div>
            <div class="frame-verbatim-script">${escapeHtml(f.verbatim_script)}</div>
          </div>
        ` : ''}
        <div class="frame-content-block">
          <div class="frame-content-label">🖼 Image Prompt</div>
          <div class="frame-prompt-text" id="frame-prompt-${idx}" title="Click Edit Prompt to customize">${escapeHtml(f.prompt)}</div>
        </div>

        ${f.formatted_reference_guidance ? `
          <div class="frame-guidance-container" style="margin: 6px 0; padding: 6px 8px; background: rgba(0,0,0,0.03); border-left: 3px solid #1a73e8; border-radius: 4px; font-size: 10px; color: var(--text-secondary, #555);">
            <div style="font-weight: 600; color: #1a73e8; margin-bottom: 2px;">📌 Reference Guidance (Appended automatically during generation)</div>
            <div style="white-space: pre-wrap; font-family: monospace; font-size: 9.5px; line-height: 1.35; max-height: 80px; overflow-y: auto;">${escapeHtml(f.formatted_reference_guidance)}</div>
          </div>
        ` : ''}

        <div class="frame-tile-title-row">
          <span class="flow-title-label">🏷 Flow Title:</span>
          <span class="flow-title-val" id="flow-title-val-${idx}" data-index="${idx}" title="Click to manually edit Flow title mapping" contenteditable="true">${escapeHtml(flowTitle)}</span>
        </div>

        ${hasRef ? `
          <div class="frame-ref-indicator">
            <span>🔗 Ref:</span> <code>${escapeHtml(refLabel)}</code>
            ${refTitle ? `<span class="mapped-arrow">➔</span> <span class="mapped-flow-name">"${escapeHtml(refTitle)}"</span>` : ''}
          </div>
        ` : ''}

        <div class="frame-preview-container" id="frame-img-box-${idx}" style="display: ${f.result_url ? 'block' : 'none'};">
          <img src="${escapeAttr(f.result_url || '')}" class="frame-preview-img" id="frame-img-${idx}" alt="Frame ${f.frame_number}" />
        </div>

        <div class="frame-footer">
          <span style="color: var(--text-muted); font-family: monospace;">${escapeHtml(f.target_filename)}</span>
          <div class="frame-actions">
            <button class="btn btn-secondary btn-xs btn-edit-prompt" data-index="${idx}">✏️ Edit</button>
            <button class="btn btn-secondary btn-xs btn-regen-frame" data-index="${idx}" ${pipelineRunning || activeRerollIndex !== null ? 'disabled' : ''}>🔄 Re-roll</button>
            <button class="btn btn-secondary btn-xs btn-revert-frame" data-index="${idx}" title="Restore the image used before the latest re-roll" style="display: ${f.reroll_previous ? 'inline-block' : 'none'};" ${pipelineRunning || activeRerollIndex !== null ? 'disabled' : ''}>↩ Revert</button>
            <button class="btn btn-secondary btn-xs btn-download-frame" data-index="${idx}" style="display: ${f.result_url ? 'inline-block' : 'none'};" ${activeFrameDownloads.has(idx) ? 'disabled' : ''}>⬇</button>
          </div>
        </div>

        ${f.status === 'generating' ? `
          <div class="progress-bar-container">
            <div class="progress-bar-fill" id="frame-prog-${idx}" style="width: ${f.progress}%;"></div>
          </div>
        ` : ''}
      </div>
    `;
    }).join('');
  }

  function setActiveSpecTab(tabName) {
    if (!['control', 'settings', 'debug'].includes(tabName)) return;
    activeSpecTab = tabName;
    document.querySelectorAll('.spec-view-tab').forEach(button => {
      const isActive = button.dataset.specTab === tabName;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('.spec-view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.specPanel === tabName);
    });
    if (tabName === 'debug') renderDebugLog();
  }

  function attachDashboardEvents() {
    const btnReset = document.getElementById('btn-reset-spec');
    const btnExport = document.getElementById('btn-export-mapping');
    const btnStart = document.getElementById('btn-start-pipeline');
    const btnPause = document.getElementById('btn-pause-pipeline');
    const btnRecheck = document.getElementById('btn-recheck-chars');
    const btnDownloadAll = document.getElementById('btn-download-all');
    const collectionUrlInput = document.getElementById('collection-url-input');
    const btnUseOpenFlow = document.getElementById('btn-use-open-flow');
    const maxParallelInput = document.getElementById('max-parallel-generations');
    const aspectRatioInput = document.getElementById('spec-aspect-ratio');
    const btnCopyDebugLog = document.getElementById('btn-copy-debug-log');
    const btnClearDebugLog = document.getElementById('btn-clear-debug-log');

    document.querySelectorAll('.spec-view-tab').forEach(button => {
      button.addEventListener('click', () => setActiveSpecTab(button.dataset.specTab));
    });

    if (maxParallelInput) {
      maxParallelInput.addEventListener('change', () => {
        const normalized = pipelineConcurrency.normalizeMaxParallel(maxParallelInput.value);
        currentSpec.max_parallel_generations = normalized;
        maxParallelInput.value = String(normalized);
        savePipelineMapping();
      });
    }

    if (aspectRatioInput) {
      aspectRatioInput.addEventListener('change', () => {
        currentSpec.default_aspect_ratio = aspectRatioInput.value || '16:9';
        savePipelineMapping();
        log('Aspect ratio changed to', currentSpec.default_aspect_ratio);
      });
    }

    if (btnCopyDebugLog) {
      btnCopyDebugLog.addEventListener('click', () => {
        navigator.clipboard.writeText(getDebugLogText()).catch(() => {});
      });
    }

    if (btnClearDebugLog) {
      btnClearDebugLog.addEventListener('click', () => {
        debugEntries.length = 0;
        renderDebugLog();
      });
    }

    if (collectionUrlInput) {
      collectionUrlInput.addEventListener('change', () => saveCollectionDestination(collectionUrlInput.value));
      collectionUrlInput.addEventListener('blur', () => saveCollectionDestination(collectionUrlInput.value));
    }
    if (btnUseOpenFlow) {
      btnUseOpenFlow.addEventListener('click', captureOpenFlowDestination);
    }

    if (btnExport) {
      btnExport.addEventListener('click', exportMappingFile);
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        savePipelineMapping();
        currentSpec = null;
        renderUploadScreen();
      });
    }

    if (btnStart) btnStart.addEventListener('click', startPipeline);
    if (btnPause) btnPause.addEventListener('click', pausePipeline);
    if (btnRecheck) btnRecheck.addEventListener('click', checkFlowCharacters);
    if (btnDownloadAll) btnDownloadAll.addEventListener('click', downloadAllCompleted);

    const btnSyncTiles = document.getElementById('btn-sync-tiles');
    if (btnSyncTiles) btnSyncTiles.addEventListener('click', syncFlowProjectTiles);

    document.querySelectorAll('.flow-title-val').forEach(el => {
      el.addEventListener('blur', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const newTitle = e.target.innerText.trim();
        if (currentSpec && currentSpec.visuals && currentSpec.visuals[idx]) {
          currentSpec.visuals[idx].flow_tile_title = newTitle;
          registerLocalFrameTitle(currentSpec.visuals[idx].target_filename, newTitle);
          if (currentSpec.visuals[idx].id) {
            registerLocalFrameTitle(currentSpec.visuals[idx].id, newTitle);
          }
          savePipelineMapping();
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      });
    });

    const btnCreateMissing = document.getElementById('btn-create-missing-chars');
    if (btnCreateMissing) btnCreateMissing.addEventListener('click', createAllMissingCharacters);

    document.querySelectorAll('.btn-create-char').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const charId = e.target.dataset.id;
        createSingleCharacter(charId);
      });
    });

    document.querySelectorAll('.btn-copy-prompt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const charId = e.target.dataset.id;
        const c = currentSpec?.characters?.find(item => item.id === charId);
        if (c) {
          const promptText = c.prompt || c.description || '';
          navigator.clipboard.writeText(promptText).then(() => {
            const originalText = e.target.innerText;
            e.target.innerText = '✓ Copied!';
            e.target.style.color = '#34a853';
            setTimeout(() => {
              e.target.innerText = originalText;
              e.target.style.color = '';
            }, 1800);
          }).catch(() => {
            const el = document.getElementById(`char-prompt-text-${charId}`);
            if (el) {
              const range = document.createRange();
              range.selectNodeContents(el);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('copy');
              e.target.innerText = '✓ Copied!';
              setTimeout(() => { e.target.innerText = '📋 Copy Prompt'; }, 1800);
            }
          });
        }
      });
    });

    document.querySelectorAll('.btn-edit-prompt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        toggleEditPrompt(idx, e.target);
      });
    });

    document.querySelectorAll('.btn-regen-frame').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        regenerateSingleFrame(idx);
      });
    });

    document.querySelectorAll('.btn-revert-frame').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        revertFrameReroll(idx);
      });
    });

    document.querySelectorAll('.btn-download-frame').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        downloadSingleFrame(idx);
      });
    });
  }

  function setCollectionDestinationStatus(message, isError = false, isSuccess = false) {
    const status = document.getElementById('collection-destination-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
    status.classList.toggle('success', isSuccess);
  }

  function saveCollectionDestination(value, tabId = null) {
    if (!currentSpec) return false;
    const input = document.getElementById('collection-url-input');
    const raw = String(value || '').trim();
    const normalized = flowDestination.normalizeFlowUrl(raw);

    if (raw && !normalized) {
      setCollectionDestinationStatus('Enter an HTTPS URL from flow.google.com.', true);
      return false;
    }

    if (currentSpec.collection_url !== normalized) {
      currentSpec.collection_tab_id = null;
    }
    currentSpec.collection_url = normalized;
    if (Number.isInteger(tabId)) {
      currentSpec.collection_tab_id = tabId;
    }
    if (input) input.value = normalized;
    setCollectionDestinationStatus(
      normalized
        ? 'Generation is locked to this Flow page.'
        : 'Optional: leave empty to use the currently open Flow project page.'
    );
    savePipelineMapping();
    return true;
  }

  function queryFlowTabs(query = {}) {
    return new Promise(resolve => {
      chrome.tabs.query(
        Object.assign({ url: ['https://flow.google.com/*'] }, query),
        tabs => resolve(tabs || [])
      );
    });
  }

  function getTab(tabId) {
    return new Promise(resolve => {
      chrome.tabs.get(tabId, tab => {
        const error = chrome.runtime?.lastError;
        resolve(error ? null : tab);
      });
    });
  }

  async function waitForFlowTab(tabId, expectedUrl, timeoutMs = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const tab = await getTab(tabId);
      if (
        tab &&
        tab.status === 'complete' &&
        (!expectedUrl || flowDestination.isSameFlowUrl(tab.url, expectedUrl))
      ) {
        return tab;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('Timed out while loading the configured Google Flow collection.');
  }

  function updateTabUrl(tabId, url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, { url, active: true }, tab => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(tab);
      });
    });
  }

  function createFlowTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url, active: true }, tab => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(tab);
      });
    });
  }

  async function getFlowTargetTab() {
    const rawUrl = String(currentSpec?.collection_url || '').trim();
    const expectedUrl = flowDestination.normalizeFlowUrl(rawUrl);
    if (rawUrl && !expectedUrl) {
      throw new Error('The collection URL must be an HTTPS URL from flow.google.com.');
    }

    if (Number.isInteger(currentSpec?.collection_tab_id)) {
      const boundTab = await getTab(currentSpec.collection_tab_id);
      if (
        boundTab &&
        flowDestination.normalizeFlowUrl(boundTab.url) &&
        (!expectedUrl || flowDestination.isSameFlowUrl(boundTab.url, expectedUrl))
      ) {
        return boundTab;
      }
      currentSpec.collection_tab_id = null;
    }

    const tabs = await queryFlowTabs();
    const selected = flowDestination.chooseFlowTab(tabs, expectedUrl);

    if (!expectedUrl) {
      if (!selected) throw new Error('Google Flow is not open. Open flow.google.com and try again.');
      return selected;
    }

    if (selected && flowDestination.isSameFlowUrl(selected.url, expectedUrl)) {
      currentSpec.collection_tab_id = selected.id;
      return selected;
    }

    if (selected) {
      currentSpec.collection_tab_id = selected.id;
      await updateTabUrl(selected.id, expectedUrl);
      return waitForFlowTab(selected.id, expectedUrl);
    }

    const created = await createFlowTab(expectedUrl);
    currentSpec.collection_tab_id = created.id;
    return waitForFlowTab(created.id, expectedUrl);
  }

  async function captureOpenFlowDestination() {
    const activeTabs = await queryFlowTabs({ active: true, currentWindow: true });
    const allTabs = activeTabs.length ? activeTabs : await queryFlowTabs();
    const selected = flowDestination.chooseFlowTab(allTabs, '');
    if (!selected) {
      setCollectionDestinationStatus('Open your manually created collection in Google Flow first.', true);
      return;
    }

    const input = document.getElementById('collection-url-input');
    const button = document.getElementById('btn-use-open-flow');
    if (input) input.value = selected.url;
    saveCollectionDestination(selected.url, selected.id);
    setCollectionDestinationStatus(
      '✓ Open Flow page captured. New images will be generated in this tab.',
      false,
      true
    );
    if (button) {
      button.textContent = '✓ Flow page selected';
      button.classList.add('confirmed');
    }
  }

  async function sendToFlowTab(message, callback) {
    let response;
    try {
      const targetTab = await getFlowTargetTab();
      response = await new Promise(resolve => {
        chrome.tabs.sendMessage(targetTab.id, message, result => {
          const error = chrome.runtime?.lastError;
          if (error) {
            console.warn('[SpecPipeline] Flow tab message error:', error.message);
            resolve({ success: false, error: error.message });
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      response = { success: false, error: error.message };
    }

    if (callback) callback(response);
    return response;
  }

  async function scanFlowTilesForReroll() {
    const response = await sendToFlowTab({ type: 'SCAN_PROJECT_TILES' });
    return Array.isArray(response?.tiles) ? response.tiles : [];
  }

  function replaceDownloadedFrame(frame) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_RESOURCE',
        url: frame.result_url,
        filename: frame.target_filename,
        folder: currentSpec.output_folder,
        autoChangeFileName: true
      }, response => {
        const error = chrome.runtime?.lastError;
        if (error || !response?.success) {
          log('Fallback re-roll download failed:', error?.message || response?.error || frame.target_filename);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  async function mapRerollFromNewFlowTile(frame, promptIndex, beforeTiles, captureToken) {
    const afterTiles = await scanFlowTilesForReroll();
    const newTile = rerollTileFallback.chooseNewTile(beforeTiles, afterTiles);
    if (!newTile?.imgSrc) {
      log('Re-roll fallback could not identify a new Flow tile for Frame #' + frame.frame_number);
      return false;
    }

    const mapped = applyCapturedFrameImage({
      type: 'SPEC_FRAME_IMAGE_CAPTURED',
      promptIndex,
      mediaUrl: newTile.imgSrc,
      filename: frame.target_filename,
      tileTitle: newTile.title || frame.target_filename,
      captureToken
    });
    if (!mapped) return false;

    await replaceDownloadedFrame(frame);
    log('Re-roll mapped from the newly detected Flow tile:', {
      frame: frame.frame_number,
      tileTitle: newTile.title || ''
    });
    return true;
  }

function createSingleCharacter(charId) {
    if (!currentSpec) return;
    const c = currentSpec.characters.find(item => item.id === charId);
    if (!c) return;

    c.status = 'creating';
    const badge = document.getElementById(`char-badge-${c.id}`);
    if (badge) {
      badge.className = 'badge badge-missing';
      badge.innerText = '⏳ Creating in Flow...';
    }

    sendToFlowTab({
      type: 'CREATE_FLOW_CHARACTER',
      data: {
        name: c.name,
        prompt: c.prompt || c.description || '',
        refImageName: c.reference_image
      }
    }, (res) => {
      const err = chrome.runtime?.lastError;
      if (err || (res && !res.success)) {
        const errMsg = err?.message || res?.error || 'Unknown error';
        console.warn('[SpecPipeline] CREATE_FLOW_CHARACTER error:', errMsg);
        c.status = 'missing';
        const b = document.getElementById(`char-badge-${c.id}`);
        if (b) {
          b.className = 'badge badge-missing';
          b.innerText = '⚠️ Missing in Flow';
        }
        alert('Failed to create character in Flow: ' + errMsg);
        return;
      }
      if (res && res.success) {
        c.status = 'verified';
        const b = document.getElementById(`char-badge-${c.id}`);
        if (b) {
          b.className = 'badge badge-verified';
          b.innerText = '✓ Registered in Flow';
        }
        const btn = document.querySelector(`.btn-create-char[data-id="${c.id}"]`);
        if (btn) btn.style.display = 'none';
        savePipelineMapping();
      }
    });
  }

  async function createAllMissingCharacters() {
    if (!currentSpec) return;
    const missing = currentSpec.characters.filter(c => c.status !== 'verified');
    if (missing.length === 0) {
      alert('All characters are already verified in Google Flow!');
      return;
    }
    for (const c of missing) {
      await new Promise(r => {
        c.status = 'creating';
        const badge = document.getElementById(`char-badge-${c.id}`);
        if (badge) {
          badge.className = 'badge badge-missing';
          badge.innerText = '⏳ Creating in Flow...';
        }
        sendToFlowTab({
          type: 'CREATE_FLOW_CHARACTER',
          data: {
            name: c.name,
            prompt: c.prompt || c.description || '',
            refImageName: c.reference_image
          }
        }, (res) => {
          const err = chrome.runtime?.lastError;
          if (err || (res && !res.success)) {
            console.warn('[SpecPipeline] CREATE_FLOW_CHARACTER error:', err?.message || res?.error);
            c.status = 'missing';
            const b = document.getElementById(`char-badge-${c.id}`);
            if (b) {
              b.className = 'badge badge-missing';
              b.innerText = '⚠️ Missing in Flow';
            }
            r();
            return;
          }
          if (res && res.success) {
            c.status = 'verified';
            const b = document.getElementById(`char-badge-${c.id}`);
            if (b) {
              b.className = 'badge badge-verified';
              b.innerText = '✓ Registered in Flow';
            }
            const btn = document.querySelector(`.btn-create-char[data-id="${c.id}"]`);
            if (btn) btn.style.display = 'none';
          }
          r();
        });
      });
      await new Promise(r => setTimeout(r, 1500));
    }
    savePipelineMapping();
  }

  function toggleEditPrompt(idx, btnEl) {
    const promptEl = document.getElementById(`frame-prompt-${idx}`);
    if (!promptEl) return;

    const isEditing = promptEl.getAttribute('contenteditable') === 'true';
    if (isEditing) {
      promptEl.setAttribute('contenteditable', 'false');
      btnEl.innerText = '✏️ Edit';
      currentSpec.visuals[idx].prompt = promptEl.innerText.trim();
      savePipelineMapping();
    } else {
      promptEl.setAttribute('contenteditable', 'true');
      promptEl.focus();
      btnEl.innerText = '💾 Save';
    }
  }

  async function syncFlowProjectTiles() {
    const response = await sendToFlowTab({ type: 'SCAN_PROJECT_TILES' });

      if (!response || !Array.isArray(response.tiles) || !currentSpec) {
        alert('No tiles found or unable to communicate with Google Flow tab.\n\nPlease ensure your Google Flow project tab is open and refreshed.');
        return;
      }
      const tiles = response.tiles;
      let matchedCount = 0;

      currentSpec.visuals.forEach((v) => {
        if (v.flow_tile_title && !/^(frame_\d+\.png|test_frame_\d+\.png)$/i.test(v.flow_tile_title)) {
          registerLocalFrameTitle(v.target_filename, v.flow_tile_title);
          return;
        }

        const promptLower = (v.prompt || '').toLowerCase();
        const matchedTile = tiles.find(t => {
          const cleanT = t.title.replace(/(\u2026|\.{3})$/, '').toLowerCase().trim();
          return cleanT.length > 5 && promptLower.includes(cleanT);
        });

        if (matchedTile) {
          v.flow_tile_title = matchedTile.title;
          registerLocalFrameTitle(v.target_filename, matchedTile.title);
          if (matchedTile.imgSrc && !v.result_url) {
            v.result_url = matchedTile.imgSrc;
            v.status = 'completed';
            v.progress = 100;
          }
          matchedCount++;
        }
      });

      updateProjectStats();
      updateUIStatus();
      renderPipelineDashboard();
      savePipelineMapping();
      alert(`Synced with Flow! ${matchedCount} tile title(s) mapped.`);
  }

  function checkFlowCharacters() {
    sendToFlowTab({ type: 'SCAN_CHARACTERS' }, (res) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        console.warn('[SpecPipeline] checkFlowCharacters error:', err.message);
        return;
      }
      const registered = (res && Array.isArray(res.characters)) ? res.characters : [];
      if (!currentSpec || registered.length === 0) return;

      currentSpec.characters.forEach(c => {
        const cleanName = c.name.replace(/^@/, '').toLowerCase().replace(/[\s_-]+/g, '');
        const found = registered.some(r => {
          const normR = r.toLowerCase().replace(/[\s_-]+/g, '');
          return normR.includes(cleanName) || cleanName.includes(normR);
        });
        c.status = found ? 'verified' : 'missing';

        const badge = document.getElementById(`char-badge-${c.id}`);
        if (badge) {
          badge.className = `badge ${found ? 'badge-verified' : 'badge-missing'}`;
          badge.innerText = found ? '✓ Registered in Flow' : '⚠️ Missing in Flow';
        }
        const btn = document.querySelector(`.btn-create-char[data-id="${c.id}"]`);
        if (btn) {
          btn.style.display = found ? 'none' : 'inline-block';
        }
      });
      savePipelineMapping();
    });
  }

  function prepareFrameGeneration(promptIndex) {
    const frame = currentSpec.visuals[promptIndex];
    frame.status = 'generating';
    frame.progress = 5;
    frame.error = null;
    frame.capture_conflict = null;
    activeFrameIndex = promptIndex;
    updateFrameCard(promptIndex);

    const refImages = [];
    const refFrameVisual = resolveReferencedVisual(frame, promptIndex);
    const resolvedRefTitle = resolveFlowTileTitleForFrame(frame, promptIndex);

    if (refFrameVisual) {
      const refNameForFlow = resolvedRefTitle || refFrameVisual.target_filename;
      if (refFrameVisual.result_url) {
        refImages.push({ name: refNameForFlow, base64: refFrameVisual.result_url });
      } else if (refFrameVisual.target_filename) {
        refImages.push({ name: refNameForFlow, referenceExistingOnly: true });
      }
    }

    frame.prompt = frame.prompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
    frame.formatted_reference_guidance = formatReferenceGuidance(frame, promptIndex);
    return { frame, refImages, promptIndex };
  }

  function applyFrameGenerationResult(promptIndex, success, error = null) {
    const frame = currentSpec?.visuals?.[promptIndex];
    if (!frame) return false;
    const effectiveSuccess = success && !frame.capture_conflict;
    frame.status = effectiveSuccess ? 'completed' : 'error';
    frame.progress = effectiveSuccess ? 100 : frame.progress;
    frame.completed_at = effectiveSuccess ? new Date().toISOString() : null;
    frame.error = effectiveSuccess
      ? null
      : (frame.capture_conflict || error || 'Generation failed');
    updateFrameCard(promptIndex);
    return effectiveSuccess;
  }

  function resetFrameToPending(promptIndex) {
    const frame = currentSpec?.visuals?.[promptIndex];
    if (!frame) return;
    frame.status = 'pending';
    frame.progress = 0;
    frame.completed_at = null;
    frame.error = null;
    frame.capture_conflict = null;
    updateFrameCard(promptIndex);
  }

  function executeIndependentFrameBatch(promptIndexes) {
    return new Promise(resolve => {
      const items = promptIndexes.map(prepareFrameGeneration);
      const payloads = items.map(item => ({
        ...buildFrameGenerationPayload(item.frame, item.refImages, item.promptIndex),
        deferGenerationWait: true
      }));
      const maxParallel = pipelineConcurrency.normalizeMaxParallel(
        currentSpec.max_parallel_generations
      );
      const groupId = 'spec-parallel-' + Date.now();
      const timeoutMs = Math.max(
        300000,
        Math.ceil(payloads.length / maxParallel) * 300000
      );
      let timeoutHandle = null;
      let settled = false;

      const finish = (status, results = [], fallbackError = null) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        chrome.runtime.onMessage.removeListener(listener);
        if (activeGenerationGroupId === groupId) activeGenerationGroupId = null;

        const resultMap = new Map(
          results.map(result => [result.promptIndex, result])
        );
        items.forEach(item => {
          const result = resultMap.get(item.promptIndex);
          if (status === 'paused' && !result) {
            resetFrameToPending(item.promptIndex);
            return;
          }
          const itemSuccess = result?.success === true;
          applyFrameGenerationResult(
            item.promptIndex,
            itemSuccess,
            result?.error || fallbackError
          );
        });
        updateProjectStats();
        savePipelineMapping();
        const completedResultsSucceeded = [...resultMap.values()].every(result =>
          result.success === true && !currentSpec.visuals[result.promptIndex]?.capture_conflict
        );
        resolve({
          success: (status === 'completed' || status === 'paused') && completedResultsSucceeded,
          paused: status === 'paused'
        });
      };

      const listener = msg => {
        if (msg.type === 'VIDEO_GENERATION_PROGRESS' && msg.data?.groupId === groupId) {
          const promptIndex = Number(msg.data.promptIndex);
          const frame = currentSpec?.visuals?.[promptIndex];
          if (frame) {
            frame.progress = msg.data.percentage || frame.progress;
            updateFrameCard(promptIndex);
          }
        }

        if (msg.type === 'PROMPT_GROUP_STATUS' && msg.data?.id === groupId) {
          const status = msg.data.status;
          if (status === 'completed' || status === 'paused' || status === 'error' || status === 'cancelled') {
            finish(
              status,
              Array.isArray(msg.data.results) ? msg.data.results : [],
              status === 'cancelled' ? 'Generation cancelled' : 'Parallel generation failed'
            );
          }
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      activeGenerationGroupId = groupId;

      getFlowTargetTab().then(targetTab => {
        if (pipelineRunning && pipelinePaused) {
          finish('paused', []);
          return;
        }
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'AUTO_FILL_FLOW',
          payloads,
          groupId,
          concurrentPrompts: maxParallel,
          promptDelaySecondsMin: 2,
          promptDelaySecondsMax: 3
        }, response => {
          const error = chrome.runtime?.lastError;
          if (error || !response?.success) {
            finish('error', [], error?.message || response?.error || 'Flow rejected the parallel batch');
            return;
          }

          log('Submitted independent frames with max active generations:', maxParallel);
          timeoutHandle = setTimeout(() => {
            finish('error', [], 'Parallel generation timed out');
          }, timeoutMs);
        });
      }).catch(error => {
        finish('error', [], error.message);
      });
    });
  }

  async function generateDependentFrame(promptIndex) {
    const item = prepareFrameGeneration(promptIndex);
    if (pipelinePaused || !pipelineRunning) {
      resetFrameToPending(promptIndex);
      return null;
    }

    let success = false;
    try {
      success = await executeFrameGeneration(
        item.frame,
        item.refImages,
        promptIndex
      );
    } catch (error) {
      item.frame.error = error?.message || String(error);
    }

    if (success === null) {
      resetFrameToPending(promptIndex);
      updateProjectStats();
      savePipelineMapping();
      return null;
    }

    const appliedSuccess = applyFrameGenerationResult(
      promptIndex,
      success,
      item.frame.error || 'Generation failed after configured retries'
    );
    updateProjectStats();
    savePipelineMapping();
    return appliedSuccess;
  }

  // Dependency-aware generation with parallel independent submissions
  async function startPipeline() {
    if (!currentSpec || pipelineRunning || activeRerollIndex !== null) return;

    const collectionInput = document.getElementById('collection-url-input');
    if (collectionInput && !saveCollectionDestination(collectionInput.value)) {
      alert('Enter a valid Google Flow collection URL before starting.');
      return;
    }

    try {
      await getFlowTargetTab();
    } catch (error) {
      setCollectionDestinationStatus(error.message, true);
      alert(error.message);
      return;
    }

    pipelineRunning = true;
    pipelinePaused = false;

    updateUIStatus();

    const executionPlan = pipelineConcurrency.buildExecutionPlan(currentSpec.visuals);

    for (const step of executionPlan) {
      if (pipelinePaused || !pipelineRunning) break;

      if (step.type === 'independent') {
        const pendingIndexes = step.indexes.filter(
          index => currentSpec.visuals[index].status !== 'completed'
        );
        if (pendingIndexes.length === 0) continue;

        const outcome = await executeIndependentFrameBatch(pendingIndexes);
        if (outcome.paused) {
          log('Pause completed after active independent generations were mapped.');
          break;
        }
        if (!outcome.success) {
          pipelinePaused = true;
          log('Independent generation batch stopped because one or more frames failed.');
        }
        continue;
      }

      const promptIndex = step.index;
      const frame = currentSpec.visuals[promptIndex];
      if (frame.status === 'completed') continue;

      const dependency = resolveReferencedVisual(frame, promptIndex);
      if (!dependency || dependency.status !== 'completed') {
        applyFrameGenerationResult(
          promptIndex,
          false,
          dependency
            ? 'Referenced frame did not complete successfully'
            : 'Referenced frame was not found'
        );
        pipelinePaused = true;
        log('Dependent frame blocked:', frame.id || promptIndex);
        break;
      }

      const success = await generateDependentFrame(promptIndex);
      if (success === null) {
        log('Pause completed after the active dependent generation was handled.');
        break;
      }
      if (!success) {
        pipelinePaused = true;
        log('Dependent generation stopped after a frame failure.');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    pipelineRunning = false;
    updateUIStatus();
    log(pipelinePaused ? 'Pipeline paused' : 'Pipeline finished');
    savePipelineMapping();
  }

  function pausePipeline() {
    if (!pipelineRunning || pipelinePaused) return;
    pipelinePaused = true;
    log('Pause requested. Finishing and mapping active generations before stopping.');

    if (activeGenerationGroupId) {
      const groupId = activeGenerationGroupId;
      sendToFlowTab({ type: 'PAUSE_PROMPT_GROUP', groupId }).catch(error => {
        log('Could not send graceful pause request:', error?.message || String(error));
      });
    }

    updateUIStatus();
    savePipelineMapping();
  }

  async function waitForRerollMapping(frame, timeoutMs = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (frame.reroll_previous || !frame.reroll_pending_previous) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  async function regenerateSingleFrame(idx) {
    if (!currentSpec || pipelineRunning || activeRerollIndex !== null) return;

    const collectionInput = document.getElementById('collection-url-input');
    if (collectionInput && !saveCollectionDestination(collectionInput.value)) {
      alert('Enter a valid Google Flow collection URL before generating.');
      return;
    }

    const frame = currentSpec.visuals[idx];
    if (!frame) return;
    activeRerollIndex = idx;
    updateUIStatus();

    try {
      await getFlowTargetTab();
    } catch (error) {
      activeRerollIndex = null;
      updateUIStatus();
      setCollectionDestinationStatus(error.message, true);
      alert(error.message);
      return;
    }

    const rerollTilesBefore = await scanFlowTilesForReroll();
    frame.reroll_in_progress = Boolean(rerollHistory.begin(frame));
    frame.status = 'generating';
    frame.progress = 5;
    frame.error = null;
    frame.capture_conflict = null;
    updateFrameCard(idx);
    updateUIStatus();

    let refImages = [];
    let refFrameVisual = null;
    if (frame.frame_reference) {
      const cleanRef = String(frame.frame_reference).replace(/\(.*?\)/g, '').trim();
      refFrameVisual = currentSpec.visuals.find(v => 
        v.id === cleanRef || 
        v.target_filename === cleanRef || 
        v.target_filename === `${cleanRef}.png` ||
        (v.frame_number && String(v.frame_number) === cleanRef) ||
        (v.frame_number && `frame_${String(v.frame_number).padStart(3, '0')}` === cleanRef)
      );
    } else if (frame.continuity === 'continue' && idx > 0) {
      refFrameVisual = currentSpec.visuals[idx - 1];
    }

    const resolvedRefTitle = resolveFlowTileTitleForFrame(frame, idx);

    if (refFrameVisual) {
      const refNameForFlow = resolvedRefTitle || refFrameVisual.target_filename;
      if (refFrameVisual.result_url) {
        refImages.push({
          name: refNameForFlow,
          base64: refFrameVisual.result_url
        });
      } else {
        refImages.push({
          name: refNameForFlow,
          referenceExistingOnly: true
        });
      }
    }

    frame.prompt = frame.prompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
    frame.formatted_reference_guidance = formatReferenceGuidance(frame, idx);

    try {
      const captureToken = `reroll-${Date.now()}-${idx}`;
      frame.reroll_capture_token = captureToken;
      let ok = await executeFrameGeneration(frame, refImages, idx, {
        maxRetries: 0,
        captureToken
      });
      if (!ok && frame.reroll_previous && !frame.reroll_pending_previous) {
        ok = true;
      }
      if (!ok && frame.reroll_pending_previous) {
        log('Primary re-roll mapping was unavailable; scanning Flow for the newly added tile.');
        ok = await mapRerollFromNewFlowTile(
          frame,
          idx,
          rerollTilesBefore,
          captureToken
        );
      }
      if (ok && frame.reroll_pending_previous) {
        log('Re-roll generation finished; waiting for image mapping:', frame.frame_number);
        ok = await waitForRerollMapping(frame);
      }
      applyFrameGenerationResult(
        idx,
        ok,
        ok ? null : 'Re-roll image mapping was not received; the previous image was kept.'
      );
    } catch (err) {
      applyFrameGenerationResult(idx, false, err?.message || String(err));
    }

    if (frame.reroll_pending_previous && frame.result_url) {
      frame.status = 'completed';
      frame.progress = 100;
      frame.completed_at = frame.reroll_pending_previous.completed_at || frame.completed_at;
      frame.error = 'Re-roll failed; the previous image was kept.';
    }
    rerollHistory.cancel(frame);
    frame.reroll_in_progress = false;
    delete frame.reroll_capture_token;
    activeRerollIndex = null;
    updateFrameCard(idx);
    updateUIStatus();
    updateProjectStats();
    savePipelineMapping();
  }

  function revertFrameReroll(idx) {
    if (!currentSpec || pipelineRunning || activeRerollIndex !== null) return;
    const frame = currentSpec.visuals[idx];
    if (!rerollHistory.restore(frame)) return;

    if (frame.flow_tile_title) {
      registerLocalFrameTitle(frame.target_filename, frame.flow_tile_title);
      registerLocalFrameTitle(frame.id, frame.flow_tile_title);
      registerLocalFrameTitle(String(frame.frame_number), frame.flow_tile_title);
      registerLocalFrameTitle(`frame_${String(frame.frame_number).padStart(3, '0')}`, frame.flow_tile_title);
    }
    for (let k = idx + 1; k < currentSpec.visuals.length; k++) {
      const nextFrame = currentSpec.visuals[k];
      const cleanRef = String(nextFrame.frame_reference || '').replace(/\(.*?\)/g, '').trim();
      if (cleanRef === frame.target_filename ||
          cleanRef === frame.id ||
          cleanRef === `${frame.id}.png` ||
          (nextFrame.continuity === 'continue' && k === idx + 1)) {
        nextFrame.formatted_reference_guidance = formatReferenceGuidance(nextFrame, k);
        updateFrameCard(k);
      }
    }
    updateFrameCard(idx);
    updateProjectStats();
    savePipelineMapping();
    downloadSingleFrame(idx);
  }

  function buildFrameGenerationPayload(frame, refImages, promptIndex) {
    const safeRefImages = Array.isArray(refImages) ? [...refImages] : [];
    const rawCharRefs = (Array.isArray(frame.character_references) ? frame.character_references : [])
      .map(c => (typeof c === 'string' ? c : (c.tag || c.name || c.id || '')).replace(/^@/, '').trim())
      .filter(Boolean);

    const resolvedCharRefs = resolveCharacterReferenceLabels(rawCharRefs, currentSpec?.characters || []);
    const declaredCharRefs = resolvedCharRefs.length > 0 ? resolvedCharRefs : rawCharRefs;
    const knownCharNames = new Set(
      (currentSpec?.characters || []).flatMap(c => [
        c.id, c.name, (c.flow_tag || '').replace(/^@/, '')
      ]).filter(Boolean).map(s => s.toLowerCase().replace(/[\s_-]+/g, ''))
    );
    const cleanChars = [...new Set(declaredCharRefs)];

    const otherRefs = [
      ...(Array.isArray(frame.style_references) ? frame.style_references : []),
      ...(Array.isArray(frame.image_references) ? frame.image_references : [])
    ].map(c => (
      typeof c === 'string' ? c : (c.tag || c.name || c.id || '')
    ).replace(/^@/, '').trim()).filter(Boolean);

    otherRefs.forEach(ref => {
      const norm = ref.toLowerCase().replace(/[\s_-]+/g, '');
      if (knownCharNames.has(norm)) {
        if (!cleanChars.includes(ref)) cleanChars.push(ref);
      } else if (!safeRefImages.some(img => img.name === ref) && !cleanChars.includes(ref)) {
        safeRefImages.push({ name: ref, referenceExistingOnly: true });
      }
    });

    const rawPrompt = (frame.prompt || '').trim();
    const cleanBase = rawPrompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
    const guidance = formatReferenceGuidance(frame, promptIndex);
    frame.formatted_reference_guidance = guidance;
    const finalPrompt = guidance ? cleanBase + '\n\n' + guidance : cleanBase;

    return {
      prompt: finalPrompt,
      basePrompt: cleanBase,
      referenceGuidance: guidance,
      targetFilename: frame.target_filename,
      mode: currentSpec.generation_mode || 'textToImage',
      aspectRatio: currentSpec.default_aspect_ratio || '16:9',
      model: IMAGE_MODEL,
      outputCount: 1,
      singleResourceOnly: true,
      autoDownloadResourceQuality: 'original',
      folderName: currentSpec.output_folder || 'ancient_humans_scenes',
      referenceFolder: currentSpec.reference_folder || 'Branded_references',
      autoChangeFileName: true,
      maxRetries: currentSpec.max_retries || currentSpec.global_settings?.max_retries || 3,
      promptIndex,
      images: safeRefImages,
      characters: cleanChars
    };
  }

  function executeFrameGeneration(frame, refImages, promptIndex, options = {}) {
    return new Promise((resolve) => {
      const payload = buildFrameGenerationPayload(frame, refImages, promptIndex);
      if (Number.isInteger(options.maxRetries)) {
        payload.maxRetries = Math.max(0, options.maxRetries);
      }
      if (options.captureToken) {
        payload.captureToken = options.captureToken;
      }

      getFlowTargetTab().then(targetTab => {
        if (pipelineRunning && pipelinePaused) {
          resolve(null);
          return;
        }
        const groupId = 'spec-group-' + Date.now();
        activeGenerationGroupId = groupId;
        let timeoutHandle = null;

        const listener = (msg) => {
          if (msg.type === 'VIDEO_GENERATION_PROGRESS' && msg.data?.groupId === groupId) {
            frame.progress = msg.data.percentage || frame.progress;
            updateFrameCard(promptIndex);
          }
          if (msg.type === 'PROMPT_GROUP_STATUS' && msg.data?.id === groupId) {
            const status = msg.data.status;
            if (status === 'completed' || status === 'paused' || status === 'error' || status === 'cancelled') {
              if (timeoutHandle) clearTimeout(timeoutHandle);
              chrome.runtime.onMessage.removeListener(listener);
              if (activeGenerationGroupId === groupId) activeGenerationGroupId = null;
              const result = Array.isArray(msg.data.results)
                ? msg.data.results.find(item => item.promptIndex === promptIndex)
                : null;
              if (status === 'paused' && !result) {
                resolve(null);
              } else {
                const capture = Array.isArray(result?.capturedResources)
                  ? result.capturedResources[0]
                  : null;
                const mapped = result?.success === true
                  ? Boolean(capture && applyCapturedFrameImage({
                      type: 'SPEC_FRAME_IMAGE_CAPTURED',
                      promptIndex,
                      ...capture
                    }))
                  : false;
                resolve((status === 'completed' || status === 'paused') && result?.success === true && mapped);
              }
            }
          }
        };

        chrome.runtime.onMessage.addListener(listener);
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'AUTO_FILL_FLOW',
          payloads: [payload],
          groupId,
          concurrentPrompts: 1,
          promptDelaySecondsMin: 0,
          promptDelaySecondsMax: 0
        }, response => {
          const error = chrome.runtime?.lastError;
          if (error || !response?.success) {
            chrome.runtime.onMessage.removeListener(listener);
            if (activeGenerationGroupId === groupId) activeGenerationGroupId = null;
            frame.status = 'error';
            updateFrameCard(promptIndex);
            alert(
              'Could not start generation in the configured Flow collection.\n\n' +
              (error?.message || response?.error || 'Refresh the Flow tab and try again.')
            );
            resolve(false);
            return;
          }

          console.log('[SpecPipeline] Configured Flow collection accepted AUTO_FILL_FLOW');
          timeoutHandle = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            if (activeGenerationGroupId === groupId) activeGenerationGroupId = null;
            resolve(false);
          }, 300000);
        });
      }).catch(error => {
        if (activeGenerationGroupId?.startsWith('spec-group-')) activeGenerationGroupId = null;
        frame.status = 'error';
        updateFrameCard(promptIndex);
        setCollectionDestinationStatus(error.message, true);
        alert(error.message);
        resolve(false);
      });
    });
  }

  function downloadSingleFrame(idx) {
    const frame = currentSpec?.visuals?.[idx];
    if (!frame?.result_url || activeFrameDownloads.has(idx)) return;
    activeFrameDownloads.add(idx);
    updateFrameCard(idx);
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_RESOURCE',
      url: frame.result_url,
      filename: frame.target_filename,
      folder: currentSpec.output_folder,
      autoChangeFileName: true
    }, response => {
      const error = chrome.runtime?.lastError;
      setTimeout(() => {
        activeFrameDownloads.delete(idx);
        updateFrameCard(idx);
      }, 1000);
      if (error || !response?.success) {
        log('Frame download failed:', error?.message || response?.error || frame.target_filename);
      }
    });
  }

  function downloadAllCompleted() {
    if (!currentSpec) return;
    currentSpec.visuals.forEach((f, idx) => {
      if (f.status === 'completed' && f.result_url) {
        setTimeout(() => downloadSingleFrame(idx), idx * 300);
      }
    });
  }

  function updateFrameCard(idx) {
    const card = document.getElementById(`frame-card-${idx}`);
    if (!card) return;
    const f = currentSpec.visuals[idx];

    card.className = `frame-card ${f.status === 'generating' ? 'active' : ''} ${f.status === 'completed' ? 'completed' : ''} ${f.status === 'error' ? 'failed' : ''}`;
    
    const badge = document.getElementById(`frame-status-${idx}`);
    if (badge) {
      badge.className = `badge ${f.status === 'completed' ? 'badge-verified' : f.status === 'error' ? 'badge-missing' : ''}`;
      badge.innerText = f.status === 'generating' ? `Generating ${f.progress}%` : f.status.toUpperCase();
    }

    const progFill = document.getElementById(`frame-prog-${idx}`);
    if (progFill) {
      progFill.style.width = `${f.progress}%`;
    }

    const titleVal = document.getElementById(`flow-title-val-${idx}`);
    if (titleVal) {
      titleVal.innerText = f.flow_tile_title || '';
    }

    const guidanceEl = card.querySelector('.frame-guidance-container div:last-child');
    if (guidanceEl && f.formatted_reference_guidance) {
      guidanceEl.innerText = f.formatted_reference_guidance;
    }

    const imgBox = document.getElementById(`frame-img-box-${idx}`);
    const imgEl = document.getElementById(`frame-img-${idx}`);
    if (imgBox && imgEl && f.result_url) {
      imgEl.src = f.result_url;
      imgBox.style.display = 'block';
    }

    const rerollBtn = card.querySelector('.btn-regen-frame');
    const revertBtn = card.querySelector('.btn-revert-frame');
    const downloadBtn = card.querySelector('.btn-download-frame');
    const controlsBusy = pipelineRunning || activeRerollIndex !== null;
    if (rerollBtn) rerollBtn.disabled = controlsBusy;
    if (downloadBtn) downloadBtn.disabled = activeFrameDownloads.has(idx);
    if (revertBtn) {
      revertBtn.disabled = controlsBusy;
      revertBtn.style.display = f.reroll_previous ? 'inline-block' : 'none';
    }
  }

  function updateRerollControls() {
    const controlsBusy = pipelineRunning || activeRerollIndex !== null;
    document.querySelectorAll('.btn-regen-frame, .btn-revert-frame').forEach(button => {
      button.disabled = controlsBusy;
    });
  }

  function updateProjectStats() {
    if (!currentSpec) return;
    const completedCount = currentSpec.visuals.filter(v => v.status === 'completed').length;
    const totalCount = currentSpec.visuals.length;

    const elComp = document.getElementById('stat-completed');
    const elPend = document.getElementById('stat-pending');
    if (elComp) elComp.innerText = completedCount;
    if (elPend) elPend.innerText = totalCount - completedCount;

    const btnDownloadAll = document.getElementById('btn-download-all');
    if (btnDownloadAll) btnDownloadAll.disabled = (completedCount === 0);
  }

  function updateUIStatus() {
    const btnStart = document.getElementById('btn-start-pipeline');
    const btnPause = document.getElementById('btn-pause-pipeline');
    if (!currentSpec) return;
    const completedCount = currentSpec.visuals.filter(v => v.status === 'completed').length;
    const remainingCount = currentSpec.visuals.length - completedCount;
    const nextPendingIndex = currentSpec.visuals.findIndex(v => v.status !== 'completed');
    const nextFrameNum = nextPendingIndex >= 0 ? currentSpec.visuals[nextPendingIndex].frame_number : currentSpec.visuals.length;

    if (btnStart) {
      btnStart.disabled = pipelineRunning || activeRerollIndex !== null || (completedCount === currentSpec.visuals.length && currentSpec.visuals.length > 0);
      btnStart.innerText = pipelineRunning
        ? (pipelinePaused ? '⏳ Finishing active generations...' : '⏳ Generating...')
        : (completedCount > 0 && remainingCount > 0)
          ? `▶ Resume Pipeline (Frame #${nextFrameNum})`
          : completedCount === currentSpec.visuals.length ? '✓ All Completed' : '▶ Start Pipeline';
    }
    if (btnPause) {
      btnPause.disabled = !pipelineRunning || pipelinePaused;
      btnPause.innerText = pipelinePaused && pipelineRunning ? '⏳ Pausing...' : '⏸ Pause';
    }
    updateRerollControls();
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  function applyCapturedFrameImage(msg) {
    if (!currentSpec) return false;

      const idx = msg.promptIndex;
      if (idx !== undefined && currentSpec.visuals[idx]) {
        const frame = currentSpec.visuals[idx];
        if (msg.captureToken && msg.captureToken !== frame.reroll_capture_token) {
          log('Ignored a stale re-roll image capture for Frame #' + frame.frame_number);
          return false;
        }
        const duplicateIndex = msg.mediaUrl
          ? currentSpec.visuals.findIndex((visual, visualIndex) =>
              visualIndex !== idx && visual.result_url === msg.mediaUrl
            )
          : -1;
        if (duplicateIndex >= 0) {
          const duplicateFrame = currentSpec.visuals[duplicateIndex];
          frame.capture_conflict =
            `Flow returned the tile already assigned to Frame #${duplicateFrame.frame_number}.`;
          frame.error = frame.capture_conflict;
          frame.status = 'error';
          log('Duplicate Flow tile capture blocked:', {
            frame: frame.frame_number,
            duplicateOf: duplicateFrame.frame_number
          });
          updateFrameCard(idx);
          updateProjectStats();
          savePipelineMapping();
          return false;
        }

        if (frame.reroll_in_progress) {
          rerollHistory.commit(frame);
        }
        frame.result_url = msg.mediaUrl;
        if (msg.tileTitle) {
          frame.flow_tile_title = msg.tileTitle;
          registerLocalFrameTitle(frame.target_filename, msg.tileTitle);
          if (frame.id) {
            registerLocalFrameTitle(frame.id, msg.tileTitle);
          }
          if (frame.frame_number) {
            registerLocalFrameTitle(String(frame.frame_number), msg.tileTitle);
            registerLocalFrameTitle(`frame_${String(frame.frame_number).padStart(3, '0')}`, msg.tileTitle);
          }
          // Propagate updated tile title to subsequent dependent frames' guidance
          for (let k = idx + 1; k < currentSpec.visuals.length; k++) {
            const nextFrame = currentSpec.visuals[k];
            const cleanRef = String(nextFrame.frame_reference || '').replace(/\(.*?\)/g, '').trim();
            if (cleanRef === currentSpec.visuals[idx].target_filename ||
                cleanRef === currentSpec.visuals[idx].id ||
                cleanRef === `${currentSpec.visuals[idx].id}.png` ||
                (nextFrame.continuity === 'continue' && k === idx + 1)) {
              nextFrame.formatted_reference_guidance = formatReferenceGuidance(nextFrame, k);
              updateFrameCard(k);
            }
          }
        } else if (!frame.flow_tile_title) {
          frame.flow_tile_title = msg.filename || frame.target_filename;
        }
        updateFrameCard(idx);
        savePipelineMapping();
        return true;
      }
      return false;
  }

  // Hook global incoming messages from Content Script / Background Worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ACTION_LOG' && msg.data) {
      appendDebugEntry(msg.data);
      return;
    }

    if (msg.type === 'SPEC_FRAME_IMAGE_CAPTURED') {
      applyCapturedFrameImage(msg);
    }
  });

})();
