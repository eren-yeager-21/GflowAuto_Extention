const fs = require('fs');

function patchDFAayvhs(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Agent Mode Disable in x
  const xStart = code.indexOf('x=async(e,t,n)=>{');
  const uiModeIdx = code.indexOf('c([["uiMode","open"]],!0)', xStart);
  
  const projectSuccessIdx = code.indexOf('I("✅ Project created successfully")', xStart);
  const afterProjIdx = projectSuccessIdx !== -1 ? projectSuccessIdx + 'I("✅ Project created successfully")'.length : code.indexOf('await $(n,t);', xStart) + 'await $(n,t);'.length;

  const newAgentSection = `}if(!e.mode.includes("agentAutomation")){try{const agentChip=o("flow-agent-mode-toggle-chip");if(agentChip.length>0){const hasActive=agentChip.is(".checked")||agentChip.find(".checked, .mat-mdc-chip-selected, [aria-checked='true'], [aria-pressed='true']").length>0;const btn=agentChip.find("button, [role='button']");const isBlue=btn.length>0&&window.getComputedStyle(btn[0]).backgroundColor.includes("rgb")&&!window.getComputedStyle(btn[0]).backgroundColor.includes("255, 255, 255");if(hasActive||isBlue){I("🤖 Disabling active Agent Mode...");await i(btn.length>0?btn:agentChip,"Disable Agent Mode",t);await s(1000,t);}}const closeBtn=o('flow-agent-panel button:has(mat-icon:contains("close"))');closeBtn.length>0&&await i(closeBtn,"Close agent panel",t);}catch(_){}}else{const enableSel=n.selectors.enableAgentModeButton;o(enableSel).length>0&&await i(enableSel,"Enable Agent Mode",t);await s(1000,t);}`;

  code = code.slice(0, afterProjIdx) + newAgentSection + code.slice(uiModeIdx);

  // 2. Click prompt textarea at end of R and k
  code = code.replace(
    'ensureCaretAtEnd()},k=async',
    'ensureCaretAtEnd();try{await i(a.promptTextarea,"Click prompt textarea");}catch(_){}},k=async'
  );
  code = code.replace(
    'ensureCaretAtEnd()},M=async',
    'ensureCaretAtEnd();try{await i(n.promptTextarea,"Click prompt textarea");}catch(_){}},M=async'
  );

  // 3. M: fillFlowPrompt
  const mIdx = code.indexOf('M=async(e,t,n)=>{');
  const bIdx = code.indexOf(',B=e=>{', mIdx);
  if (mIdx === -1 || bIdx === -1) {
    console.error('M block not found in', filePath);
    process.exit(1);
  }

  const newM = `M=async(e,t,n)=>{try{const r=t.selectors;I("📝 Starting to fill prompt...");const c=await a(r.promptTextarea,n);if(!c||0===c.length)return y("Could not find prompt editor (div[role='textbox'])"),!1;await i(r.promptTextarea,"Prompt textarea",n);await s(600,n,!0);try{await p("a","KeyA",65,"a",2);await s(100,n);await p("Backspace","Backspace",8);await s(300,n);}catch(_){}const g="imageToVideo"===e.mode||e.outputPreviousPrompt?.extractedFrame,f="agentAutomationToImage"===e.mode||"agentAutomation"===e.mode,h="agentAutomationToVideo"===e.mode,w=h?"videos":"images",rawX=f||h?\`Create for me \${e.outputCount} \${w}, aspect ratio \${e.aspectRatio}, model: \${e.model} with prompt: \${e.prompt}\`:e.prompt;const basePrompt=e.basePrompt||rawX.split(/### Reference Guidance|##\\s*use\\s*(?:the\\s*)?provided/i)[0].trim();let refGuidance=e.referenceGuidance||"";if(!refGuidance&&rawX!==basePrompt){const match=rawX.match(/(?:### Reference Guidance|##\\s*use\\s*(?:the\\s*)?provided|##[^\\n]+)[\\s\\S]*/i);if(match)refGuidance=match[0].trim();}const taggedImgs=new Set;if(!g&&e.images&&e.images.length>0){I(\`🎯 Step 1: Mentioning \${e.images.length} reference image(s)...\`);for(const im of e.images){const nm=(im.name||"").replace(/^@/,"").trim();if(nm&&!taggedImgs.has(nm.toLowerCase())){taggedImgs.add(nm.toLowerCase());await R(nm,t);await u(" ");await s(200,n);}}}const taggedChars=new Set;if(e.characters&&e.characters.length>0){I(\`🎯 Step 1: Mentioning \${e.characters.length} character(s)...\`);for(const ch of e.characters){const nm=(ch||"").replace(/^@/,"").trim();if(nm&&!taggedChars.has(nm.toLowerCase())){taggedChars.add(nm.toLowerCase());await k(nm,t);await u(" ");await s(200,n);}}}ensureCaretAtEnd();I(\`✍️ Step 2: Pasting image prompt: \${basePrompt.substring(0,60)}...\`);await u(basePrompt);await s(300,n);if(refGuidance){ensureCaretAtEnd();I(\`📋 Step 3: Adding reference instructions: \${refGuidance.substring(0,60)}...\`);await u("\\n\\n"+refGuidance);await s(300,n);}const pmEl=o(r.promptTextarea).get(0);if(pmEl){pmEl.dispatchEvent(new Event("input",{bubbles:!0}));pmEl.dispatchEvent(new Event("change",{bubbles:!0}));}await s(1000,n,!0);const b=await a(r.submitButton,n,4000);if(b&&b.length>0){I("🚀 Clicking Submit button in Flow...");await i(r.submitButton,"Submit button",n);}else{I("🚀 Dispatching Enter key to submit...");await p("Enter","Enter",13);}if(e.outputPreviousPrompt?.tileIds&&e.outputPreviousPrompt.tileIds.length>0){const e=o(r.downloadDoneButton);e&&e.length>0&&(I("❌ Not in Last Image To Image mode, skipping configuration..."),await i(r.downloadDoneButton,"Exit button",n));}await s(2000,n);await m(r.stopButton,n,9e5);return!0;}catch(r){if(String(r).includes("Cancelled"))throw r;return y("Error in fillFlowPrompt:",r),!1;}}`;

  code = code.slice(0, mIdx) + newM + code.slice(bIdx);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Successfully updated', filePath);
}

patchDFAayvhs('e:/Gflow_MCP/assets/index.ts-DFAayvhs.js');
patchDFAayvhs('e:/VideoGen_Pipeline/veo-automation-unlocked/assets/index.ts-DFAayvhs.js');
