// Spec-Driven Google Flow Pipeline Engine & UI Controller

(function () {
  const flowDestination = globalThis.FlowDestination;
  if (!flowDestination) {
    throw new Error('Flow destination helper was not loaded.');
  }

  // State
  let currentSpec = null;
  let pipelineRunning = false;
  let pipelinePaused = false;
  let activeFrameIndex = -1;
  let activeFilter = 'all'; // 'all' | 'pending' | 'completed' (NO 'anchors')
  let searchQuery = '';

  function formatFrameDuration(start, end) {
    if (!start && !end) return '';
    const cleanStart = (start || '00:00.0').trim();
    const cleanEnd = (end || '').trim();
    if (!cleanEnd) return `🕒 ${cleanStart}`;

    function toSeconds(t) {
      const parts = t.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
    }
    const s1 = toSeconds(cleanStart);
    const s2 = toSeconds(cleanEnd);
    const diff = Math.max(0, Math.round((s2 - s1) * 10) / 10);
    const diffStr = diff > 0 ? ` (${diff}s)` : '';
    return `🕒 ${cleanStart} - ${cleanEnd}${diffStr}`;
  }

  function log(...args) {
    console.log('[SpecPipeline]', ...args);
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
      default_model: currentSpec.default_model,
      default_aspect_ratio: currentSpec.default_aspect_ratio,
      output_folder: currentSpec.project_dir || currentSpec.output_folder || "ancient_humans_scenes",
      project_dir: currentSpec.project_dir || currentSpec.output_folder || "ancient_humans_scenes",
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
        timestamp_start: v.timestamp_start || null,
        timestamp_end: v.timestamp_end || null,
        verbatim_script: v.verbatim_script || null,
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
      const toSet = {
        [key]: data,
        [LATEST_KEY]: data.project_name
      };
      if (data.project_dir) {
        toSet[getStorageKey(data.project_dir)] = data;
      }
      chrome.storage.local.set(toSet).catch(() => {});
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

  function getProjectFramesFolder() {
    const base = (currentSpec?.project_dir || currentSpec?.output_folder || 'ancient_humans_scenes')
      .trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (base.endsWith('/frames')) {
      return base;
    }
    return `${base}/frames`;
  }

  function getProjectRootFolder() {
    const base = (currentSpec?.project_dir || currentSpec?.output_folder || 'ancient_humans_scenes')
      .trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (base.endsWith('/frames')) {
      return base.slice(0, -'/frames'.length) || base;
    }
    return base;
  }

  function exportMappingFile() {
    const data = generateMappingData();
    if (!data) return;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeFolder = getProjectRootFolder();
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

  function sanitizeProjectDir(rawDir) {
    if (!rawDir) return '';
    let dir = String(rawDir).trim().replace(/\\/g, '/');
    if (/^[a-zA-Z]:/.test(dir) || dir.startsWith('/')) {
      const segments = dir.split('/').filter(Boolean);
      return segments[segments.length - 1] || '';
    }
    return dir.replace(/^\/+|\/+$/g, '');
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
    project_dir: "ancient_humans_scenes",
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
              ${saved.project_dir ? `Folder: <strong>${escapeHtml(saved.project_dir)}</strong> &bull; ` : ''}Progress: <strong>${completedCount}/${totalCount} frames completed</strong>. Last saved: ${new Date(saved.last_updated).toLocaleTimeString()}
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
              const keys = [getStorageKey(saved.project_name), LATEST_KEY];
              if (saved.project_dir) keys.push(getStorageKey(saved.project_dir));
              chrome.storage.local.remove(keys, () => {
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
      project_dir: "ancient_humans_scenes",
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
          prompt: "Pure white background split into three clean vertical panels separated by bold black dashed lines. Left panel: a pair pair of headphones with a floating musical eighth note. Center panel: a video game controller gamepad. Right panel: a video play button on a screen. Bold uppercase hand-lettered labels beneath each: MUSIC, GAME, WATCH. Flat ink illustration, comic strip layout, no characters.",
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
    const rawDir = String(
      raw.project_dir || 
      (raw.global_settings && raw.global_settings.project_dir) ||
      raw.project_directory || 
      raw.output_folder || 
      (raw.global_settings && raw.global_settings.output_folder) ||
      raw.output_dir || 
      raw.project_name || 
      raw.project || 
      "ancient_humans_scenes"
    ).trim();
    const projectDir = sanitizeProjectDir(rawDir) || "ancient_humans_scenes";

    const spec = {
      project_name: raw.project_name || raw.project || "Google Flow Production",
      project_dir: projectDir,
      raw_project_dir: rawDir,
      collection_url: raw.collection_url || raw.flow_collection_url || raw.collection?.url || "",
      collection_tab_id: Number.isInteger(raw.collection_tab_id) ? raw.collection_tab_id : null,
      default_model: raw.default_model || raw.model || (raw.global_settings && raw.global_settings.model) || "Nano Banana 2",
      default_aspect_ratio: raw.default_aspect_ratio || raw.aspect_ratio || (raw.global_settings && raw.global_settings.aspect_ratio) || "16:9",
      output_folder: projectDir,
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
        timestamp_start: v.timestamp_start || v.start_time || null,
        timestamp_end: v.timestamp_end || v.end_time || null,
        verbatim_script: v.verbatim_script || v.script || v.narration || null,
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
    const percentFinished = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const nextPendingIndex = currentSpec.visuals.findIndex(v => v.status !== 'completed');
    const nextFrameNum = nextPendingIndex >= 0 ? currentSpec.visuals[nextPendingIndex].frame_number : totalCount;

    const specView = getSpecView();
    if (!specView) return;

    specView.innerHTML = `
      <!-- Project Header Box -->
      <div class="project-header-box">
        <div class="project-title-area">
          <div class="project-title-row">
            <span class="project-title">${escapeHtml(currentSpec.project_name)}</span>
            <span class="badge-spec-count">${totalCount} Frames Spec</span>
          </div>
          <div class="project-folder-label">
            📁 <strong>${escapeHtml(getProjectRootFolder())}</strong> <span>(Frames ➔ ${escapeHtml(getProjectFramesFolder())})</span>
          </div>
        </div>
        <div class="project-header-actions">
          <button class="btn-dark-pill" id="btn-export-mapping" title="Save mapping JSON to output folder">💾 Save Mapping</button>
          <button class="btn-dark-pill" id="btn-reset-spec">🔄 Switch Spec ⌵</button>
        </div>
      </div>

      <!-- Google Flow Collection Destination Card -->
      <div class="collection-destination">
        <div class="collection-header-row">
          <div class="collection-title">
            <span>🔗</span>
            <span>Google Flow Collection URL</span>
          </div>
          <div class="collection-synced-badge" id="collection-destination-status">
            <span>✔ Synced with Tab #${currentSpec.collection_tab_id || '3'}</span>
          </div>
        </div>
        <div class="collection-input-row">
          <input
            id="collection-url-input"
            type="url"
            value="${escapeAttr(currentSpec.collection_url || '')}"
            placeholder="https://flow.google.com/collection/..."
            spellcheck="false"
          />
          <button class="btn-dark-pill" id="btn-use-open-flow">🎯 Use open Flow page</button>
        </div>
        <div class="collection-helper">
          Leave empty to automatically target the currently open Flow canvas in your active browser window.
        </div>
      </div>

      <!-- Metrics Dashboard (3-Box Grid) -->
      <div class="metrics-dashboard-grid">
        <div class="metric-card">
          <span class="metric-card-label">TOTAL FRAMES</span>
          <span class="metric-card-val" id="stat-total">${totalCount}</span>
          <span class="metric-card-sub">Full sequence</span>
        </div>
        <div class="metric-card">
          <span class="metric-card-label completed">COMPLETED</span>
          <span class="metric-card-val completed" id="stat-completed">${completedCount}</span>
          <span class="metric-card-sub" id="stat-completed-pct">${percentFinished}% finished</span>
        </div>
        <div class="metric-card">
          <span class="metric-card-label">REMAINING</span>
          <span class="metric-card-val" id="stat-pending">${remainingCount}</span>
          <span class="metric-card-sub" id="stat-pending-sub">🕒 Pending start</span>
        </div>
      </div>

      <!-- Pipeline Progress Row & Action Buttons -->
      <div class="pipeline-progress-container">
        <div class="pipeline-status-row">
          <span id="pipeline-status-text">${pipelineRunning ? 'Pipeline Generating...' : 'Pipeline Idle • Ready'}</span>
          <span id="pipeline-progress-text">${completedCount}/${totalCount} (${percentFinished}%)</span>
        </div>
        <div class="pipeline-progress-track">
          <div class="pipeline-progress-bar" id="pipeline-progress-bar" style="width: ${percentFinished}%;"></div>
        </div>
        <div class="pipeline-action-buttons">
          <button class="btn-start-pipeline" id="btn-start-pipeline" ${pipelineRunning || (completedCount === totalCount && totalCount > 0) ? 'disabled' : ''}>
            ${pipelineRunning ? '⏳ Generating...' : (completedCount > 0 && remainingCount > 0) ? `▶ Resume Pipeline (Frame #${nextFrameNum})` : completedCount === totalCount ? '✓ All Completed' : '▶ Start Pipeline'}
          </button>
          <button class="btn-pause-pipeline" id="btn-pause-pipeline" style="display: ${pipelineRunning ? 'inline-flex' : 'none'};">
            ⏸ Pause
          </button>
          <button class="btn-download-all" id="btn-download-all" ${completedCount === 0 ? 'disabled' : ''}>
            ⬇ Download All
          </button>
        </div>
      </div>

      <!-- Collapsible Characters & References -->
      <div class="section-accordion-header" id="toggle-chars-section">
        <div class="accordion-title-left">
          <span id="chars-chevron">❯</span>
          <span>CHARACTERS & REFERENCES</span>
          <span class="accordion-badge">${currentSpec.characters.length}</span>
        </div>
        <div class="accordion-actions-right">
          <button class="btn-dark-pill" id="btn-recheck-chars" style="padding: 4px 10px; font-size: 11px;">✔ Verify with Flow</button>
          <button class="btn-add-frame" id="btn-create-missing-chars" style="padding: 4px 10px; font-size: 11px;">+ Add Seed</button>
        </div>
      </div>
      <div class="characters-list" id="chars-container" style="display: none;">
        ${renderCharactersList()}
      </div>

      <!-- Visual Production Sequence Header -->
      <div class="sequence-header-row">
        <div class="sequence-title-area">
          <span class="sequence-title">VISUAL PRODUCTION SEQUENCE</span>
          <span class="badge-sequence-count">${totalCount} Frames</span>
        </div>
        <div class="sequence-header-actions">
          <button class="btn-dark-pill" id="btn-sync-tiles" title="Scan open Flow project to auto-map generated tile titles">🔄 Sync Flow Titles</button>
          <button class="btn-add-frame" id="btn-add-frame" style="padding: 5px 12px; font-size: 11px;">+ Add Frame</button>
        </div>
      </div>

      <!-- Search & Filter Bar -->
      <div class="sequence-search-box">
        <span class="sequence-search-icon">🔍</span>
        <input
          type="text"
          id="frames-search-input"
          class="sequence-search-input"
          placeholder="Filter by narration, prompt keyword, or title..."
          value="${escapeAttr(searchQuery)}"
        />
      </div>

      <!-- Filter Pills: ONLY All, Pending, Completed (NO Anchors Only) -->
      <div class="filter-pills-row">
        <button class="filter-pill ${activeFilter === 'all' ? 'active' : ''}" data-filter="all" id="pill-filter-all">
          All (${totalCount})
        </button>
        <button class="filter-pill ${activeFilter === 'pending' ? 'active' : ''}" data-filter="pending" id="pill-filter-pending">
          Pending (${remainingCount})
        </button>
        <button class="filter-pill ${activeFilter === 'completed' ? 'active' : ''}" data-filter="completed" id="pill-filter-completed">
          Completed (${completedCount})
        </button>
      </div>

      <!-- Frames List -->
      <div class="frames-list" id="frames-container">
        ${renderFramesList()}
      </div>
    `;

    attachDashboardEvents();
  }

  function renderCharactersList() {
    if (!currentSpec || currentSpec.characters.length === 0) {
      return `<div style="color: var(--text-muted); font-size: 11px; padding: 8px;">No character seeds specified.</div>`;
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
              <button class="btn-dark-pill btn-create-char" data-id="${escapeAttr(c.id)}" ${c.status === 'creating' ? 'disabled' : ''} style="padding: 4px 8px; font-size: 11px;">
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
      return `<div style="color: var(--text-muted); font-size: 12px; padding: 24px; text-align: center;">No frames found in spec.</div>`;
    }

    const filtered = currentSpec.visuals.filter((f, idx) => {
      if (activeFilter === 'pending' && f.status === 'completed') return false;
      if (activeFilter === 'completed' && f.status !== 'completed') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchPrompt = f.prompt && f.prompt.toLowerCase().includes(q);
        const matchScript = f.verbatim_script && f.verbatim_script.toLowerCase().includes(q);
        const matchTitle = (f.flow_tile_title || getLocalFrameTitle(f.target_filename) || '').toLowerCase().includes(q);
        const matchFile = f.target_filename && f.target_filename.toLowerCase().includes(q);
        if (!matchPrompt && !matchScript && !matchTitle && !matchFile) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      return `<div style="color: var(--text-muted); font-size: 12px; padding: 24px; text-align: center;">No frames matching your filter.</div>`;
    }

    return filtered.map((f) => {
      const idx = currentSpec.visuals.indexOf(f);
      const flowTitle = f.flow_tile_title || getLocalFrameTitle(f.target_filename) || '';
      const refTitle = resolveFlowTileTitleForFrame(f, idx);
      const isAnchor = f.continuity === 'anchor' || idx === 0 || !f.frame_reference;
      const refLabel = f.frame_reference || (currentSpec.visuals[idx - 1] ? currentSpec.visuals[idx - 1].target_filename : 'Previous Frame');
      const timeStr = formatFrameDuration(f.timestamp_start, f.timestamp_end);
      const paddedNum = String(f.frame_number || idx + 1).padStart(3, '0');

      return `
      <div class="frame-card ${f.status === 'generating' ? 'active' : ''} ${f.status === 'completed' ? 'completed' : ''} ${f.status === 'error' ? 'failed' : ''}" id="frame-card-${idx}">
        <!-- Card Header -->
        <div class="frame-card-header">
          <div class="frame-header-left">
            <span class="frame-title-text">Frame #${f.frame_number}</span>
            ${isAnchor ? `
              <span class="continuity-pill anchor">• Anchor (New Scene)</span>
            ` : `
              <span class="continuity-pill chained">🔗 Chains Frame #${f.frame_number > 1 ? f.frame_number - 1 : 1}</span>
            `}
            ${timeStr ? `<span class="timestamp-pill">${escapeHtml(timeStr)}</span>` : ''}
          </div>
          <div class="status-pill ${f.status === 'completed' ? 'completed' : f.status === 'generating' ? 'generating' : f.status === 'error' ? 'failed' : 'pending'}" id="frame-status-${idx}">
            <span class="status-indicator-dot"></span>
            <span>${f.status === 'generating' ? `Generating ${f.progress}%` : f.status === 'completed' ? 'Completed' : f.status === 'error' ? 'Failed' : 'Pending'}</span>
          </div>
        </div>

        <!-- Narration Script Box -->
        ${f.verbatim_script ? `
          <div class="frame-narration-box">
            <div class="narration-header">
              <span>🎙</span>
              <span>NARRATION SCRIPT</span>
            </div>
            <div class="narration-text">"${escapeHtml(f.verbatim_script)}"</div>
          </div>
        ` : ''}

        <!-- Visual Production Prompt Box -->
        <div class="frame-prompt-box">
          <div class="prompt-header-row">
            <span class="prompt-header-label">VISUAL PRODUCTION PROMPT</span>
            <button class="btn-copy-prompt-text" data-index="${idx}" title="Copy prompt to clipboard">
              📋 Copy
            </button>
          </div>
          <div class="prompt-content-text collapsed" id="frame-prompt-${idx}">${escapeHtml(f.prompt)}</div>
          <button class="btn-toggle-prompt-expand" data-index="${idx}">Show full prompt ⌵</button>
        </div>

        <!-- Reference & Style Continuity Directives Accordion -->
        <div class="directives-accordion" id="directives-accordion-${idx}">
          <div class="directives-accordion-toggle" data-index="${idx}">
            <div class="directives-toggle-left">
              <span>🛡</span>
              <span>Reference & Style Continuity Directives</span>
              <span class="badge-auto-appended">Auto-Appended</span>
            </div>
            <span class="directives-chevron">⌵</span>
          </div>
          <div class="directives-content">
${escapeHtml(f.formatted_reference_guidance || formatReferenceGuidance(f, idx))}
${f.negative ? `\nLocked Negative: ${escapeHtml(f.negative)}` : ''}
          </div>
        </div>

        <!-- Flow Title & Chain Mapping row -->
        <div class="frame-flow-title-row">
          <div class="flow-title-side">
            <span>Flow Title:</span>
            <strong class="flow-title-val" id="flow-title-val-${idx}" data-index="${idx}" contenteditable="true" title="Click to manually edit Flow title mapping">${escapeHtml(flowTitle || 'None')}</strong>
          </div>
          ${!isAnchor ? `
            <div class="flow-ref-side">
              <span>Ref:</span>
              <span class="flow-ref-file">${escapeHtml(refLabel)}</span>
              <span class="flow-ref-arrow">➔</span>
              <span class="flow-ref-target">"${escapeHtml(refTitle || 'Pending reference')}"</span>
            </div>
          ` : ''}
        </div>

        <!-- Image Preview Container (only displayed when actual image is generated) -->
        <div class="frame-image-container" id="frame-img-box-${idx}" style="display: ${f.result_url ? 'flex' : 'none'};">
          ${f.result_url ? `
            <div class="frame-badge-overlay ${isAnchor ? 'anchor' : 'chained'}">
              #${paddedNum} ${isAnchor ? 'Anchor Scene' : 'Chained Frame'}
            </div>
            <img src="${escapeAttr(f.result_url)}" class="frame-preview-img" id="frame-img-${idx}" alt="Frame #${f.frame_number}" />
          ` : ''}
        </div>

        <!-- Card Footer -->
        <div class="frame-card-footer">
          <div class="file-meta">
            <span>📄</span>
            <span>${escapeHtml(f.target_filename)}</span>
            <span>1920x1080 • 24fps</span>
          </div>
          <div class="frame-footer-actions">
            <button class="btn-footer-preview btn-preview-zoom" data-index="${idx}" title="Preview image" style="display: ${f.result_url ? 'inline-flex' : 'none'};">👁</button>
            <button class="btn-footer-edit btn-edit-prompt" data-index="${idx}">✏️ Edit Spec</button>
            <button class="btn-footer-reroll btn-regen-frame" data-index="${idx}" ${pipelineRunning ? 'disabled' : ''}>🔄 Re-roll</button>
            <button class="btn-dark-pill btn-download-frame" data-index="${idx}" style="display: ${f.result_url ? 'inline-flex' : 'none'}; padding: 6px 10px;" title="Download frame">⬇</button>
          </div>
        </div>
      </div>
      `;
    }).join('');
  }

  function attachFrameSpecificEvents() {
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

    document.querySelectorAll('.btn-copy-prompt-text').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const frame = currentSpec?.visuals?.[idx];
        if (frame && frame.prompt) {
          navigator.clipboard.writeText(frame.prompt).then(() => {
            const original = btn.innerText;
            btn.innerText = '✓ Copied!';
            btn.style.color = '#34d399';
            setTimeout(() => {
              btn.innerText = original;
              btn.style.color = '';
            }, 1600);
          }).catch(() => {
            const el = document.getElementById(`frame-prompt-${idx}`);
            if (el) {
              const range = document.createRange();
              range.selectNodeContents(el);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('copy');
              btn.innerText = '✓ Copied!';
              setTimeout(() => { btn.innerText = '📋 Copy'; }, 1600);
            }
          });
        }
      });
    });

    document.querySelectorAll('.btn-toggle-prompt-expand').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.index;
        const content = document.getElementById(`frame-prompt-${idx}`);
        if (content) {
          const isCollapsed = content.classList.toggle('collapsed');
          e.target.innerText = isCollapsed ? 'Show full prompt ⌵' : 'Show less ⌃';
        }
      });
    });

    document.querySelectorAll('.directives-accordion-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = el.dataset.index;
        const accordion = document.getElementById(`directives-accordion-${idx}`);
        if (accordion) {
          accordion.classList.toggle('open');
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

    document.querySelectorAll('.btn-download-frame').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        downloadSingleFrame(idx);
      });
    });

    document.querySelectorAll('.btn-preview-zoom').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const frame = currentSpec?.visuals?.[idx];
        if (frame && frame.result_url) {
          let modal = document.querySelector('.spec-preview-modal');
          if (!modal) {
            modal = document.createElement('div');
            modal.className = 'spec-preview-modal';
            document.body.appendChild(modal);
          }
          modal.innerHTML = `
            <div class="preview-modal-content">
              <button class="preview-modal-close">✕</button>
              <img src="${escapeAttr(frame.result_url)}" class="preview-modal-img" />
            </div>
          `;
          modal.onclick = (evt) => {
            if (evt.target === modal || evt.target.classList.contains('preview-modal-close')) {
              modal.remove();
            }
          };
        }
      });
    });
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

    const toggleChars = document.getElementById('toggle-chars-section');
    if (toggleChars) {
      toggleChars.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const charsContainer = document.getElementById('chars-container');
        const chevron = document.getElementById('chars-chevron');
        if (charsContainer) {
          const isHidden = charsContainer.style.display === 'none';
          charsContainer.style.display = isHidden ? 'flex' : 'none';
          if (chevron) chevron.innerText = isHidden ? '▼' : '❯';
        }
      });
    }

    const searchInput = document.getElementById('frames-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        const container = document.getElementById('frames-container');
        if (container) {
          container.innerHTML = renderFramesList();
          attachFrameSpecificEvents();
        }
      });
    }

    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        const container = document.getElementById('frames-container');
        if (container) {
          container.innerHTML = renderFramesList();
          attachFrameSpecificEvents();
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
            e.target.style.color = '#34d399';
            setTimeout(() => {
              e.target.innerText = originalText;
              e.target.style.color = '';
            }, 1800);
          });
        }
      });
    });

    attachFrameSpecificEvents();
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

  // Sequential generation loop with automatic resumption
  async function startPipeline() {
    if (!currentSpec || pipelineRunning) return;

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
    // Iterate through pending frames
    for (let i = 0; i < currentSpec.visuals.length; i++) {
      if (pipelinePaused) {
        break;
      }

      const frame = currentSpec.visuals[i];
      if (frame.status === 'completed') continue;

      activeFrameIndex = i;
      frame.status = 'generating';
      frame.progress = 5;
      updateFrameCard(i);

      // Check if reference from previous frame or frame_reference is needed
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
      } else if (frame.continuity === 'continue' && i > 0) {
        refFrameVisual = currentSpec.visuals[i - 1];
      }

      // Resolve the actual Google Flow tile title for tagging reference frame
      const resolvedRefTitle = resolveFlowTileTitleForFrame(frame, i);

      if (refFrameVisual) {
        const refNameForFlow = resolvedRefTitle || refFrameVisual.target_filename;
        if (refFrameVisual.result_url) {
          refImages.push({
            name: refNameForFlow,
            base64: refFrameVisual.result_url
          });
        } else if (refFrameVisual.target_filename) {
          refImages.push({
            name: refNameForFlow,
            referenceExistingOnly: true
          });
        }
      }

      // Ensure reference guidance is updated dynamically with the latest Flow title
      frame.prompt = frame.prompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
      frame.formatted_reference_guidance = formatReferenceGuidance(frame, i);


      // Execute frame generation with automatic per-frame retries
      const maxRetries = currentSpec.max_retries || currentSpec.global_settings?.max_retries || 3;
      let frameSuccess = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (pipelinePaused || !pipelineRunning) break;

        if (attempt > 1) {
          log(`🔄 Retrying Frame #${i + 1} (Attempt ${attempt}/${maxRetries})...`);
          frame.progress = 10;
          updateFrameCard(i);
          await new Promise(r => setTimeout(r, 2000));
        }

        try {
          const success = await executeFrameGeneration(frame, refImages, i);
          if (success) {
            frame.status = 'completed';
            frame.progress = 100;
            frame.completed_at = new Date().toISOString();
            frameSuccess = true;
            break;
          } else {
            log(`⚠️ Frame #${i + 1} attempt ${attempt} failed.`);
          }
        } catch (err) {
          log(`⚠️ Frame #${i + 1} attempt ${attempt} error: ${err?.message || err}`);
        }
      }

      if (!frameSuccess) {
        frame.status = 'error';
        pipelineRunning = false;
        pipelinePaused = true;
        log(`❌ Frame #${i + 1} failed after ${maxRetries} attempts. Pipeline paused to maintain sequence continuity.`);
        updateFrameCard(i);
        updateProjectStats();
        savePipelineMapping();
        break;
      }

      updateFrameCard(i);
      updateProjectStats();
      savePipelineMapping();

      if (!pipelineRunning) break;
      await new Promise(r => setTimeout(r, 1200));
    }

    pipelineRunning = false;
    updateUIStatus();
    log("Pipeline finished");
    savePipelineMapping();
  }

  function pausePipeline() {
    pipelinePaused = true;
    pipelineRunning = false;
    updateUIStatus();
    savePipelineMapping();
  }

  async function regenerateSingleFrame(idx) {
    if (!currentSpec || pipelineRunning) return;

    const collectionInput = document.getElementById('collection-url-input');
    if (collectionInput && !saveCollectionDestination(collectionInput.value)) {
      alert('Enter a valid Google Flow collection URL before generating.');
      return;
    }

    try {
      await getFlowTargetTab();
    } catch (error) {
      setCollectionDestinationStatus(error.message, true);
      alert(error.message);
      return;
    }

    const frame = currentSpec.visuals[idx];
    frame.status = 'generating';
    frame.progress = 5;
    updateFrameCard(idx);

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
      const ok = await executeFrameGeneration(frame, refImages, idx);
      frame.status = ok ? 'completed' : 'error';
      if (ok) {
        frame.progress = 100;
        frame.completed_at = new Date().toISOString();
      }
    } catch (err) {
      frame.status = 'error';
    }

    updateFrameCard(idx);
    updateProjectStats();
    savePipelineMapping();
  }

  function executeFrameGeneration(frame, refImages, promptIndex) {
    return new Promise((resolve) => {
      // 1. Explicit character references from frame (e.g. "@women_early_human", "@male_early_human")
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

      // 2. Style, image, and extra references
      const otherRefs = [
        ...(Array.isArray(frame.style_references) ? frame.style_references : []),
        ...(Array.isArray(frame.image_references) ? frame.image_references : [])
      ].map(c => (typeof c === 'string' ? c : (c.tag || c.name || c.id || '')).replace(/^@/, '').trim()).filter(Boolean);

      otherRefs.forEach(ref => {
        const norm = ref.toLowerCase().replace(/[\s_-]+/g, '');
        if (knownCharNames.has(norm)) {
          if (!cleanChars.includes(ref)) cleanChars.push(ref);
        } else {
          if (!refImages.some(img => img.name === ref) && !cleanChars.includes(ref)) {
            refImages.push({
              name: ref,
              referenceExistingOnly: true
            });
          }
        }
      });
      
      // Assemble clean base image prompt and decoupled reference guidance
      const rawPrompt = (frame.prompt || '').trim();
      const cleanBase = rawPrompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();

      const guidance = formatReferenceGuidance(frame, promptIndex);
      frame.formatted_reference_guidance = guidance;

      const finalPrompt = guidance ? `${cleanBase}\n\n${guidance}` : cleanBase;

      const payload = {
        prompt: finalPrompt,
        basePrompt: cleanBase,
        referenceGuidance: guidance,
        targetFilename: frame.target_filename,
        mode: 'textToImage',
        aspectRatio: currentSpec.default_aspect_ratio || '16:9',
        model: currentSpec.default_model || 'Nano Banana 2',
        outputCount: 1,
        autoDownloadResourceQuality: 'original',
        folderName: getProjectFramesFolder(),
        referenceFolder: currentSpec.reference_folder || 'Branded_references',
        autoChangeFileName: true,
        maxRetries: 1,
        promptIndex: promptIndex,
        images: refImages,
        characters: cleanChars
      };

      getFlowTargetTab().then(targetTab => {
        const groupId = 'spec-group-' + Date.now();
        let timeoutHandle = null;

        const listener = (msg) => {
          if (msg.type === 'VIDEO_GENERATION_PROGRESS' && msg.data?.groupId === groupId) {
            frame.progress = msg.data.percentage || frame.progress;
            updateFrameCard(promptIndex);
          }
          if (msg.type === 'PROMPT_GROUP_STATUS' && msg.data?.id === groupId) {
            const status = msg.data.status;
            if (status === 'completed' || status === 'error' || status === 'cancelled') {
              if (timeoutHandle) clearTimeout(timeoutHandle);
              chrome.runtime.onMessage.removeListener(listener);
              resolve(status === 'completed');
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
            resolve(frame.status === 'completed');
          }, 300000);
        });
      }).catch(error => {
        frame.status = 'error';
        updateFrameCard(promptIndex);
        setCollectionDestinationStatus(error.message, true);
        alert(error.message);
        resolve(false);
      });
    });
  }

  function downloadSingleFrame(idx) {
    const frame = currentSpec.visuals[idx];
    if (!frame.result_url) return;
    const framesFolder = getProjectFramesFolder();
    chrome.downloads.download({
      url: frame.result_url,
      filename: `${framesFolder}/${frame.target_filename}`,
      saveAs: false
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
      badge.className = `status-pill ${f.status === 'completed' ? 'completed' : f.status === 'generating' ? 'generating' : f.status === 'error' ? 'failed' : 'pending'}`;
      badge.innerHTML = `<span class="status-indicator-dot"></span><span>${f.status === 'generating' ? `Generating ${f.progress}%` : f.status === 'completed' ? 'Completed' : f.status === 'error' ? 'Failed' : 'Pending'}</span>`;
    }

    const titleVal = document.getElementById(`flow-title-val-${idx}`);
    if (titleVal && f.flow_tile_title) {
      titleVal.innerText = f.flow_tile_title;
    }

    const imgBox = document.getElementById(`frame-img-box-${idx}`);
    if (imgBox) {
      if (f.result_url) {
        const isAnchor = f.continuity === 'anchor' || idx === 0 || !f.frame_reference;
        const paddedNum = String(f.frame_number || idx + 1).padStart(3, '0');
        imgBox.innerHTML = `
          <div class="frame-badge-overlay ${isAnchor ? 'anchor' : 'chained'}">
            #${paddedNum} ${isAnchor ? 'Anchor Scene' : 'Chained Frame'}
          </div>
          <img src="${escapeAttr(f.result_url)}" class="frame-preview-img" id="frame-img-${idx}" alt="Frame #${f.frame_number}" />
        `;
        imgBox.style.display = 'flex';
      } else {
        imgBox.style.display = 'none';
        imgBox.innerHTML = '';
      }
    }

    const btnZoom = card.querySelector('.btn-preview-zoom');
    if (btnZoom) {
      btnZoom.style.display = f.result_url ? 'inline-flex' : 'none';
    }

    const btnDownload = card.querySelector('.btn-download-frame');
    if (btnDownload) {
      btnDownload.style.display = f.result_url ? 'inline-flex' : 'none';
    }
  }

  function updateProjectStats() {
    if (!currentSpec) return;
    const completedCount = currentSpec.visuals.filter(v => v.status === 'completed').length;
    const totalCount = currentSpec.visuals.length;
    const remainingCount = totalCount - completedCount;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const elTotal = document.getElementById('stat-total');
    const elComp = document.getElementById('stat-completed');
    const elPend = document.getElementById('stat-pending');
    const elCompPct = document.getElementById('stat-completed-pct');
    const elPendSub = document.getElementById('stat-pending-sub');
    const elProgBar = document.getElementById('pipeline-progress-bar');
    const elProgText = document.getElementById('pipeline-progress-text');
    const elStatusText = document.getElementById('pipeline-status-text');

    if (elTotal) elTotal.innerText = totalCount;
    if (elComp) elComp.innerText = completedCount;
    if (elPend) elPend.innerText = remainingCount;
    if (elCompPct) elCompPct.innerText = `${pct}% finished`;
    if (elPendSub) elPendSub.innerText = remainingCount === 0 ? '✓ Complete' : pipelineRunning ? '🕒 In progress' : '🕒 Pending start';
    if (elProgBar) elProgBar.style.width = `${pct}%`;
    if (elProgText) elProgText.innerText = `${completedCount}/${totalCount} (${pct}%)`;
    if (elStatusText) elStatusText.innerText = pipelineRunning ? 'Pipeline Generating...' : completedCount === totalCount ? 'Pipeline Finished' : 'Pipeline Idle • Ready';

    // Update filter pills (strictly NO Anchors Only)
    const pillAll = document.getElementById('pill-filter-all');
    const pillPending = document.getElementById('pill-filter-pending');
    const pillComp = document.getElementById('pill-filter-completed');
    if (pillAll) pillAll.innerText = `All (${totalCount})`;
    if (pillPending) pillPending.innerText = `Pending (${remainingCount})`;
    if (pillComp) pillComp.innerText = `Completed (${completedCount})`;

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
      btnStart.disabled = pipelineRunning || (completedCount === currentSpec.visuals.length && currentSpec.visuals.length > 0);
      btnStart.innerText = pipelineRunning ? '⏳ Generating...' : (completedCount > 0 && remainingCount > 0) ? `▶ Resume Pipeline (Frame #${nextFrameNum})` : completedCount === currentSpec.visuals.length ? '✓ All Completed' : '▶ Start Pipeline';
    }
    if (btnPause) {
      btnPause.style.display = pipelineRunning ? 'inline-flex' : 'none';
      btnPause.disabled = !pipelineRunning;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  // Hook global incoming messages from Content Script / Background Worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SPEC_FRAME_IMAGE_CAPTURED' && currentSpec) {
      const idx = msg.promptIndex;
      if (idx !== undefined && currentSpec.visuals[idx]) {
        currentSpec.visuals[idx].result_url = msg.mediaUrl;
        if (msg.tileTitle) {
          currentSpec.visuals[idx].flow_tile_title = msg.tileTitle;
          registerLocalFrameTitle(currentSpec.visuals[idx].target_filename, msg.tileTitle);
          if (currentSpec.visuals[idx].id) {
            registerLocalFrameTitle(currentSpec.visuals[idx].id, msg.tileTitle);
          }
          if (currentSpec.visuals[idx].frame_number) {
            registerLocalFrameTitle(String(currentSpec.visuals[idx].frame_number), msg.tileTitle);
            registerLocalFrameTitle(`frame_${String(currentSpec.visuals[idx].frame_number).padStart(3, '0')}`, msg.tileTitle);
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
        } else if (!currentSpec.visuals[idx].flow_tile_title) {
          currentSpec.visuals[idx].flow_tile_title = msg.filename || currentSpec.visuals[idx].target_filename;
        }
        updateFrameCard(idx);
        savePipelineMapping();
      }
    }
  });

})();
