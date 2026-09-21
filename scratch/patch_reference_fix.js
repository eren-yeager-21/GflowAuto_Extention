const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../assets/index.ts-DFAayvhs.js');
let content = fs.readFileSync(filePath, 'utf8');

const rStart = 'R=async(e,t)=>{';
const mStart = 'M=async(e,t,n)=>{';

const rIdx = content.indexOf(rStart);
const mIdx = content.indexOf(mStart);

if (rIdx === -1 || mIdx === -1) {
  console.error("❌ Could not locate R and M definitions:", { rIdx, mIdx });
  process.exit(1);
}

const tagReferenceCode = `tagReference=async(refName,isChar,t)=>{const cleanName=String(refName||"").replace(/^@/,"").replace(/\\.[^/.]+$/,"").trim();if(!cleanName)return;const noEllipsis=cleanName.replace(/(\\u2026|\\.{2,})$/,"").trim();const cleanWithSpaces=noEllipsis.replace(/[\\s_-]+/g," ").trim();const words=cleanWithSpaces.split(/\\s+/).filter(Boolean);const searchTerm=words.length>=2?words.slice(0,2).join(" "):cleanWithSpaces;const firstWord=words[0]||cleanWithSpaces;I(\`🎯 Selecting reference via @ mention: "\${cleanName}" (search: "\${searchTerm}", isChar: \${isChar})\`);ensureCaretAtEnd();try{await i(t.selectors.promptTextarea,"Click prompt textarea");}catch(_){}await p("@","Digit2",50);await s(350);let selected=!1;const popover=o('flow-add-menu-popover-content, [role="menu"], .cdk-overlay-pane');if(popover.length>0){if(isChar){const charTab=o('flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("accessibility_new")), flow-add-menu-popover-content mat-list-item:contains("Characters")');charTab.length>0&&(await i(charTab.first(),"Click Characters tab in popover"),await s(300))}else{const imgTab=o('flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("image")), flow-add-menu-popover-content mat-list-item:contains("Images")');imgTab.length>0&&(await i(imgTab.first(),"Click Images tab in popover"),await s(300))}const searchInput=o('flow-add-menu-popover-content input.search-input, flow-add-menu-popover-content input');if(searchInput.length>0){await i(searchInput.first(),"Click search input in popover");const el=searchInput.get(0);el.focus();el.value="";el.dispatchEvent(new Event("input",{bubbles:!0}));await s(100);await u(searchTerm);await s(600)}const findItem=()=>{const items=o('flow-add-menu-popover-content flow-add-menu-asset-list button[role="option"], flow-add-menu-popover-content flow-add-menu-asset-list div.cdk-virtual-scroll-content-wrapper > div, flow-add-menu-popover-content mat-list-item, flow-add-menu-popover-content button:has(img), flow-add-menu-popover-content div:has(img)');const q1=cleanName.toLowerCase();const q2=searchTerm.toLowerCase();const q3=firstWord.toLowerCase();for(let n=0;n<items.length;n++){const it=items.eq(n);const txt=(it.text()||it.attr("aria-label")||"").toLowerCase();if(txt.includes(q1)||txt.includes(q2)||txt.includes(q3))return it}return items.length>0?items.first():null};let targetItem=findItem();if(!targetItem){const allTab=o('flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("dashboard")), flow-add-menu-popover-content mat-list-item:contains("All")');if(allTab.length>0){await i(allTab.first(),"Click All tab in popover");await s(400);targetItem=findItem()}}if(targetItem&&targetItem.length>0){await i(targetItem,\`Select @ mention for "\${cleanName}"\`);await s(400);selected=!0;I(\`✅ Selected reference chip for "\${cleanName}"\`)}else{await p("Escape","Escape",27);await s(200)}}if(!selected){I(\`✍️ Direct text insertion fallback for reference: @\${cleanName}\`);ensureCaretAtEnd();await u(\`@\${cleanName} \`);await s(200)}ensureCaretAtEnd();try{await i(t.selectors.promptTextarea,"Click prompt textarea");}catch(_){}},R=async(e,t)=>tagReference(e,!1,t),k=async(e,t)=>tagReference(e,!0,t),`;

content = content.substring(0, rIdx) + tagReferenceCode + content.substring(mIdx);
fs.writeFileSync(filePath, content, 'utf8');
console.log("✅ Successfully replaced R and k with unified tagReference in index.ts-DFAayvhs.js");
