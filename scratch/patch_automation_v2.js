const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../assets/index.ts-DFAayvhs.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Locate start of agent section
const startMarker = 'if(!e.mode.includes("agentAutomation")){try{const agentChip=o("flow-agent-mode-toggle-chip");';
const endMarker = 'await s(1000,t);}c([["uiMode","open"]],!0)';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error("❌ Could not locate markers:", { startIdx, endIdx });
  process.exit(1);
}

const oldBlock = content.substring(startIdx, endIdx + 'await s(1000,t);}'.length);
console.log("Found old block length:", oldBlock.length);

const safeAgentReplacement = `try{const closeBtn=o('flow-agent-panel button:has(mat-icon:contains("close"))');closeBtn.length>0&&closeBtn.is(':visible')&&(await i(closeBtn,"Close agent panel",t),await s(400,t));const agentChip=o("flow-agent-mode-toggle-chip.checked, flow-agent-mode-toggle-chip.mat-mdc-chip-selected, flow-agent-mode-toggle-chip[aria-pressed='true'], flow-agent-mode-toggle-chip[aria-checked='true'], flow-agent-mode-toggle-chip:has(.mat-mdc-chip-selected, [aria-pressed='true'], [aria-checked='true'])");if(agentChip.length>0&&agentChip.is(':visible')){const btn=agentChip.find("button, [role='button']");I("🤖 Disabling active Agent Mode...");await i(btn.length>0?btn:agentChip,"Disable Agent Mode",t);await s(500,t);}}catch(_){}`;

content = content.replace(oldBlock, safeAgentReplacement);
console.log("✅ Successfully replaced Agent Mode toggle logic.");

// 2. Add ENSURE_FLOW_COLLECTION case to chrome.runtime.onMessage.addListener
const scanCharsAnchor = `case"SCAN_CHARACTERS":`;
if (!content.includes(scanCharsAnchor)) {
  console.error("❌ Could not find SCAN_CHARACTERS anchor!");
  process.exit(1);
}

const ensureCollectionCode = `case"ENSURE_FLOW_COLLECTION":return(async()=>{try{const colName=(e.collectionName||"").trim();if(!colName)return{success:!0,message:"No collection name specified"};I(\`📁 Ensuring Google Flow collection: "\${colName}"...\`);const backBtn=Array.from(document.querySelectorAll('button')).find(b=>{const icon=b.querySelector('mat-icon');return icon&&/arrow_back/i.test(icon.textContent||'')&&b.offsetParent!==null});const pageText=document.body?document.body.innerText:"";const headerEl=document.querySelector('flow-project-header, .project-header, flow-collection-header, mat-toolbar');const headerText=headerEl?headerEl.innerText:"";if(backBtn&&(headerText.toLowerCase().includes(colName.toLowerCase())||pageText.includes(colName))){I(\`✅ Already inside collection: "\${colName}"\`);return{success:!0,message:\`Already inside collection: "\${colName}"\`}}if(backBtn&&!headerText.toLowerCase().includes(colName.toLowerCase())){I("🔙 Inside different collection, returning to project root...");backBtn.click();await s(1200)}const findCollectionTile=()=>{const tiles=Array.from(document.querySelectorAll('flow-grid-tile-container, flow-collection-tile, [role="gridcell"], div[class*="tile"], div[class*="card"]'));return tiles.find(t=>{const text=(t.innerText||t.getAttribute('aria-label')||'').toLowerCase();const iconText=t.querySelector('mat-icon')?.textContent||'';return text.includes(colName.toLowerCase())&&(/folder/i.test(iconText)||text.includes(colName.toLowerCase()))})};let existingTile=findCollectionTile();if(existingTile){I(\`📂 Found existing collection tile for "\${colName}", opening it...\`);const target=existingTile.querySelector('a, button, [role="button"], img, .tile-content')||existingTile;target.click();await s(1500);return{success:!0,message:\`Opened existing collection: "\${colName}"\`}}I(\`➕ Creating new collection: "\${colName}"...\`);const addBtn=Array.from(document.querySelectorAll('button')).find(b=>{const icon=b.querySelector('mat-icon');const iconText=icon?icon.textContent.trim():'';return(iconText==='add'||iconText==='add_2'||/create|add/i.test(b.getAttribute('aria-label')||''))&&b.offsetParent!==null});if(!addBtn){C("⚠️ Could not locate '+' create button in Flow toolbar, continuing.");return{success:!1,error:"Could not locate '+' button"}}addBtn.click();await s(600);const menuItems=Array.from(document.querySelectorAll('.cdk-overlay-pane button, .cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane mat-list-item, div[role="menu"] button, div[role="menu"] [role="menuitem"]'));const newColItem=menuItems.find(el=>/new collection/i.test(el.textContent||'')&&el.offsetParent!==null)||Array.from(document.querySelectorAll('button, [role="menuitem"], mat-list-item')).find(el=>/new collection/i.test(el.textContent||'')&&el.offsetParent!==null);if(!newColItem){C("⚠️ Could not find 'New collection' item in '+' menu.");await p("Escape","Escape",27);return{success:!1,error:"Could not find 'New collection' in menu"}}newColItem.click();await s(800);let colInput=null;for(let w=0;w<10;w++){colInput=document.querySelector('mat-dialog-container input, div[role="dialog"] input, .cdk-overlay-pane input, input[placeholder*="collection" i], input:focus');if(colInput&&colInput.offsetParent!==null)break;await s(200)}if(colInput){colInput.focus();colInput.value=colName;colInput.dispatchEvent(new Event('input',{bubbles:!0}));colInput.dispatchEvent(new Event('change',{bubbles:!0}));await s(300);await p("Enter","Enter",13);await s(400);const saveBtn=Array.from(document.querySelectorAll('mat-dialog-container button, div[role="dialog"] button, .cdk-overlay-pane button')).find(b=>/^(create|save|done|ok)$/i.test(b.textContent.trim())&&b.offsetParent!==null);saveBtn&&saveBtn.click();await s(1500);I(\`✅ Created new collection: "\${colName}"\`)}else{C("⚠️ Collection input dialog did not appear, continuing...");}const afterBackBtn=Array.from(document.querySelectorAll('button')).find(b=>{const icon=b.querySelector('mat-icon');return icon&&/arrow_back/i.test(icon.textContent||'')&&b.offsetParent!==null});if(!afterBackBtn){existingTile=findCollectionTile();if(existingTile){const target=existingTile.querySelector('a, button, [role="button"], img, .tile-content')||existingTile;target.click();await s(1500)}}return{success:!0,message:\`Created and opened collection: "\${colName}"\`}}catch(err){y("❌ Error in ENSURE_FLOW_COLLECTION:",err);return{success:!1,error:String(err)}}})().then(e=>n(e)).catch(e=>n({success:!1,error:String(e)})),!0;`;

content = content.replace(scanCharsAnchor, `${ensureCollectionCode}${scanCharsAnchor}`);
console.log("✅ Successfully added ENSURE_FLOW_COLLECTION handler.");

// Backup current file
fs.writeFileSync(filePath + '.bak_pre_collection', fs.readFileSync(filePath, 'utf8'));

// Write modified content
fs.writeFileSync(filePath, content, 'utf8');
console.log("✅ Written updated bundle to assets/index.ts-DFAayvhs.js");
