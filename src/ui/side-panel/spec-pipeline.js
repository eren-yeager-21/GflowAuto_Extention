// Spec-Driven Google Flow Pipeline Engine & UI Controller

(function () {
  const flowDestination = globalThis.FlowDestination;
  const concurrency = globalThis.PipelineConcurrency;
  if (!flowDestination) {
    throw new Error('Flow destination helper was not loaded.');
  }

  // State
  let currentSpec = null;
  let pipelineRunning = false;
  let pipelinePaused = false;
  let activeFrameIndex = -1;
  let activeBatch = null;
  let activeSeedBatch = null;
  let characterPickerDialog = null;
  let seedGenerationRunning = false;
  let seedVerificationRunning = false;
  let pipelineTargetTab = null;
  const flowConnections = new Map();
  let activeFilter = 'all'; // 'all' | 'pending' | 'completed' (NO 'anchors')
  let searchQuery = '';
  let charactersExpanded = false;

  const characterImageName = character => String(character.flow_tag || character.name || '').replace(/^@/, '').trim();
  const referenceKey = value => String(value || '').replace(/^@/, '').toLowerCase().replace(/[\s_-]+/g, '');
  const seedForReference = name => currentSpec?.characters.find(character =>
    [character.id, character.name, character.flow_tag, character.reference_image]
      .filter(Boolean).some(alias => referenceKey(alias) === referenceKey(name)));
  const unverifiedCharacters = () => currentSpec?.characters.filter(character => character.status !== 'verified') || [];
  const generatableCharacters = () => currentSpec?.characters.filter(character =>
    !['verified', 'creating', 'awaiting_rename'].includes(character.status) && character.flow_submission?.state !== 'unknown') || [];

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
    globalThis.PipelineTools?.log(...args);
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
      max_parallel_generations: currentSpec.max_parallel_generations,
      max_retries: currentSpec.max_retries,
      output_folder: currentSpec.project_dir || currentSpec.output_folder || "ancient_humans_scenes",
      project_dir: currentSpec.project_dir || currentSpec.output_folder || "ancient_humans_scenes",
      reference_library: currentSpec.reference_library || [],
      ai_reviewer: currentSpec.ai_reviewer || {},
      ai_reviewer_chat_url: currentSpec.ai_reviewer_chat_url || null,
      ai_reviewer_context_revision: currentSpec.ai_reviewer_context_revision || null,
      characters: currentSpec.characters.map(c => ({
        id: c.id,
        name: c.name,
        flow_tag: c.flow_tag,
        reference_image: c.reference_image,
        character_references: c.character_references || [],
        style_references: c.style_references || [],
        image_references: c.image_references || [],
        reference_assignments: c.reference_assignments,
        character_prompt: c.character_prompt || c.prompt || c.description || "",
        status: c.status,
        image_url: c.image_url || null,
        image_tile_id: c.image_tile_id || null,
        image_tile_title: c.image_tile_title || null,
        image_title_unique: c.image_title_unique === true,
        flow_submission: c.flow_submission || null,
        error: c.error || null
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
        style_references: v.style_references || [],
        image_references: v.image_references || [],
        reference_assignments: v.reference_assignments,
        frame_reference: v.frame_reference || null,
        continuity: v.continuity,
        target_filename: v.target_filename,
        flow_tile_title: v.flow_tile_title || getLocalFrameTitle(v.target_filename) || null,
        status: v.status,
        progress: v.progress,
        result_url: v.result_url || null,
        completed_at: v.completed_at || null,
        error: v.error || null,
        retryable: v.retryable,
        flow_submission: v.flow_submission || null,
        ai_review: v.ai_review || null,
        reference_statement: v.reference_statement || null,
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
        `${v.id}.png` === cleanRef ||
        v.target_filename === cleanRef || 
        v.target_filename === `${cleanRef}.png` ||
        (v.frame_number && String(v.frame_number) === cleanRef) ||
        (v.frame_number && `frame_${String(v.frame_number).padStart(3, '0')}` === cleanRef)
      );
      return matched || null;
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
  const VISUAL_LOOKS_DIRECTIVE = '# Use provided reference for visual looks.';
  const withVisualLooksDirective = guidance => {
    const body = String(guidance || '').trim();
    return body.endsWith(VISUAL_LOOKS_DIRECTIVE) ? body : `${body}${body ? '\n\n' : ''}${VISUAL_LOOKS_DIRECTIVE}`;
  };

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
    const editedNames = Array.isArray(frame.reference_assignments)
      ? [...new Set([
        ...resolveCharacterReferenceLabels(frame.character_references, currentSpec?.characters || []),
        ...(globalThis.PipelineReferences?.entries(frame) || []).filter(ref => !ref.missing).map(ref => ref.name)
      ])] : null;
    const charRefLabels = editedNames || [...resolveCharacterReferenceLabels(frame.character_references, currentSpec?.characters || []),
      ...(frame.style_references || []).map(ref => typeof ref === 'string' ? ref : ref.name || ref.tag || ref.id),
      ...(frame.image_references || []).map(ref => typeof ref === 'string' ? ref : ref.name || ref.tag || ref.id)].filter(Boolean);
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
      return withVisualLooksDirective(stmt);
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
        return withVisualLooksDirective(`### Reference Guidance:\n${legacy}\n\n${UNIVERSAL_REFERENCE_RULES}`);
      }
    }

    // Auto-synthesized guidance statement
    const automatic = getReferenceGuidanceStatement(charRefLabels, cleanFlowTitle, null, frame.continuity);
    const usage = globalThis.PipelineReferences?.usageGuidance(frame);
    return withVisualLooksDirective(automatic && charRefLabels.length ? `${automatic}\n\n${usage || `Attached references: ${charRefLabels.map(name => `@${String(name).replace(/^@/, '')}`).join(', ')}.`}` : automatic);
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
      const chosen = foundChar ? (foundChar.flow_tag || foundChar.name) : ref;
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
      max_parallel_generations: concurrency.normalizeMaxParallel(raw.max_parallel_generations ?? raw.parallel_gen_value ?? raw.global_settings?.max_parallel_generations),
      max_retries: concurrency.normalizeMaxParallel(raw.max_retries ?? raw.global_settings?.max_retries ?? 3),
      output_folder: projectDir,
      reference_library: globalThis.PipelineReferences?.normalizeLibrary(raw.reference_library) || [],
      ai_reviewer: raw.ai_reviewer || {},
      ai_reviewer_chat_url: raw.ai_reviewer_chat_url || null,
      ai_reviewer_context_revision: raw.ai_reviewer_context_revision || null,
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
          character_references: Array.isArray(c.character_references) ? c.character_references : c.character_references ? [c.character_references] : [],
          style_references: Array.isArray(c.style_references) ? c.style_references : c.style_references ? [c.style_references] : [],
          image_references: Array.isArray(c.image_references) ? c.image_references : c.image_references ? [c.image_references] : [],
          reference_assignments: Array.isArray(c.reference_assignments) ? c.reference_assignments.filter(Boolean).map(assignment => ({ reference_id: String(assignment.reference_id || ''), role: ['character', 'style', 'image'].includes(assignment.role) ? assignment.role : 'image' })) : undefined,
          character_prompt: charPrompt,
          prompt: charPrompt,
          description: charPrompt,
          status: c.status === 'creating' ? (c.image_url ? 'awaiting_rename' : 'error') : c.status === 'verified' && !c.image_tile_id && !c.image_url ? 'missing' : c.status || "missing",
          image_url: c.image_url || null,
          image_tile_id: c.image_tile_id || null,
          image_tile_title: c.image_tile_title || null,
          image_title_unique: c.image_title_unique === true,
          flow_submission: c.flow_submission || (c.status === 'creating' && !c.image_url ? { state: 'unknown' } : null),
          error: c.error || null
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
          character_references: Array.isArray(c.character_references) ? c.character_references : c.character_references ? [c.character_references] : [],
          style_references: Array.isArray(c.style_references) ? c.style_references : c.style_references ? [c.style_references] : [],
          image_references: Array.isArray(c.image_references) ? c.image_references : c.image_references ? [c.image_references] : [],
          reference_assignments: Array.isArray(c.reference_assignments) ? c.reference_assignments.filter(Boolean).map(assignment => ({ reference_id: String(assignment.reference_id || ''), role: ['character', 'style', 'image'].includes(assignment.role) ? assignment.role : 'image' })) : undefined,
          character_prompt: charPrompt,
          prompt: charPrompt,
          description: charPrompt,
          status: c.status === 'creating' ? (c.image_url ? 'awaiting_rename' : 'error') : c.status === 'verified' && !c.image_tile_id && !c.image_url ? 'missing' : c.status || "missing",
          image_url: c.image_url || null,
          image_tile_id: c.image_tile_id || null,
          image_tile_title: c.image_tile_title || null,
          image_title_unique: c.image_title_unique === true,
          flow_submission: c.flow_submission || (c.status === 'creating' && !c.image_url ? { state: 'unknown' } : null),
          error: c.error || null
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

      // Restoring a saved badge does not restore an active content-script run.
      // Keep its submission receipt, but show it as waiting for Resume.
      const wasGenerating = v.status === 'generating';
      const status = wasGenerating ? 'pending' : v.status || "pending";
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
        style_references: Array.isArray(v.style_references) ? v.style_references : v.style_references ? [v.style_references] : [],
        image_references: Array.isArray(v.image_references) ? v.image_references : v.image_references ? [v.image_references] : [],
        reference_assignments: Array.isArray(v.reference_assignments) ? v.reference_assignments.filter(Boolean).map(assignment => ({ reference_id: String(assignment.reference_id || ''), role: ['character', 'style', 'image'].includes(assignment.role) ? assignment.role : 'image' })) : undefined,
        ai_review: v.ai_review || null,
        frame_reference: rawFrameRef,
        continuity: continuity,
        target_filename: targetFilename,
        flow_tile_title: v.flow_tile_title || getLocalFrameTitle(targetFilename) || null,
        status: status,
        progress: progress,
        result_url: v.result_url || null,
        completed_at: v.completed_at || null,
        error: v.error || null,
        retryable: v.retryable,
        flow_submission: v.flow_submission || (wasGenerating || (status === 'error' && /Failed to fill prompt|Timed out waiting for Flow to accept/i.test(v.error || '')) ? { state: 'unknown' } : null),
        reference_statement: referenceStatement,
        reference_instructions: refInstructions,
        formatted_reference_guidance: v.formatted_reference_guidance || null
      };
    });

    currentSpec = spec;
    globalThis.PipelineReferences?.initialize();

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
    globalThis.PipelineTools?.record('info', `Loaded ${spec.project_name} (${spec.visuals.length} frames).`);
  }

  function renderPipelineDashboard() {
    if (!currentSpec) return;
    globalThis.PipelineTools?.refresh();

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
          <span id="pipeline-status-text">${seedGenerationRunning ? 'Generating character images...' : pipelineRunning ? 'Pipeline Generating...' : unverifiedCharacters().length ? 'Character images need generation or renaming' : 'Pipeline Idle • Ready'}</span>
          <span id="pipeline-progress-text">${completedCount}/${totalCount} (${percentFinished}%)</span>
        </div>
        <div class="pipeline-progress-track">
          <div class="pipeline-progress-bar" id="pipeline-progress-bar" style="width: ${percentFinished}%;"></div>
        </div>
        <label class="parallel-generations-control" for="parallel-generations-input">
          Parallel generations
          <input id="parallel-generations-input" type="number" min="1" step="1" value="${currentSpec.max_parallel_generations}" ${pipelineRunning ? 'disabled' : ''} />
          <span>Dependent frames run sequentially</span>
        </label>
        <label class="auto-validation-control" for="auto-validation-input">
          <input id="auto-validation-input" type="checkbox" ${currentSpec.ai_reviewer?.enabled === true ? 'checked' : ''} ${pipelineRunning ? 'disabled' : ''} />
          <span><strong>Validate images automatically</strong><small>Send each candidate, visual prompt, and narration to DeepSeek. Automatic correction is on by default; adjust its limit in AI reviewer settings.</small></span>
        </label>
        <div class="pipeline-action-buttons">
          <button class="btn-generate-characters" id="btn-generate-characters" ${pipelineRunning || seedVerificationRunning || !generatableCharacters().length ? 'disabled' : ''}>
            ${seedGenerationRunning ? '⏳ Generating Characters...' : '🎨 Generate Characters'}
          </button>
          <button class="btn-start-pipeline" id="btn-start-pipeline" ${pipelineRunning || seedVerificationRunning || (completedCount === totalCount && totalCount > 0 && !globalThis.PipelineReviewer?.hasUnapproved()) ? 'disabled' : ''}>
            ${pipelineRunning && !seedGenerationRunning ? '⏳ Generating...' : (completedCount > 0 && remainingCount > 0) ? `▶ Resume Pipeline (Frame #${nextFrameNum})` : completedCount === totalCount ? (globalThis.PipelineReviewer?.hasUnapproved() ? '▶ Resume AI review' : '✓ All Completed') : '▶ Start Pipeline'}
          </button>
          <button class="btn-pause-pipeline" id="btn-pause-pipeline" style="display: ${pipelineRunning ? 'inline-flex' : 'none'};">
            ⏸ Pause
          </button>
          <button class="btn-download-all" id="btn-download-all" ${completedCount === 0 ? 'disabled' : ''}>
            ⬇ Download All
          </button>
        </div>
        ${unverifiedCharacters().length ? `<p class="pipeline-character-hint">Frame generation is waiting for ${unverifiedCharacters().length} character image(s): ${escapeHtml(unverifiedCharacters().slice(0, 8).map(characterImageName).join(', '))}${unverifiedCharacters().length > 8 ? `, and ${unverifiedCharacters().length - 8} more` : ''}. Rename them in Flow, then verify or choose their existing images below.</p>` : ''}
      </div>

      <!-- Collapsible Characters & References -->
      <div class="section-accordion-header" id="toggle-chars-section">
        <div class="accordion-title-left">
          <span id="chars-chevron">${charactersExpanded ? '▼' : '❯'}</span>
          <span>CHARACTERS & REFERENCES</span>
          <span class="accordion-badge">${currentSpec.reference_library?.length || currentSpec.characters.length}</span>
        </div>
        <div class="accordion-actions-right">
          <button class="btn-dark-pill" id="btn-manage-references" ${pipelineRunning ? 'disabled' : ''} style="padding: 4px 10px; font-size: 11px;">Manage references</button>
          <button class="btn-dark-pill" id="btn-recheck-chars" ${pipelineRunning || seedVerificationRunning ? 'disabled' : ''} style="padding: 4px 10px; font-size: 11px;">✔ Verify renamed images</button>
        </div>
      </div>
      <div class="characters-list" id="chars-container" style="display: ${charactersExpanded ? 'flex' : 'none'};">
        <p class="reference-hint">Generate these as ordinary Flow images using the Generate Characters button above. Rename each completed image to its @tag (without @). Start Pipeline verifies the names before submitting frames. Keep renamed images visible in Flow while verifying; its grid loads images as you scroll.</p>
        ${globalThis.PipelineReferences?.renderLibrarySummary() || ''}
        ${renderCharactersList()}
      </div>

      <!-- Visual Production Sequence Header -->
      <div class="sequence-header-row">
        <div class="sequence-title-area">
          <span class="sequence-title">VISUAL PRODUCTION SEQUENCE</span>
          <span class="badge-sequence-count">${totalCount} Frames</span>
        </div>
        <div class="sequence-header-actions">
          <button class="btn-dark-pill" id="btn-sync-tiles" title="Recover uniquely matching generated images from the open Flow project">🔄 Sync Flow Images</button>
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
    return currentSpec.characters.map((c, index) => {
      const name = characterImageName(c).toLowerCase();
      const preview = currentSpec.reference_library.find(ref => ref.name.toLowerCase() === name)?.preview_url || c.image_url;
      return `
      <div class="character-card" id="char-card-${escapeAttr(c.id)}">
        <div class="char-header-row">
          <div class="char-info">
            ${preview ? `<button type="button" class="reference-preview-button" data-preview-url="${escapeAttr(preview)}" data-preview-name="${escapeAttr(c.name)}" title="View character image"><img class="reference-thumb" src="${escapeAttr(globalThis.PipelineReferencePreview?.source(preview) || preview)}" alt="${escapeAttr(c.name)}" loading="lazy" /></button>` : '<div class="char-avatar">👤</div>'}
            <div>
              <div class="char-name">${escapeHtml(c.name)}</div>
              <div class="char-tag">${escapeHtml(c.flow_tag)}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge ${c.status === 'verified' ? 'badge-verified' : 'badge-missing'}" id="char-badge-${escapeAttr(c.id)}">
              ${c.status === 'verified' ? '✓ Image verified' : c.status === 'creating' ? '⏳ Generating image...' : c.status === 'awaiting_rename' ? '✎ Reconnect or rename image' : c.status === 'error' ? '⚠️ Generation needs attention' : '⚠️ Image not verified'}
            </span>
            ${!['verified', 'creating', 'awaiting_rename'].includes(c.status) ? `
              <button class="btn-dark-pill btn-create-char" data-id="${escapeAttr(c.id)}" ${pipelineRunning || seedVerificationRunning || c.flow_submission?.state === 'unknown' ? 'disabled' : ''} style="padding: 4px 8px; font-size: 11px;">
                ${c.flow_submission?.state === 'accepted' ? '↻ Resume image' : '➕ Generate image'}
              </button>
            ` : ''}
            ${c.status !== 'creating' ? `<button class="btn-dark-pill btn-choose-character-image" data-id="${escapeAttr(c.id)}" ${pipelineRunning || seedVerificationRunning ? 'disabled' : ''} style="padding: 4px 8px; font-size: 11px;">Choose existing image</button>` : ''}
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
            <div class="char-prompt-body" id="char-prompt-text-${escapeAttr(c.id)}">${escapeHtml(`${c.prompt || c.description}\n\n${characterReferenceGuidance(c)}`)}</div>
            ${c.image_tile_title && c.status !== 'verified' ? `<div class="char-ref-pill">Flow title: ${escapeHtml(c.image_tile_title)}</div>` : ''}
          </div>
        ` : ''}
        ${globalThis.PipelineReferences?.renderCharacter(c, index) || ''}
        ${c.error ? `<div class="frame-error-message" role="alert">${escapeHtml(c.error)}</div>` : ''}
      </div>
    `;
    }).join('');
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
      const referencedVisual = resolveReferencedVisual(f, idx);
      const isAnchor = !concurrency.isDependentFrame(f);
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
              <span class="continuity-pill chained">🔗 References ${escapeHtml(referencedVisual ? `Frame #${referencedVisual.frame_number}` : refLabel)}</span>
            `}
            ${timeStr ? `<span class="timestamp-pill">${escapeHtml(timeStr)}</span>` : ''}
          </div>
          <div class="status-pill ${f.status === 'completed' ? 'completed' : f.status === 'generating' ? 'generating' : f.status === 'error' ? 'failed' : 'pending'}" id="frame-status-${idx}">
            <span class="status-indicator-dot"></span>
            <span>${f.status === 'generating' ? `Generating ${f.progress}%` : f.status === 'completed' ? 'Completed' : f.status === 'error' ? 'Failed' : 'Pending'}</span>
          </div>
        </div>

        <div class="frame-error-message" id="frame-error-${idx}" role="alert" style="display: ${f.status === 'error' && f.error ? 'block' : 'none'};">${escapeHtml(f.error || '')}</div>

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
        ${globalThis.PipelineReferences?.renderFrame(f, idx) || ''}
        ${globalThis.PipelineReviewer?.renderFrame(f, idx) || ''}
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
            ${globalThis.PipelineReviewer?.renderAction(f, idx) || ''}
            ${globalThis.PipelineRecovery?.renderAction(f, idx) || ''}
            <button class="btn-footer-reroll btn-regen-frame" data-index="${idx}" ${pipelineRunning || unverifiedCharacters().length ? 'disabled' : ''}>🔄 Re-roll</button>
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
          const basePrompt = frame.prompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();
          navigator.clipboard.writeText(`${basePrompt}\n\n${formatReferenceGuidance(frame, idx)}`).then(() => {
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
    const btnGenerateCharacters = document.getElementById('btn-generate-characters');
    const btnPause = document.getElementById('btn-pause-pipeline');
    const btnRecheck = document.getElementById('btn-recheck-chars');
    const btnDownloadAll = document.getElementById('btn-download-all');
    const collectionUrlInput = document.getElementById('collection-url-input');
    const btnUseOpenFlow = document.getElementById('btn-use-open-flow');
    const parallelInput = document.getElementById('parallel-generations-input');
    if (parallelInput) parallelInput.addEventListener('change', () => {
      currentSpec.max_parallel_generations = concurrency.normalizeMaxParallel(parallelInput.value);
      parallelInput.value = currentSpec.max_parallel_generations;
      savePipelineMapping();
    });
    const autoValidationInput = document.getElementById('auto-validation-input');
    if (autoValidationInput) autoValidationInput.addEventListener('change', async () => {
      autoValidationInput.disabled = true;
      if (btnStart) btnStart.disabled = true;
      try {
        if (!globalThis.PipelineReviewer) throw new Error('AI reviewer is still loading. Try again in a moment.');
        await globalThis.PipelineReviewer.setAutomaticReview(autoValidationInput.checked);
        globalThis.PipelineTools?.record('info', `Automatic AI validation ${autoValidationInput.checked ? 'enabled' : 'disabled'} for this project.`, { phase: 'AI reviewer' });
      } catch (error) {
        autoValidationInput.checked = currentSpec.ai_reviewer?.enabled === true;
        globalThis.PipelineTools?.record('error', error.message, { phase: 'AI reviewer' });
      } finally { updateUIStatus(); }
    });

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
        if (pipelineRunning) return;
        savePipelineMapping();
        currentSpec = null;
        renderUploadScreen();
        globalThis.PipelineTools?.refresh();
      });
    }

    if (btnStart) btnStart.addEventListener('click', startPipeline);
    btnGenerateCharacters?.addEventListener('click', createAllMissingCharacters);
    if (btnPause) btnPause.addEventListener('click', pausePipeline);
    if (btnRecheck) btnRecheck.addEventListener('click', checkFlowCharacters);
    document.getElementById('btn-manage-references')?.addEventListener('click', () => globalThis.PipelineReferences?.openLibrary());
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
          charactersExpanded = isHidden;
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

    document.querySelectorAll('.btn-create-char').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const charId = e.target.dataset.id;
        createSingleCharacter(charId);
      });
    });

    document.querySelectorAll('.btn-choose-character-image').forEach(btn => {
      btn.addEventListener('click', () => void chooseCharacterImage(btn.dataset.id));
    });

    document.querySelectorAll('.btn-copy-prompt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const charId = e.target.dataset.id;
        const c = currentSpec?.characters?.find(item => item.id === charId);
        if (c) {
          const promptText = `${c.prompt || c.description || ''}\n\n${characterReferenceGuidance(c)}`.trim();
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

  function probeFlowConnection(tabId) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => finish(false), 2000);
      chrome.tabs.sendMessage(tabId, { type: 'CHECK_FLOW_PAGE' }, response => {
        const error = chrome.runtime.lastError;
        finish(!error && typeof response?.isFlowPage === 'boolean');
      });
    });

  }

  function ensureFlowConnection(targetTab) {
    if (flowConnections.has(targetTab.id)) return flowConnections.get(targetTab.id);
    const connecting = (async () => {
      let tab = await getTab(targetTab.id);
      const expectedUrl = flowDestination.normalizeFlowUrl(currentSpec?.collection_url);
      if (!tab || !flowDestination.normalizeFlowUrl(tab.url) || expectedUrl && !flowDestination.isSameFlowUrl(tab.url, expectedUrl)) {
        throw new Error('The saved Flow tab is closed or has moved to another page. Select the project collection before resuming.');
      }
      if (tab.discarded) tab = await new Promise((resolve, reject) => {
        chrome.tabs.update(tab.id, { active: true }, value => {
          const error = chrome.runtime.lastError;
          error ? reject(new Error(error.message)) : resolve(value);
        });
      });
      if (tab.status !== 'complete') tab = await waitForFlowTab(tab.id, expectedUrl || tab.url);
      if (await probeFlowConnection(tab.id)) return tab;

      globalThis.PipelineTools?.record('info', 'Restoring the extension connection to the saved Flow tab.', { tabId: tab.id, phase: 'Connection' });
      // Extension reloads leave already-open pages without a current receiver.
      // Import the same packaged module as the manifest loader. Module caching
      // prevents duplicate listeners when another connection request overlaps.
      // This only attaches automation; it never clicks Generate or reloads Flow.
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
          await import(chrome.runtime.getURL('assets/index.ts-DFAayvhs.js'));
          return true;
        } });
      } catch (error) {
        throw new Error(`Could not reconnect the Flow extension (${error.message}). Refresh the Flow tab and resume; existing image submissions are preserved.`);
      }
      if (!await probeFlowConnection(tab.id)) throw new Error('The Flow extension did not reconnect. Refresh the Flow tab and resume; no generation was submitted.');
      globalThis.PipelineTools?.record('info', 'Flow extension reconnected; continuing the saved pipeline.', { tabId: tab.id, phase: 'Connection' });
      return tab;
    })();
    flowConnections.set(targetTab.id, connecting);
    connecting.finally(() => { if (flowConnections.get(targetTab.id) === connecting) flowConnections.delete(targetTab.id); }).catch(() => {});
    return connecting;
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
        return ensureFlowConnection(boundTab);
      }
      currentSpec.collection_tab_id = null;
    }

    const tabs = await queryFlowTabs();
    const selected = flowDestination.chooseFlowTab(tabs, expectedUrl);

    if (!expectedUrl) {
      if (!selected) throw new Error('Google Flow is not open. Open flow.google.com and try again.');
      return ensureFlowConnection(selected);
    }

    if (selected && flowDestination.isSameFlowUrl(selected.url, expectedUrl)) {
      currentSpec.collection_tab_id = selected.id;
      return ensureFlowConnection(selected);
    }

    if (selected) {
      currentSpec.collection_tab_id = selected.id;
      await updateTabUrl(selected.id, expectedUrl);
      return ensureFlowConnection(await waitForFlowTab(selected.id, expectedUrl));
    }

    const created = await createFlowTab(expectedUrl);
    currentSpec.collection_tab_id = created.id;
    return ensureFlowConnection(await waitForFlowTab(created.id, expectedUrl));
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

  async function createSingleCharacter(charId) {
    const character = currentSpec?.characters.find(item => item.id === charId);
    if (character) await generateCharacterImages([character]);
  }

  async function createAllMissingCharacters() {
    await generateCharacterImages(generatableCharacters());
  }

  async function generateCharacterImages(characters) {
    if (!currentSpec || pipelineRunning || seedVerificationRunning || !characters.length) return;
    const tags = currentSpec.characters.map(character => characterImageName(character).toLowerCase());
    if (tags.some((tag, index) => !tag || tags.indexOf(tag) !== index)) {
      globalThis.PipelineTools?.record('error', 'Every character needs a unique Flow tag before generating reference images.', { phase: 'Character images' });
      return;
    }
    const collectionInput = document.getElementById('collection-url-input');
    if (collectionInput && !saveCollectionDestination(collectionInput.value)) {
      alert('Enter a valid Google Flow collection URL before generating reference images.');
      return;
    }
    pipelineRunning = true;
    seedGenerationRunning = true;
    pipelinePaused = false;
    charactersExpanded = true;
    renderPipelineDashboard();
    try {
      pipelineTargetTab = await getFlowTargetTab();
      await generateCharacterBatch(characters, pipelineTargetTab);
      if (!pipelinePaused && characters.every(character => character.status === 'awaiting_rename')) {
        globalThis.PipelineTools?.record('info', 'Reference images are ready. Rename each Flow image to its displayed tag, then verify them before starting frames.', { phase: 'Character images' });
      }
    } catch (error) {
      globalThis.PipelineTools?.record('error', error.message, { phase: 'Character images' });
      setCollectionDestinationStatus(error.message, true);
    } finally {
      activeSeedBatch = null;
      pipelineTargetTab = null;
      pipelineRunning = false;
      seedGenerationRunning = false;
      renderPipelineDashboard();
      savePipelineMapping();
    }
  }

  function characterReferenceGuidance(character, references = globalThis.PipelineReferences?.entries(character) || []) {
    const instructions = references.filter(ref => !ref.missing).map(ref => {
      const tag = `@${String(ref.name || '').replace(/^@/, '')}`;
      return ref.role === 'character' ? `Use ${tag} for the character's identity, anatomy, and appearance.` :
        ref.role === 'style' ? `Use ${tag} for visual style, linework, color, and character design.` :
          `Use ${tag} for relevant objects or scene details.`;
    });
    return withVisualLooksDirective(instructions.length ? `### Reference Guidance:\n${instructions.join('\n')}` : '');
  }

  function characterImagePayload(character) {
    const basePrompt = String(character.character_prompt || character.prompt || '').trim();
    if (!basePrompt) throw new Error(`${characterImageName(character)} needs a character image prompt.`);
    const references = globalThis.PipelineReferences?.forCharacterGeneration(character) ||
      { references: [], images: [], characters: [], characterAssets: [] };
    const referenceGuidance = characterReferenceGuidance(character, references.references);
    const prompt = `${basePrompt}\n\n${referenceGuidance}`;
    const promptIndex = -1 - currentSpec.characters.indexOf(character);
    const tag = characterImageName(character);
    return {
      specPipeline: true, specLogPhase: 'Character image', prompt, basePrompt, referenceGuidance,
      targetFilename: `character_${tag.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`,
      mode: 'textToImage', aspectRatio: currentSpec.default_aspect_ratio || '16:9',
      model: currentSpec.default_model || 'Nano Banana 2', outputCount: 1,
      folderName: `${getProjectRootFolder()}/characters`,
      autoChangeFileName: true, promptIndex, images: references.images, characters: references.characters,
      characterAssets: references.characterAssets, strictReferences: references.references.length > 0,
      assignedMediaUrls: [
        ...currentSpec.visuals.flatMap((frame, index) => frame.result_url ? [{ url: frame.result_url, promptIndex: index }] : []),
        ...currentSpec.characters.flatMap((seed, index) => seed !== character && seed.image_url ? [{ url: seed.image_url, promptIndex: -1 - index }] : [])
      ],
      resumeSubmission: character.flow_submission?.state === 'accepted' ? character.flow_submission : null
    };
  }

  function generateCharacterBatch(characters, targetTab) {
    for (const character of characters) {
      if (character.flow_submission?.state === 'unknown') {
        throw new Error(`${characterImageName(character)} may already be generating. Find and rename its Flow image before requesting another generation.`);
      }
    }
    // The content submitter serializes Flow's prompt editor while completed
    // submissions occupy independent generation slots.
    const payloads = characters.map(characterImagePayload);
    const groupId = 'seed-group-' + crypto.randomUUID();
    const byPromptIndex = new Map(payloads.map((payload, index) => [payload.promptIndex, characters[index]]));
    const previousStatus = new Map(characters.map(character => [character, character.status]));
    characters.forEach(character => { character.status = 'creating'; character.error = null; });
    renderPipelineDashboard();
    savePipelineMapping();
    globalThis.PipelineTools?.record('info', `Generating ${characters.length} character image(s) with ${currentSpec.max_parallel_generations} active slot(s).`, {
      phase: 'Character images', tabId: targetTab.id, groupId,
      details: { tags: characters.map(characterImageName) }
    });
    return new Promise(resolve => {
      let settled = false;
      let timeoutHandle;
      const batch = { id: groupId, tabId: targetTab.id, byPromptIndex, started: new Set() };
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        chrome.runtime.onMessage.removeListener(listener);
        if (activeSeedBatch === batch) activeSeedBatch = null;
        for (const character of characters) {
          if (character.status !== 'creating') continue;
          if (character.image_url) character.status = 'awaiting_rename';
          else if (!batch.started.has(character)) character.status = previousStatus.get(character);
          else character.status = 'error';
          if (character.status === 'error') character.error ||= error || 'Flow did not deliver the reference image.';
        }
        if (error) globalThis.PipelineTools?.record('error', error, { phase: 'Character images', groupId, tabId: targetTab.id });
        renderPipelineDashboard();
        savePipelineMapping();
        resolve();
      };
      const armTimeout = () => {
        clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          chrome.tabs.sendMessage(targetTab.id, { type: 'CANCEL_PROMPT_GROUP', groupId }, () => { void chrome.runtime.lastError; });
          finish('Flow stopped reporting reference image progress. The prompt will not be resubmitted automatically.');
        }, 330000);
      };
      const listener = (msg, sender) => {
        if (sender.tab && sender.tab.id !== targetTab.id) return;
        if (msg.type === 'VIDEO_GENERATION_PROGRESS' && msg.data?.groupId === groupId) {
          armTimeout();
          return;
        }
        if (msg.type !== 'PROMPT_GROUP_STATUS' || msg.data?.id !== groupId) return;
        armTimeout();
        const current = characters[msg.data.currentPromptIndex];
        if (current) batch.started.add(current);
        let changed = false;
        for (const result of msg.data.results || []) {
          const character = byPromptIndex.get(result.promptIndex);
          if (!character) continue;
          batch.started.add(character);
          if (result.submission) {
            character.flow_submission = result.submission;
            if (result.submission.tileId) character.image_tile_id = result.submission.tileId;
          }
          if (result.error) character.error = result.error;
          if (result.downloadComplete && character.status === 'creating') {
            character.status = character.image_url ? 'awaiting_rename' : 'error';
            if (!character.image_url) character.error ||= 'Flow did not deliver the reference image.';
            changed = true;
          }
        }
        if (['completed', 'error', 'cancelled'].includes(msg.data.status)) {
          finish(msg.data.status === 'completed' && characters.every(character => character.image_url && !character.error) ? null : 'Some character images did not finish. Accepted prompts will not be submitted again automatically.');
        } else {
          savePipelineMapping();
          if (changed) renderPipelineDashboard();
        }
      };
      activeSeedBatch = batch;
      chrome.runtime.onMessage.addListener(listener);
      armTimeout();
      chrome.tabs.sendMessage(targetTab.id, {
        type: 'AUTO_FILL_FLOW', payloads, groupId, concurrentPrompts: currentSpec.max_parallel_generations,
        promptDelaySecondsMin: 0, promptDelaySecondsMax: 0
      }, response => {
        const error = chrome.runtime.lastError;
        if (error || !response?.success) finish(error?.message || response?.error || 'Could not start the reference image.');
      });
    });
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

      let ambiguousCount = 0;
      const normalizeTitle = value => String(value || '').replace(/(?:\u2026|\.{2,})$/, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const urlOwners = new Map(currentSpec.visuals.filter(v => v.result_url).map(v => [v.result_url, v]));
      currentSpec.visuals.forEach(v => {
        if (v.status === 'completed' && v.result_url) return;
        const expected = normalizeTitle(v.flow_tile_title);
        const prompt = normalizeTitle(v.prompt);
        const candidates = tiles.filter(tile => {
          const title = normalizeTitle(tile.title);
          if (!tile.imgSrc || !title) return false;
          if (v.flow_submission?.tileId) return tile.tileId === v.flow_submission.tileId;
          if (expected && !/^(?:test_)?frame_\d+(?:\.png)?$/.test(expected)) {
            return title === expected || (expected.length >= 12 && title.startsWith(expected));
          }
          return title.length > 5 && prompt.includes(title);
        });
        // Do not guess between duplicate generations or reassign another frame's image.
        if (candidates.length > 1 || (candidates.length === 1 && urlOwners.has(candidates[0].imgSrc) && urlOwners.get(candidates[0].imgSrc) !== v)) {
          ambiguousCount++;
          return;
        }
        const matched = candidates[0];
        if (!matched) return;
        v.flow_tile_title = matched.title;
        v.result_url = matched.imgSrc;
        v.status = 'completed';
        v.progress = 100;
        v.completed_at = new Date().toISOString();
        v.error = null;
        v.retryable = false;
        v.flow_submission = null;
        urlOwners.set(matched.imgSrc, v);
        registerLocalFrameTitle(v.target_filename, matched.title);
        registerLocalFrameTitle(v.id, matched.title);
        matchedCount++;
      });

      updateProjectStats();
      updateUIStatus();
      renderPipelineDashboard();
      savePipelineMapping();
      alert(`Recovered ${matchedCount} existing Flow image(s).${ambiguousCount ? ` ${ambiguousCount} frame(s) have ambiguous or already assigned images; edit their Flow Title to the exact unique tile title and sync again.` : ""}`);
  }

  async function scanExistingCharacterImages() {
    const tab = await getFlowTargetTab();
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const selector = 'flow-grid-tile-container';
        const found = new Map();
        const collect = () => {
          for (const tile of document.querySelectorAll(selector)) {
            if (tile.querySelector('flow-pending-tile, .loading-percentage, flow-error-tile, flow-failed-tile')) continue;
            const img = tile.querySelector('img');
            const imgSrc = img?.currentSrc || img?.src;
            const title = (tile.querySelector('.footer-title, span[class*="title"]')?.textContent ||
              (tile.getAttribute('aria-label') || '').replace(/^image\s*/i, '')).trim();
            if (!title || !imgSrc) continue;
            const tileId = tile.getAttribute('data-tile-id') || tile.querySelector('[data-media-id]')?.getAttribute('data-media-id') || null;
            const key = tileId || imgSrc;
            found.set(key, { tileId, title, imgSrc });
          }
        };
        const nextPaint = () => new Promise(resolve => {
          let finished = false;
          const done = () => { if (!finished) { finished = true; resolve(); } };
          requestAnimationFrame(() => requestAnimationFrame(done));
          setTimeout(done, 180);
        });
        const pause = () => new Promise(resolve => setTimeout(resolve, 90));
        collect();
        const first = document.querySelector(selector);
        const ancestors = [];
        for (let node = first?.parentElement; node; node = node.parentElement) ancestors.push(node);
        const scrollable = ancestors.find(node => node.scrollHeight > node.clientHeight + 80 &&
          /auto|scroll/.test(getComputedStyle(node).overflowY)) || document.scrollingElement;
        if (!scrollable) return { tiles: [...found.values()], flowUrl: location.href, completeScan: true };
        const originalTop = scrollable.scrollTop;
        let completeScan = false;
        let steps = 0;
        try {
          const stride = Math.max(200, Math.floor(scrollable.clientHeight * .7));
          for (let top = 0; steps < 140; top += stride, steps++) {
            scrollable.scrollTop = Math.min(top, Math.max(0, scrollable.scrollHeight - scrollable.clientHeight));
            await nextPaint();
            await pause();
            collect();
            if (scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 3) {
              const heightAtBottom = scrollable.scrollHeight;
              await pause();
              await pause();
              await nextPaint();
              collect();
              if (scrollable.scrollHeight <= heightAtBottom + 3) {
                completeScan = true;
                break;
              }
            }
          }
        } finally {
          scrollable.scrollTop = originalTop;
          await nextPaint();
        }
        return { tiles: [...found.values()], flowUrl: location.href, completeScan, scannedSteps: steps + 1 };
      }
    });
    const result = injected?.[0]?.result;
    if (!Array.isArray(result?.tiles)) throw new Error('Could not read existing Flow images. Open the project collection and try again.');
    if (currentSpec?.collection_url && !flowDestination.isSameFlowUrl(result.flowUrl, currentSpec.collection_url)) {
      throw new Error('Flow moved to another project while scanning. Reopen the configured collection and try again.');
    }
    return result;
  }

  function characterImageAssignedElsewhere(tile, character, owner = currentSpec) {
    return owner.characters.some(other => other !== character &&
      ((tile.tileId && other.image_tile_id === tile.tileId) || other.image_url === tile.imgSrc)) ||
      owner.visuals.some(frame => frame.result_url === tile.imgSrc);
  }

  function uniqueFlowImages(tiles) {
    const byMediaAndTitle = new Map();
    for (const tile of tiles || []) {
      if (!tile.imgSrc) continue;
      const key = `${String(tile.title || '').trim().toLowerCase()}\n${tile.imgSrc}`;
      if (!byMediaAndTitle.has(key) || tile.tileId) byMediaAndTitle.set(key, tile);
    }
    return [...byMediaAndTitle.values()];
  }

  function bindCharacterImage(character, tile, flowUrl, owner = currentSpec, uniqueTitleVerified = true) {
    const tag = characterImageName(character);
    character.status = 'verified';
    character.image_tile_id = tile.tileId || null;
    character.image_tile_title = tile.title;
    character.image_url = tile.imgSrc;
    character.image_title_unique = uniqueTitleVerified;
    character.error = null;
    character.flow_submission = { ...character.flow_submission, state: 'accepted', tileId: tile.tileId || null,
      mediaUrl: tile.imgSrc, tileTitle: tile.title, flowUrl, recovery: 'existing-flow-image' };
    const saved = owner.reference_library.find(ref => ref.name.toLowerCase() === tag.toLowerCase());
    const reference = { name: tag, kind: 'image', tile_id: tile.tileId || null,
      preview_url: tile.imgSrc, flow_url: flowUrl || null };
    if (saved) Object.assign(saved, reference);
    else owner.reference_library.push({ id: crypto.randomUUID(), ...reference });
    const seedReference = saved || owner.reference_library.at(-1);
    owner.visuals.forEach(frame => {
      if (!Array.isArray(frame.reference_assignments)) return;
      const declared = Array.isArray(frame.character_references) ? frame.character_references :
        frame.character_references ? [frame.character_references] : [];
      if (!declared.some(ref => seedForReference(typeof ref === 'string' ? ref : ref?.tag || ref?.name || ref?.id) === character)) return;
      const assigned = frame.reference_assignments.some(assignment => {
        const entry = owner.reference_library.find(ref => ref.id === assignment.reference_id);
        return entry && referenceKey(entry.name) === referenceKey(tag);
      });
      if (!assigned) frame.reference_assignments.push({ reference_id: seedReference.id, role: 'character' });
    });
  }

  async function checkFlowCharacters() {
    if (!currentSpec || pipelineRunning || seedVerificationRunning) return false;
    if (!currentSpec.characters.length) return true;
    seedVerificationRunning = true;
    const owner = currentSpec;
    updateUIStatus();
    try {
      const response = await scanExistingCharacterImages();
      if (owner !== currentSpec) return false;
      if (!Array.isArray(response?.tiles)) throw new Error(response?.error || 'Could not scan Flow images. Open the project collection and try again.');
      for (const character of owner.characters) {
        if (character.status === 'creating') continue;
        const tag = characterImageName(character);
        const sameTag = uniqueFlowImages(response.tiles).filter(tile => String(tile.title || '').trim().toLowerCase() === tag.toLowerCase());
        const available = sameTag.filter(tile => !characterImageAssignedElsewhere(tile, character, owner));
        const match = available.length === 1 ? available[0] : null;
        if (match) {
          bindCharacterImage(character, match, response.flowUrl, owner, !!response.completeScan);
        } else if (character.status !== 'verified' || sameTag.length || response.completeScan || response.tiles.some(tile =>
          character.image_tile_id && tile.tileId === character.image_tile_id && tile.title !== tag)) {
          character.status = character.image_url ? 'awaiting_rename' : character.flow_submission?.state === 'accepted' ? 'error' : 'missing';
          character.error = available.length > 1 ? `Several Flow images are named ${tag}. Choose the correct existing image.` :
            sameTag.length && !available.length ? `The image named ${tag} is assigned elsewhere. Choose the correct existing image.` :
            character.flow_submission?.state === 'accepted' && !character.image_url ? 'Flow accepted this seed image, but delivery was interrupted. Use Resume image.' :
            character.flow_submission?.state === 'unknown' ? 'This seed may already be generating. Choose its existing image before generating again.' :
            response.completeScan ? `No unique image named ${tag} was found. Rename it in Flow or choose its existing image.` :
              `Flow's full image grid could not be scanned. Choose the existing image for ${tag} or try verification again.`;
        }
      }
      const verified = owner.characters.filter(character => character.status === 'verified').length;
      globalThis.PipelineTools?.record('info', `${verified}/${owner.characters.length} character images verified by exact Flow title.`, {
        phase: 'Character images', details: { scannedTiles: response.tiles.length, completeScan: response.completeScan,
          missing: owner.characters.filter(character => character.status !== 'verified').map(characterImageName) }
      });
      savePipelineMapping();
      renderPipelineDashboard();
      return verified === owner.characters.length;
    } catch (error) {
      globalThis.PipelineTools?.record('error', error.message, { phase: 'Character images' });
      setCollectionDestinationStatus(error.message, true);
      return false;
    } finally {
      seedVerificationRunning = false;
      updateUIStatus();
    }
  }

  async function chooseCharacterImage(charId) {
    if (!currentSpec || pipelineRunning || seedVerificationRunning) return;
    const owner = currentSpec;
    const character = owner.characters.find(item => item.id === charId);
    if (!character) return;
    const destination = owner.collection_url;
    characterPickerDialog?.close();
    characterPickerDialog?.remove();
    const view = document.createElement('dialog');
    characterPickerDialog = view;
    view.className = 'reference-editor-dialog frame-recovery-dialog';
    view.innerHTML = `<div class="reference-dialog-header"><h2>Choose image · ${escapeHtml(character.name)}</h2><button type="button" class="reference-close" aria-label="Close">✕</button></div>
      <p class="reference-hint">Select the existing Flow image for @${escapeHtml(characterImageName(character))}. If its title differs, rename it in Flow and verify before starting frames.</p>
      <label>Find image<input type="search" data-search placeholder="Search Flow titles"/></label>
      <p class="reference-editor-status" role="status">Scanning existing images throughout the Flow project…</p><div class="frame-recovery-grid"></div>`;
    document.body.appendChild(view);
    view.showModal();
    const close = () => { view.close(); view.remove(); if (characterPickerDialog === view) characterPickerDialog = null; };
    view.querySelector('.reference-close').addEventListener('click', close);
    view.addEventListener('cancel', () => { view.remove(); if (characterPickerDialog === view) characterPickerDialog = null; });
    const status = (message, error = false) => {
      const target = view.querySelector('[role="status"]');
      if (target) { target.textContent = message; target.classList.toggle('error', error); }
    };
    try {
      const response = await scanExistingCharacterImages();
      if (owner !== currentSpec || owner.collection_url !== destination || !view.isConnected) { close(); return; }
      const images = uniqueFlowImages(response.tiles).filter(tile => !characterImageAssignedElsewhere(tile, character, owner));
      const grid = view.querySelector('.frame-recovery-grid');
      grid.innerHTML = images.map((tile, index) => `<button type="button" class="frame-recovery-image" data-tile="${index}"><img src="${escapeAttr(tile.imgSrc)}" alt="${escapeAttr(tile.title)}" loading="lazy"/><span>${escapeHtml(tile.title || 'Untitled image')}</span></button>`).join('');
      status(images.length ? `${images.length} existing image(s) found. Select the correct image; no prompt will be submitted.` :
        'No completed images were found. Open the correct Flow collection and try again.', !images.length);
      view.querySelector('[data-search]').addEventListener('input', event => {
        const query = event.target.value.trim().toLowerCase();
        grid.querySelectorAll('[data-tile]').forEach(button => {
          button.hidden = !String(images[Number(button.dataset.tile)].title || '').toLowerCase().includes(query);
        });
      });
      grid.addEventListener('click', event => {
        const button = event.target.closest('[data-tile]');
        if (!button || pipelineRunning || owner !== currentSpec || owner.collection_url !== destination) return;
        const tile = images[Number(button.dataset.tile)];
        if (!tile || characterImageAssignedElsewhere(tile, character, owner)) {
          status('This image is already assigned elsewhere. Choose another image.', true);
          return;
        }
        const tag = characterImageName(character);
        const sameTitleCount = uniqueFlowImages(response.tiles).filter(candidate =>
          String(candidate.title || '').trim().toLowerCase() === tag.toLowerCase()).length;
        if (String(tile.title || '').trim().toLowerCase() === tag.toLowerCase() && sameTitleCount === 1 && response.completeScan) {
          bindCharacterImage(character, tile, response.flowUrl, owner);
        } else {
          character.image_tile_id = tile.tileId || null;
          character.image_tile_title = tile.title;
          character.image_url = tile.imgSrc;
          character.image_title_unique = false;
          character.status = 'awaiting_rename';
          character.error = sameTitleCount > 1 ? `Several Flow images are titled ${tag}. Give the selected image a unique tag before verifying.` :
            !response.completeScan ? 'Flow did not finish scanning all images. Verify again before using this reference.' :
              `Selected image is titled "${tile.title}". Rename it to ${tag} in Flow, then click Verify renamed images.`;
        }
        savePipelineMapping();
        renderPipelineDashboard();
        globalThis.PipelineTools?.record('info', `Existing Flow image connected to ${tag}.`, {
          phase: 'Character images', details: { tileId: tile.tileId, tileTitle: tile.title, verified: character.status === 'verified' }
        });
        close();
      });
    } catch (error) {
      status(error.message, true);
      globalThis.PipelineTools?.record('error', error.message, { phase: 'Character images' });
    }
  }

  function frameReferenceImages(frame, index) {
    if (!concurrency.isDependentFrame(frame)) return [];
    const reference = resolveReferencedVisual(frame, index);
    if (!reference || reference === frame || reference.status !== 'completed' || !reference.result_url) {
      throw new Error(`Frame #${index + 1} requires a completed reference frame (${frame.frame_reference || 'previous frame'}).`);
    }
    globalThis.PipelineReviewer?.assertApproved(reference);
    return [{
      name: resolveFlowTileTitleForFrame(frame, index) || reference.target_filename,
      referenceExistingOnly: true, isFrameReference: true,
      tileId: reference.flow_submission?.tileId || null, previewUrl: reference.result_url
    }];
  }

  async function startPipeline() {
    if (!currentSpec || pipelineRunning || seedVerificationRunning || globalThis.PipelineReferences?.isBusy() || globalThis.PipelineReviewer?.isBusy()) return;
    const collectionInput = document.getElementById('collection-url-input');
    if (collectionInput && !saveCollectionDestination(collectionInput.value)) {
      alert('Enter a valid Google Flow collection URL before starting.');
      return;
    }
    if (!await checkFlowCharacters()) {
      charactersExpanded = true;
      renderPipelineDashboard();
      globalThis.PipelineTools?.record('warn', 'Frame generation has not started. Rename unresolved character images to their Flow tags or choose their existing images, then click Start Pipeline again.', {
        phase: 'Character images', details: { unverified: unverifiedCharacters().map(characterImageName) }
      });
      return;
    }
    // Lock the run while resolving the destination, too, to prevent double starts.
    pipelineRunning = true;
    pipelinePaused = false;
    updateUIStatus();
    try {
      pipelineTargetTab = await getFlowTargetTab();
      await globalThis.PipelineReviewer?.beforeRun();
      globalThis.PipelineTools?.record('info', 'Pipeline started.', { tabId: pipelineTargetTab.id,
        details: { parallelGenerations: currentSpec.max_parallel_generations, maximumAttempts: currentSpec.max_retries } });
      const plan = concurrency.buildExecutionPlan(currentSpec.visuals);
      for (const step of plan) {
        if (pipelinePaused) break;
        const indexes = step.type === 'independent' ? step.indexes : [step.index];
        for (let attempt = 1; attempt <= currentSpec.max_retries; attempt++) {
          if (pipelinePaused) break;
          const pending = indexes.filter(index => currentSpec.visuals[index].status !== 'completed');
          if (!pending.length) break;
          // Resolve references here, after the preceding batch has completed.
          const payloads = pending.map(index => buildFramePayload(currentSpec.visuals[index], frameReferenceImages(currentSpec.visuals[index], index), index));
          const ok = await executeFrameBatch(payloads, step.type === 'dependent' ? 1 : currentSpec.max_parallel_generations);
          if (ok || pipelinePaused) break;
          // An accepted image with a tracking/download problem must be resumed,
          // and an uncertain click must be reconciled, never regenerated here.
          if (pending.some(index => currentSpec.visuals[index].status !== 'completed' && currentSpec.visuals[index].retryable === false)) break;
          log(`Retrying unfinished frames (attempt ${attempt}/${currentSpec.max_retries}).`);
        }
        if (indexes.some(index => currentSpec.visuals[index].status !== 'completed')) {
          pipelinePaused = true;
          break;
        }
        await globalThis.PipelineReviewer?.afterBatch(indexes);
      }
    } catch (error) {
      pipelinePaused = true;
      const index = currentSpec.visuals.findIndex(frame => frame.status !== 'completed');
      if (index >= 0 && !Number.isInteger(error.reviewFrameIndex)) {
        currentSpec.visuals[index].status = 'error';
        currentSpec.visuals[index].error = error.message;
        updateFrameCard(index);
      }
      setCollectionDestinationStatus(error.message, true);
      globalThis.PipelineTools?.record('error', error.message, Number.isInteger(error.reviewFrameIndex)
        ? { frameNumber: error.reviewFrameIndex + 1, frameName: currentSpec.visuals[error.reviewFrameIndex]?.target_filename, phase: 'AI reviewer' }
        : {});
    } finally {
      pipelineRunning = false;
      pipelineTargetTab = null;
      updateUIStatus();
      updateProjectStats();
      if (!pipelinePaused) void globalThis.PipelineReviewer?.flushAutomaticCorrections();
      savePipelineMapping();
      log(pipelinePaused ? 'Pipeline paused.' : 'Pipeline finished.');
    }
  }

  function pausePipeline() {
    pipelinePaused = true;
    globalThis.PipelineReviewer?.pause();
    globalThis.PipelineTools?.record('warn', 'Pause requested. Stopping new submissions.', { groupId: activeBatch?.id, tabId: activeBatch?.tabId });
    if (activeBatch) {
      chrome.tabs.sendMessage(activeBatch.tabId, {
        type: 'CANCEL_PROMPT_GROUP', groupId: activeBatch.id
      }, () => { void chrome.runtime.lastError; });
    }
    if (activeSeedBatch) {
      chrome.tabs.sendMessage(activeSeedBatch.tabId, {
        type: 'CANCEL_PROMPT_GROUP', groupId: activeSeedBatch.id
      }, () => { void chrome.runtime.lastError; });
    }
    // Keep the run locked until the content submitter acknowledges cancellation.
    updateUIStatus();
    savePipelineMapping();
  }

  async function regenerateSingleFrame(idx) {
    if (!currentSpec || pipelineRunning || globalThis.PipelineReferences?.isBusy() || globalThis.PipelineReviewer?.isBusy()) return;
    const collectionInput = document.getElementById('collection-url-input');
    if (collectionInput && !saveCollectionDestination(collectionInput.value)) {
      alert('Enter a valid Google Flow collection URL before generating.');
      return;
    }
    if (!await checkFlowCharacters()) {
      charactersExpanded = true;
      renderPipelineDashboard();
      return;
    }
    pipelineRunning = true;
    pipelinePaused = false;
    updateUIStatus();
    const frame = currentSpec.visuals[idx];
    try {
      pipelineTargetTab = await getFlowTargetTab();
      await globalThis.PipelineReviewer?.beforeRun();
      const references = frameReferenceImages(frame, idx);
      globalThis.PipelineReviewer?.resetFrame(frame, idx);
      frame.status = 'generating';
      frame.progress = 5;
      frame.result_url = null;
      frame.error = null;
      frame.flow_submission = null; // Re-roll explicitly authorizes a fresh image.
      frame.retryable = undefined;
      updateFrameCard(idx);
      if (await executeFrameGeneration(frame, references, idx)) await globalThis.PipelineReviewer?.afterBatch([idx]);
    } catch (error) {
      frame.status = 'error';
      frame.error = error.message;
      globalThis.PipelineTools?.record('error', error.message, { frameNumber: idx + 1 });
      setCollectionDestinationStatus(error.message, true);
    } finally {
      pipelineRunning = false;
      pipelineTargetTab = null;
      updateFrameCard(idx);
      updateProjectStats();
      updateUIStatus();
      savePipelineMapping();
      if (!pipelinePaused) void globalThis.PipelineReviewer?.flushAutomaticCorrections();
    }
  }

  function buildFramePayload(frame, refImages, promptIndex) {
    if (frame.flow_submission?.state === 'unknown') {
      throw new Error(`Frame #${promptIndex + 1} may already have been submitted. Sync the existing image or use Re-roll to explicitly generate another image.`);
    }
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

    const editedReferences = globalThis.PipelineReferences?.forGeneration(frame);
    if (editedReferences) {
      // Keep character references declared by the frame when the user adds
      // further image/style references in the editor. An explicit removal in
      // that editor also removes the name from frame.character_references.
      cleanChars.splice(0, cleanChars.length, ...new Set([...cleanChars, ...editedReferences.characters]));
      refImages = [...refImages.filter(image => image.isFrameReference), ...editedReferences.images];
    }

    // All references are existing Flow images. The role controls prompt
    // guidance, not which category Flow searches for an @ mention.
    const seedNames = new Set();
    for (const name of cleanChars) {
      const seed = seedForReference(name);
      if (!seed) {
        if (!refImages.some(image => String(image.name || '').toLowerCase() === name.toLowerCase())) {
          refImages.push({ name, referenceExistingOnly: true });
        }
        continue;
      }
      if (seed.status !== 'verified') throw new Error(`Rename and verify the Flow image for ${characterImageName(seed)} before generating ${frame.target_filename}.`);
      const tag = characterImageName(seed);
      if (seedNames.has(tag)) continue;
      seedNames.add(tag);
      refImages = refImages.filter(image => String(image.name || '').toLowerCase() !== tag.toLowerCase());
      refImages.push({ name: tag, tileId: seed.image_tile_id, previewUrl: seed.image_url,
        uniqueTitleVerified: seed.image_title_unique === true, referenceExistingOnly: true });
    }

    // A tag can appear in both a legacy character list and an edited
    // assignment. Add it once, retaining the most specific verified image.
    const uniqueImages = new Map();
    for (const image of refImages) {
      const key = String(image.name || '').toLowerCase();
      if (!key) continue;
      const existing = uniqueImages.get(key);
      if (!existing || (!existing.uniqueTitleVerified && image.uniqueTitleVerified)) uniqueImages.set(key, image);
    }
    refImages = [...uniqueImages.values()];

    // Assemble clean base image prompt and decoupled reference guidance
    const rawPrompt = (frame.ai_review?.current_prompt && [frame.ai_review.original_prompt, frame.ai_review.current_prompt].includes(frame.prompt) && globalThis.PipelineReviewer?.shouldReview(frame) ? frame.ai_review.current_prompt : frame.prompt || '').trim();
    const cleanBase = rawPrompt.split(/### Reference Guidance|##\s*use\s*(?:the\s*)?provided/i)[0].trim();

    const guidance = formatReferenceGuidance(frame, promptIndex);
    frame.formatted_reference_guidance = guidance;

    const finalPrompt = guidance ? `${cleanBase}\n\n${guidance}` : cleanBase;

    const payload = {
      specPipeline: true,
      resumeSubmission: frame.flow_submission?.state === 'accepted' ? frame.flow_submission : null,
      assignedMediaUrls: [
        ...currentSpec.visuals.flatMap((visual, index) => visual.result_url ? [{ url: visual.result_url, promptIndex: index }] : []),
        ...currentSpec.characters.flatMap((seed, index) => seed.image_url ? [{ url: seed.image_url, promptIndex: -1 - index }] : [])
      ],
      prompt: finalPrompt,
      basePrompt: cleanBase,
      referenceGuidance: guidance,
      targetFilename: frame.target_filename,
      mode: 'textToImage',
      aspectRatio: currentSpec.default_aspect_ratio || '16:9',
      model: 'Nano Banana 2',
      outputCount: 1,
      autoDownloadResourceQuality: 'original',
      folderName: getProjectFramesFolder(),
      referenceFolder: currentSpec.reference_folder || 'Branded_references',
      autoChangeFileName: true,
      maxRetries: 1,
      promptIndex: promptIndex,
      images: refImages,
      characters: [],
      strictReferences: refImages.length > 0,
      characterAssets: []
    };

    payload.aiReviewer = globalThis.PipelineReviewer?.makeRequest(frame, promptIndex);
    return payload;
  }


  async function executeFrameGeneration(frame, refImages, promptIndex) {
    return executeFrameBatch([buildFramePayload(frame, refImages, promptIndex)], 1);
  }

  async function executeFrameBatch(payloads, maxParallel) {
    if (pipelinePaused) return false;
    const targetTab = pipelineTargetTab ? await ensureFlowConnection(pipelineTargetTab) : await getFlowTargetTab();
    if (pipelinePaused) return false;
    const groupId = 'spec-group-' + crypto.randomUUID();
    const indexes = payloads.map(payload => payload.promptIndex);
    globalThis.PipelineTools?.record('info', `Submitting ${payloads.length} frame(s) with ${maxParallel} active generation slot(s).`, {
      groupId, tabId: targetTab.id, details: { frames: indexes.map(index => index + 1) }
    });
    return new Promise(resolve => {
      let settled = false;
      let timeoutHandle;
      const batch = { id: groupId, tabId: targetTab.id, indexes, integrityError: null, startedIndexes: new Set(), firstFailure: null };
      const finish = (ok, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        chrome.runtime.onMessage.removeListener(listener);
        if (activeBatch === batch) activeBatch = null;
        indexes.forEach(index => {
          const frame = currentSpec.visuals[index];
          if (frame.status !== 'completed') {
            const started = batch.startedIndexes.has(index);
            frame.status = !started || (pipelinePaused && !batch.integrityError && !error) ? 'pending' : 'error';
            frame.progress = 0;
            frame.error = started ? error || frame.error || batch.firstFailure?.error || 'Flow stopped before image collection completed.' : null;
          }
          updateFrameCard(index);
        });
        updateProjectStats();
        if (!ok) {
          const queuedFrames = indexes.filter(index => !batch.startedIndexes.has(index) && currentSpec.visuals[index].status !== 'completed').map(index => index + 1);
          globalThis.PipelineTools?.record(pipelinePaused && !error && !batch.integrityError ? 'warn' : 'error', error || (batch.firstFailure
            ? `Batch stopped after Frame #${batch.firstFailure.promptIndex + 1}: ${batch.firstFailure.error}`
            : 'Flow batch stopped before all images were collected.'), { groupId, tabId: targetTab.id,
              frameNumber: batch.firstFailure ? batch.firstFailure.promptIndex + 1 : undefined, phase: 'Batch', details: { queuedFrames } });
        }
        savePipelineMapping();
        resolve(ok);
      };
      const armTimeout = () => {
        clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          pipelinePaused = true;
          chrome.tabs.sendMessage(targetTab.id, { type: 'CANCEL_PROMPT_GROUP', groupId }, () => { void chrome.runtime.lastError; });
          finish(false, 'Flow stopped reporting generation progress.');
        }, 330000);
      };
      const listener = (msg, sender) => {
        if (sender.tab && sender.tab.id !== targetTab.id) return;
        if (msg.type === 'VIDEO_GENERATION_PROGRESS' && msg.data?.groupId === groupId && indexes.includes(msg.data.promptIndex)) {
          const index = msg.data.promptIndex;
          batch.startedIndexes.add(index);
          const frame = currentSpec.visuals[index];
          if (frame.status !== 'completed') {
            frame.status = 'generating';
            frame.progress = msg.data.percentage || frame.progress;
            updateFrameCard(index);
          }
          armTimeout();
        }
        if (msg.type !== 'PROMPT_GROUP_STATUS' || msg.data?.id !== groupId) return;
        armTimeout();
        const data = msg.data;
        if (Number.isInteger(data.currentPromptIndex)) {
          const index = indexes[data.currentPromptIndex];
          if (index !== undefined && currentSpec.visuals[index].status !== 'completed') {
            batch.startedIndexes.add(index);
            activeFrameIndex = index;
            currentSpec.visuals[index].status = 'generating';
            currentSpec.visuals[index].progress = 5;
            updateFrameCard(index);
          }
        }
        for (const result of data.results || []) {
          if (!indexes.includes(result.promptIndex)) continue;
          batch.startedIndexes.add(result.promptIndex);
          if (result.error && !result.cancelled && result.error !== 'Cancelled' && !batch.firstFailure) batch.firstFailure = { promptIndex: result.promptIndex, error: result.error };
          const frame = currentSpec.visuals[result.promptIndex];
          if (result.submission) frame.flow_submission = result.submission;
          if (typeof result.retryable === 'boolean') frame.retryable = result.retryable;
          if (result.downloadComplete) {
            if (result.success && frame.result_url && !batch.integrityError) {
              frame.status = 'completed';
              frame.progress = 100;
              frame.completed_at = new Date().toISOString();
              frame.error = null;
            } else {
              frame.status = pipelinePaused && !batch.integrityError ? 'pending' : 'error';
              frame.error = batch.integrityError || result.error || 'No generated image was captured.';
            }
            updateFrameCard(result.promptIndex);
          }
        }
        updateProjectStats();
        savePipelineMapping();
        if (['completed', 'error', 'cancelled'].includes(data.status)) {
          finish(data.status === 'completed' && !batch.integrityError && indexes.every(index => currentSpec.visuals[index].status === 'completed'), batch.integrityError);
        }
      };
      activeBatch = batch;
      chrome.runtime.onMessage.addListener(listener);
      armTimeout();
      chrome.tabs.sendMessage(targetTab.id, {
        type: 'AUTO_FILL_FLOW', payloads, groupId, concurrentPrompts: maxParallel,
        promptDelaySecondsMin: 0, promptDelaySecondsMax: 0
      }, response => {
        const error = chrome.runtime.lastError;
        if (error || !response?.success) finish(false, error?.message || response?.error || 'Refresh the Flow tab and try again.');
      });
    });
  }

  function downloadSingleFrame(idx) {
    const frame = currentSpec.visuals[idx];
    if (!frame.result_url) return;
    try { globalThis.PipelineReviewer?.assertApproved(frame); }
    catch (error) { globalThis.PipelineTools?.record('warn', error.message, { frameNumber: idx + 1, phase: 'AI reviewer' }); return; }
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
    globalThis.PipelineReferences?.updateFrame(f, idx);
    globalThis.PipelineReviewer?.updateFrame(f, idx);
    globalThis.PipelineRecovery?.updateFrame(f, idx);
    const errorMessage = document.getElementById(`frame-error-${idx}`);
    if (errorMessage) {
      errorMessage.textContent = f.error || '';
      errorMessage.style.display = f.status === 'error' && f.error ? 'block' : 'none';
    }

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
        const isAnchor = !concurrency.isDependentFrame(f);
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
    if (elPendSub) elPendSub.innerText = remainingCount === 0 ? '✓ Complete' : seedGenerationRunning ? '🕒 Preparing character images' : pipelineRunning ? '🕒 In progress' : '🕒 Pending start';
    if (elProgBar) elProgBar.style.width = `${pct}%`;
    if (elProgText) elProgText.innerText = `${completedCount}/${totalCount} (${pct}%)`;
    if (elStatusText) elStatusText.innerText = seedGenerationRunning ? 'Generating character reference images...' : pipelineRunning ? (pipelinePaused ? 'Pausing...' : 'Pipeline Generating...') : unverifiedCharacters().length ? 'Character images need generation or renaming' : completedCount === totalCount ? (globalThis.PipelineReviewer?.hasUnapproved() ? 'Images generated • AI review pending' : 'Pipeline Finished') : currentSpec.visuals.some(frame => frame.status === 'error') ? 'Pipeline Error • Check failed frames' : pipelinePaused ? 'Pipeline Paused' : 'Pipeline Idle • Ready';

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
    globalThis.PipelineTools?.refresh();
    const btnStart = document.getElementById('btn-start-pipeline');
    const btnGenerateCharacters = document.getElementById('btn-generate-characters');
    const btnPause = document.getElementById('btn-pause-pipeline');
    if (!currentSpec) return;
    const completedCount = currentSpec.visuals.filter(v => v.status === 'completed').length;
    const remainingCount = currentSpec.visuals.length - completedCount;
    const nextPendingIndex = currentSpec.visuals.findIndex(v => v.status !== 'completed');
    const nextFrameNum = nextPendingIndex >= 0 ? currentSpec.visuals[nextPendingIndex].frame_number : currentSpec.visuals.length;

    if (btnStart) {
      btnStart.disabled = pipelineRunning || seedVerificationRunning || !!globalThis.PipelineReferences?.isBusy() || !!globalThis.PipelineReviewer?.isBusy() || (completedCount === currentSpec.visuals.length && currentSpec.visuals.length > 0 && !globalThis.PipelineReviewer?.hasUnapproved());
      btnStart.innerText = pipelineRunning && !seedGenerationRunning ? '⏳ Generating...' : (completedCount > 0 && remainingCount > 0) ? `▶ Resume Pipeline (Frame #${nextFrameNum})` : completedCount === currentSpec.visuals.length ? (globalThis.PipelineReviewer?.hasUnapproved() ? '▶ Resume AI review' : '✓ All Completed') : '▶ Start Pipeline';
    }
    if (btnGenerateCharacters) {
      btnGenerateCharacters.disabled = pipelineRunning || seedVerificationRunning || !generatableCharacters().length ||
        !!globalThis.PipelineReferences?.isBusy() || !!globalThis.PipelineReviewer?.isBusy();
      btnGenerateCharacters.innerText = seedGenerationRunning ? '⏳ Generating Characters...' : '🎨 Generate Characters';
    }
    const parallelInput = document.getElementById('parallel-generations-input');
    if (parallelInput) parallelInput.disabled = pipelineRunning;
    const autoValidationInput = document.getElementById('auto-validation-input');
    if (autoValidationInput) { autoValidationInput.disabled = pipelineRunning; autoValidationInput.checked = currentSpec.ai_reviewer?.enabled === true; }
    const resetButton = document.getElementById('btn-reset-spec');
    if (resetButton) resetButton.disabled = pipelineRunning;
    document.querySelectorAll('.btn-regen-frame, .btn-recover-frame, .btn-edit-prompt, .btn-edit-references, .btn-edit-character-references, #btn-manage-references, #btn-add-frame, #btn-sync-tiles, #collection-url-input, #btn-use-open-flow, #btn-recheck-chars, .btn-create-char, .btn-choose-character-image').forEach(button => {
      button.disabled = pipelineRunning || seedVerificationRunning || !!globalThis.PipelineReferences?.isBusy() ||
        !!globalThis.PipelineReviewer?.isBusy() ||
        (button.classList.contains('btn-regen-frame') && unverifiedCharacters().length > 0) ||
        (button.classList.contains('btn-create-char') && currentSpec.characters.find(character => character.id === button.dataset.id)?.flow_submission?.state === 'unknown');
    });
    globalThis.PipelineReviewer?.refresh();
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

  // Optional module boundary: the pipeline exposes generation and storage callbacks only.
  function configureReviewer() {
    if (!globalThis.PipelineReviewer) return;
    globalThis.PipelineReviewer.configure({
    getSpec: () => currentSpec, isRunning: () => pipelineRunning,
    previous: resolveReferencedVisual, pausePipeline,
    log: (message, index) => globalThis.PipelineTools?.record('error', message, { phase: 'AI reviewer', ...(Number.isInteger(index) ? { frameNumber: index + 1, frameName: currentSpec?.visuals[index]?.target_filename } : {}) }),
    onChange: () => {
      savePipelineMapping(); updateUIStatus();
      currentSpec?.visuals.forEach((frame, index) => globalThis.PipelineReferences?.updateFrame(frame, index));
    },
    publish: (index, reviewedImageUrl) => new Promise((resolve, reject) => {
      const frame = currentSpec.visuals[index];
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_RESOURCE', url: reviewedImageUrl || frame.result_url, filename: frame.target_filename,
        folder: getProjectFramesFolder(), autoChangeFileName: true }, response => {
        const error = chrome.runtime.lastError;
        error || !response?.success ? reject(new Error(error?.message || response?.error || 'Could not publish approved image.')) : resolve();
      });
    }),
    applyCandidate: (index, job) => {
      const frame = currentSpec.visuals[index];
      Object.assign(frame, { result_url: job.mediaUrl, flow_submission: job.submission, status: 'completed', progress: 100, error: null });
      if (job.submission?.tileTitle) {
        frame.flow_tile_title = job.submission.tileTitle;
        registerLocalFrameTitle(frame.target_filename, job.submission.tileTitle);
        if (frame.id) registerLocalFrameTitle(frame.id, job.submission.tileTitle);
      }
      updateFrameCard(index);
    },
    generateCorrection: async index => {
      const ownRun = !pipelineRunning;
      if (ownRun) { pipelineRunning = true; pipelinePaused = false; updateUIStatus(); }
      const frame = currentSpec.visuals[index];
      try {
        Object.assign(frame, { status: 'pending', result_url: null, flow_submission: null, error: null, retryable: undefined, progress: 0 });
        updateFrameCard(index); savePipelineMapping();
        if (unverifiedCharacters().length) throw new Error('Verify the renamed Flow character images before regenerating a frame.');
        if (ownRun) pipelineTargetTab = await getFlowTargetTab();
        if (pipelinePaused) throw new Error('Pipeline paused before correction.');
        const refs = frameReferenceImages(frame, index);
        const success = await executeFrameGeneration(frame, refs, index);
        if (!success) throw new Error(frame.error || 'Corrected generation did not complete; resume tracking before trying again.');
        if (ownRun) await globalThis.PipelineReviewer?.afterBatch([index]);
        return true;
      } finally {
        if (ownRun) {
          pipelineRunning = false; pipelineTargetTab = null; updateUIStatus(); savePipelineMapping();
          if (!pipelinePaused) void globalThis.PipelineReviewer?.flushAutomaticCorrections();
        }
      }
    }
    });
    if (currentSpec) renderPipelineDashboard();
  }
  document.addEventListener('pipeline-reviewer-ready', configureReviewer, { once: true });
  configureReviewer();

  globalThis.PipelineRecovery?.configure({
    getSpec: () => currentSpec, isRunning: () => pipelineRunning,
    scan: () => sendToFlowTab({ type: 'SCAN_PROJECT_TILES' }),
    log: message => globalThis.PipelineTools?.record('error', message, { phase: 'Image recovery' }),
    apply: (index, tile, flowUrl) => {
      const frame = currentSpec.visuals[index];
      if (pipelineRunning) throw new Error('Pause the pipeline before reconnecting an image.');
      if (currentSpec.collection_url && !flowDestination.isSameFlowUrl(flowUrl, currentSpec.collection_url)) throw new Error('The Flow collection changed. Reopen the picker for this project.');
      if (!tile.imgSrc || currentSpec.visuals.some((other, otherIndex) => otherIndex !== index &&
        (other.result_url === tile.imgSrc || tile.tileId && other.flow_submission?.tileId === tile.tileId))) throw new Error('This image is unavailable or already belongs to another frame.');
      Object.assign(frame, { result_url: tile.imgSrc, flow_tile_title: tile.title, status: 'completed', progress: 100,
        error: null, retryable: false, completed_at: new Date().toISOString(),
        flow_submission: { ...frame.flow_submission, state: 'accepted', tileId: tile.tileId || null,
          mediaUrl: tile.imgSrc, tileTitle: tile.title, flowUrl, recoveredAt: Date.now(), recovery: 'user-selected-image' } });
      registerLocalFrameTitle(frame.target_filename, tile.title);
      if (frame.id) registerLocalFrameTitle(frame.id, tile.title);
      currentSpec.visuals.forEach((visual, visualIndex) => { visual.formatted_reference_guidance = formatReferenceGuidance(visual, visualIndex); });
      savePipelineMapping(); renderPipelineDashboard(); updateUIStatus();
      globalThis.PipelineTools?.record('info', 'Existing Flow image reconnected. Resume to continue from the next unfinished frame.', {
        frameNumber: index + 1, frameName: frame.target_filename, phase: 'Image recovery', details: { tileId: tile.tileId, tileTitle: tile.title, automaticResubmission: false } });
    }
  });

  globalThis.PipelineReferences?.configure({
    getSpec: () => currentSpec, isRunning: () => pipelineRunning, sendToFlow: sendToFlowTab,
    scanImages: scanExistingCharacterImages,
    onBusyChange: updateUIStatus,
    resolveCharacterLabels: refs => resolveCharacterReferenceLabels(refs, currentSpec?.characters || []),
    resolvePreviousFrame: resolveReferencedVisual,
    onChange: index => {
      if (!currentSpec || pipelineRunning) return;
      currentSpec.visuals.forEach((frame, frameIndex) => { frame.formatted_reference_guidance = formatReferenceGuidance(frame, frameIndex); });
      savePipelineMapping();
      renderPipelineDashboard();
      updateUIStatus();
      globalThis.PipelineTools?.record('info', index === undefined ? 'Reference library updated.' : 'Frame references saved.', {
        frameNumber: index === undefined ? undefined : index + 1, phase: 'References'
      });
    }
  });

  globalThis.PipelineTools?.configure({
    getSpec: () => currentSpec,
    isRunning: () => pipelineRunning,
    applySettings: values => {
      if (!currentSpec || pipelineRunning) throw new Error('Pause the pipeline before changing settings.');
      const folder = sanitizeProjectDir(values.project_dir);
      if (!folder) throw new Error('Enter a valid output folder.');
      Object.assign(currentSpec, values, { project_dir: folder, output_folder: folder, default_model: 'Nano Banana 2' });
      savePipelineMapping();
      renderPipelineDashboard();
      updateUIStatus();
    }
  });

  // Hook global incoming messages from Content Script / Background Worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SPEC_FRAME_IMAGE_CAPTURED' && activeSeedBatch?.id === msg.groupId) {
      const batch = activeSeedBatch;
      const character = batch.byPromptIndex.get(msg.promptIndex);
      if (!character || (sender.tab && sender.tab.id !== batch.tabId) || !msg.mediaUrl ||
          currentSpec?.characters.some(other => other !== character && other.image_url === msg.mediaUrl)) {
        sendResponse?.({ success: false, error: 'Reference image capture does not match the active seed.' });
        return;
      }
      batch.started.add(character);
      character.image_url = msg.mediaUrl;
      character.image_tile_title = msg.tileTitle || null;
      savePipelineMapping();
      sendResponse?.({ success: true });
      return;
    }
    if (msg.type === 'SPEC_FRAME_IMAGE_CAPTURED' && currentSpec) {
      if (!activeBatch || msg.groupId !== activeBatch.id || !activeBatch.indexes.includes(msg.promptIndex) || (sender.tab && sender.tab.id !== activeBatch.tabId)) {
        sendResponse?.({ success: false, error: 'Capture does not belong to the active Flow batch.' });
        return;
      }
      const duplicate = currentSpec.visuals.some((frame, index) => index !== msg.promptIndex && frame.result_url === msg.mediaUrl);
      if (!msg.mediaUrl || duplicate) {
        activeBatch.integrityError = 'Captured image is already assigned to another frame or has no URL.';
        currentSpec.visuals[msg.promptIndex].error = activeBatch.integrityError;
        sendResponse?.({ success: false, error: activeBatch.integrityError });
        pausePipeline();
        return;
      }
      const idx = msg.promptIndex;
      if (idx !== undefined && currentSpec.visuals[idx]) {
        currentSpec.visuals[idx].result_url = msg.mediaUrl;
        globalThis.PipelineReviewer?.captured(currentSpec.visuals[idx], msg.reviewJobId);
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
        sendResponse?.({ success: true });
      }
    }
  });

})();
