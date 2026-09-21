const fs = require('fs');
const path = require('path');

const specPath = path.resolve(__dirname, '../src/ui/side-panel/spec-pipeline.js');
let specContent = fs.readFileSync(specPath, 'utf8');

const universalRulesStr = `  const UNIVERSAL_REFERENCE_RULES = 
\`## Selective Relevance Directive:
- Consider and apply references ONLY where they are directly relevant to the specific action and subject described in this prompt.
- Discard and ignore any reference elements, characters, or props that are not explicitly called for in this scene prompt.

## Strict Text & Prop Exclusion:
- Under NO circumstances copy any written text, typography, dates, names, title cards, captions, or decorative icons (such as hats, plaques, or display pedestals) from reference images into this frame.
- Replicate only the clean 2D line art style and specified scene composition.\`;`;

const newGetStatement = `  function getReferenceGuidanceStatement(charRefs = [], frameRefName = null, referenceStatement = null, continuity = null) {
    if (referenceStatement && String(referenceStatement).trim()) {
      let stmt = String(referenceStatement).trim();
      if (!stmt.startsWith('### Reference Guidance:')) {
        stmt = \`### Reference Guidance:\\n\${stmt}\`;
      }
      if (!stmt.includes('Selective Relevance Directive')) {
        stmt = \`\${stmt}\\n\\n\${UNIVERSAL_REFERENCE_RULES}\`;
      }
      return stmt;
    }
    const chars = (Array.isArray(charRefs) ? charRefs : [charRefs]).map(c => String(c).trim()).filter(Boolean);
    const hasChars = chars.length > 0;
    const cleanFrame = frameRefName ? getCleanFlowTileTitle(frameRefName) : null;
    const hasFrame = Boolean(cleanFrame) || continuity === 'continue';

    let baseDirectives = '';
    if (hasChars && hasFrame) {
      const framePart = cleanFrame ? \` \${cleanFrame}\` : '';
      baseDirectives = \`## Use provided reference strictly for visual style, stick figure anatomy, line weight, and character proportions.\\n## Use the provided frame reference\${framePart} to maintain continuous scene layout, camera perspective, lighting, color palette, and environmental coherence for generating the current frame.\`;
    } else if (hasChars && !hasFrame) {
      baseDirectives = \`## Use provided reference strictly for visual style, stick figure anatomy, line weight, and character proportions. Render all scene environment, actions, and props as specified in this prompt.\`;
    } else if (!hasChars && hasFrame) {
      const framePart = cleanFrame ? \` \${cleanFrame}\` : '';
      baseDirectives = \`## Use the provided frame reference\${framePart} to maintain continuous scene layout, camera perspective, lighting, color palette, and environmental coherence for generating the current frame.\`;
    }

    if (baseDirectives) {
      return \`### Reference Guidance:\\n\${baseDirectives}\\n\\n\${UNIVERSAL_REFERENCE_RULES}\`;
    }
    return '';
  }`;

const newFormatGuidance = `  function formatReferenceGuidance(frame, frameIndex) {
    if (!frame) return '';
    const charRefLabels = resolveCharacterReferenceLabels(frame.character_references, currentSpec?.characters || []);
    const cleanFlowTitle = resolveFlowTileTitleForFrame(frame, frameIndex);

    // If an explicit reference_statement is provided, translate placeholders and literal frame references
    if (frame.reference_statement && String(frame.reference_statement).trim()) {
      let stmt = String(frame.reference_statement).trim();
      if (cleanFlowTitle) {
        stmt = stmt.replace(/\\{(?:frame_name|frame_reference|flow_tile_title)\\}/gi, cleanFlowTitle);
        const refVisual = resolveReferencedVisual(frame, frameIndex);
        if (refVisual && !/^(frame_\\d+|test_frame_\\d+)$/i.test(cleanFlowTitle)) {
          const fn = refVisual.target_filename;
          const fnNoExt = fn ? fn.replace(/\\.[^/.]+$/, '') : '';
          const id = refVisual.id;
          if (fn) {
            stmt = stmt.replace(new RegExp(escapeRegex(fn), 'gi'), cleanFlowTitle);
          }
          if (fnNoExt && fnNoExt !== fn) {
            stmt = stmt.replace(new RegExp(\`\\\\b\${escapeRegex(fnNoExt)}\\\\b\`, 'gi'), cleanFlowTitle);
          }
          if (id && id !== fnNoExt && id !== fn) {
            stmt = stmt.replace(new RegExp(\`\\\\b\${escapeRegex(id)}\\\\b\`, 'gi'), cleanFlowTitle);
          }
        }
      }
      if (!stmt.startsWith('### Reference Guidance:')) {
        stmt = \`### Reference Guidance:\\n\${stmt}\`;
      }
      if (!stmt.includes('Selective Relevance Directive')) {
        stmt = \`\${stmt}\\n\\n\${UNIVERSAL_REFERENCE_RULES}\`;
      }
      return stmt;
    }

    // Legacy reference_instructions
    if (frame.reference_instructions) {
      let legacy = '';
      if (Array.isArray(frame.reference_instructions) && frame.reference_instructions.length > 0) {
        legacy = frame.reference_instructions.map(inst => \`- \${inst}\`).join('\\n');
      } else if (typeof frame.reference_instructions === 'object' && Object.keys(frame.reference_instructions).length > 0) {
        const lines = Object.entries(frame.reference_instructions).map(([k, v]) => {
          const usage = typeof v === 'object' ? (v.usage || v.reason || JSON.stringify(v)) : String(v);
          return \`- \${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}: \${usage}\`;
        });
        legacy = lines.join('\\n');
      }
      if (legacy) {
        return \`### Reference Guidance:\\n\${legacy}\\n\\n\${UNIVERSAL_REFERENCE_RULES}\`;
      }
    }

    // Auto-synthesized guidance statement
    return getReferenceGuidanceStatement(charRefLabels, cleanFlowTitle, null, frame.continuity);
  }`;

// Replace the getReferenceGuidanceStatement and formatReferenceGuidance functions
const startMarker = 'function getReferenceGuidanceStatement(';
const endMarker = 'function buildPromptWithReferenceGuidance(';

const startIdx = specContent.indexOf(startMarker);
const endIdx = specContent.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error("❌ Could not locate reference guidance functions in spec-pipeline.js", { startIdx, endIdx });
  process.exit(1);
}

specContent = specContent.substring(0, startIdx) + 
  universalRulesStr + "\n\n" + 
  newGetStatement + "\n\n" + 
  newFormatGuidance + "\n\n  " + 
  specContent.substring(endIdx);

// Replace all prompt split regexes
specContent = specContent.replace(
  /\/### Reference Guidance\|##\\s\*use\\s\*\(\?:the\\s\*\)\?provided\/gi/g,
  '/### Reference Guidance|##\\s*Selective Relevance Directive|##\\s*use\\s*(?:the\\s*)?provided/gi'
);

fs.writeFileSync(specPath, specContent, 'utf8');
console.log("✅ Successfully updated spec-pipeline.js with Universal Reference Rules");

// Now update index.ts-DFAayvhs.js prompt split regex as well
const indexPath = path.resolve(__dirname, '../assets/index.ts-DFAayvhs.js');
let indexContent = fs.readFileSync(indexPath, 'utf8');

indexContent = indexContent.replace(
  /\/### Reference Guidance\|##\\s\*use\\s\*\(\?:the\\s\*\)\?provided\/gi/g,
  '/### Reference Guidance|##\\s*Selective Relevance Directive|##\\s*use\\s*(?:the\\s*)?provided/gi'
);

indexContent = indexContent.replace(
  /\/\(\?:### Reference Guidance\|##\\s\*use\\s\*\(\?:the\\s\*\)\?provided\|##\[\^\\n\]\+\)\[\\s\\S\]\*\//gi,
  '/(?:### Reference Guidance|##\\s*Selective Relevance Directive|##\\s*use\\s*(?:the\\s*)?provided|##[^\\n]+)[\\s\\S]*/'
);

fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log("✅ Successfully updated index.ts-DFAayvhs.js with Universal Reference Rules split regex");
