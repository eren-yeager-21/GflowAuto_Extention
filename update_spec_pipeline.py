import re
import shutil

def patch_spec_pipeline(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Define sendToFlowTab helper
    send_to_flow_tab_code = """  function sendToFlowTab(message, callback) {
    chrome.tabs.query({ url: ['*://flow.google.com/project/*', '*://flow.google.com/*', '*://labs.google/*'] }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.warn('[SpecPipeline] No Google Flow tab detected');
        if (callback) callback({ success: false, error: 'Google Flow tab not open. Please open flow.google.com.' });
        return;
      }
      const sortedTabs = [...tabs].sort((a, b) => {
        const aProj = (a.url && a.url.includes('/project/')) ? 2 : (a.active ? 1 : 0);
        const bProj = (b.url && b.url.includes('/project/')) ? 2 : (b.active ? 1 : 0);
        return bProj - aProj;
      });
      const targetTab = sortedTabs[0];
      chrome.tabs.sendMessage(targetTab.id, message, (response) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          console.warn(`[SpecPipeline] Tab ${targetTab.id} message error:`, err.message);
          if (callback) callback({ success: false, error: err.message });
        } else {
          if (callback) callback(response);
        }
      });
    });
  }

"""

    # Check if sendToFlowTab already in file
    if 'function sendToFlowTab(' not in text:
        pos_create = text.find('function createSingleCharacter(charId) {')
        if pos_create != -1:
            text = text[:pos_create] + send_to_flow_tab_code + text[pos_create:]

    # 2. Update createSingleCharacter to use sendToFlowTab
    old_create_char_regex = r"function createSingleCharacter\(charId\)\s*\{[\s\S]*?chrome\.runtime\.sendMessage\(\s*\{\s*type:\s*'CREATE_FLOW_CHARACTER'[\s\S]*?savePipelineMapping\(\);\s*\}\s*else\s*\{[\s\S]*?\}\s*\}\);\s*\}"
    new_create_char = """function createSingleCharacter(charId) {
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
  }"""
    text = re.sub(old_create_char_regex, new_create_char, text)

    # 3. Update createAllMissingCharacters to use sendToFlowTab
    old_create_all_regex = r"async function createAllMissingCharacters\(\)\s*\{[\s\S]*?chrome\.runtime\.sendMessage\(\s*\{\s*type:\s*'CREATE_FLOW_CHARACTER'[\s\S]*?savePipelineMapping\(\);\s*\}"
    new_create_all = """async function createAllMissingCharacters() {
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
  }"""
    text = re.sub(old_create_all_regex, new_create_all, text)

    # 4. Update checkFlowCharacters to use sendToFlowTab
    old_check_regex = r"function checkFlowCharacters\(\)\s*\{\s*chrome\.runtime\.sendMessage\(\s*\{\s*type:\s*'SCAN_CHARACTERS'\s*\}\s*,\s*\(res\)\s*=>\s*\{"
    new_check = "function checkFlowCharacters() {\n    sendToFlowTab({ type: 'SCAN_CHARACTERS' }, (res) => {"
    text = re.sub(old_check_regex, new_check, text)

    # 5. Update prompt assembly to support dictionary reference_instructions
    old_prompt_assembly = """      if (frame.formatted_reference_guidance && frame.formatted_reference_guidance.trim()) {
        finalPrompt = `${finalPrompt}\\n\\n${frame.formatted_reference_guidance.trim()}`;
      } else if (Array.isArray(frame.reference_instructions) && frame.reference_instructions.length > 0) {
        finalPrompt = `${finalPrompt}\\n\\n### Reference Guidance:\\n` + frame.reference_instructions.map(inst => `- ${inst}`).join('\\n');
      } else {
        const charRefLabels = resolveCharacterReferenceLabels(frame.character_references, currentSpec?.characters || []);
        finalPrompt = buildPromptWithReferenceGuidance(finalPrompt, charRefLabels, frame.frame_reference);
      }"""

    new_prompt_assembly = """      if (frame.formatted_reference_guidance && frame.formatted_reference_guidance.trim()) {
        finalPrompt = `${finalPrompt}\\n\\n${frame.formatted_reference_guidance.trim()}`;
      } else if (frame.reference_instructions) {
        if (Array.isArray(frame.reference_instructions) && frame.reference_instructions.length > 0) {
          finalPrompt = `${finalPrompt}\\n\\n### Reference Guidance:\\n` + frame.reference_instructions.map(inst => `- ${inst}`).join('\\n');
        } else if (typeof frame.reference_instructions === 'object' && Object.keys(frame.reference_instructions).length > 0) {
          const lines = Object.entries(frame.reference_instructions).map(([k, v]) => {
            const usage = typeof v === 'object' ? (v.usage || v.reason || JSON.stringify(v)) : String(v);
            return `- ${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}: ${usage}`;
          });
          finalPrompt = `${finalPrompt}\\n\\n### Reference Guidance:\\n` + lines.join('\\n');
        }
      } else {
        const charRefLabels = resolveCharacterReferenceLabels(frame.character_references, currentSpec?.characters || []);
        finalPrompt = buildPromptWithReferenceGuidance(finalPrompt, charRefLabels, frame.frame_reference);
      }"""

    text = text.replace(old_prompt_assembly, new_prompt_assembly)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

    print(f"Patched {filepath} successfully (new length: {len(text)})")
    return True

if __name__ == '__main__':
    p1 = 'E:/Gflow_MCP/src/ui/side-panel/spec-pipeline.js'
    p2 = 'E:/VideoGen_Pipeline/veo-automation-unlocked/src/ui/side-panel/spec-pipeline.js'
    patch_spec_pipeline(p1)
    patch_spec_pipeline(p2)
