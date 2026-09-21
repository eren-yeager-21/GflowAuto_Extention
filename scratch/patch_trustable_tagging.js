const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../assets/index.ts-DFAayvhs.js');
let content = fs.readFileSync(filePath, 'utf8');

const rStart = 'getDiscriminativeSearch=';
const mStart = 'M=async(e,t,n)=>{';

const rIdx = content.indexOf(rStart);
const mIdx = content.indexOf(mStart);

if (rIdx === -1 || mIdx === -1) {
  console.error("❌ Could not locate getDiscriminativeSearch and M definitions:", { rIdx, mIdx });
  process.exit(1);
}

const trustableTaggingCode = `tagReference=async(e,t,n)=>{const r=String(e||"").replace(/^@/,"").replace(/\\.[^/.]+$/,"").trim();if(!r)return;const a=[r],s=r.toLowerCase();(s.includes("female_early")||s.includes("early_women")||s.includes("women_ealry")||s.includes("women_early"))&&a.push("women_ealry_human","women_early_human","female_early_human");I(\`🎯 Selecting reference via @ mention: "\${r}" (isChar: \${t})\`);ensureCaretAtEnd();await(async e=>new Promise(t=>setTimeout(t,e)))(150);await p("@","Digit2",50);await(async e=>new Promise(t=>setTimeout(t,e)))(400);let o=!1;const i=window.$?window.$('flow-add-menu-popover-content, [role="menu"], .cdk-overlay-pane'):null;const l=document.querySelector('flow-add-menu-popover-content, [role="menu"], .cdk-overlay-pane');if(l&&l.offsetParent!==null){const e=l.querySelector('mat-list-item:has(mat-icon:contains("dashboard")), mat-list-item:contains("All")');e&&e.offsetParent&&((e.querySelector('a, button, [role="button"]')||e).click(),await(async e=>new Promise(t=>setTimeout(t,e)))(250));const n=l.querySelector("input.search-input, input");const d=async e=>{if(n){n.focus();n.value="";n.dispatchEvent(new Event("input",{bubbles:!0}));await(async e=>new Promise(t=>setTimeout(t,e)))(60);await u(e);await(async e=>new Promise(t=>setTimeout(t,e)))(450)}};const m=e=>{const t=Array.from(document.querySelectorAll('flow-add-menu-popover-content flow-add-menu-asset-list button[role="option"], flow-add-menu-popover-content flow-add-menu-asset-list div.cdk-virtual-scroll-content-wrapper > div, flow-add-menu-popover-content mat-list-item, flow-add-menu-popover-content button:has(img), flow-add-menu-popover-content div:has(img)'));const n=e.toLowerCase().replace(/…|\\.{2,}/g,"").trim();let r=null,a=-1;for(const s of t){const e=(s.innerText||s.getAttribute("aria-label")||"").toLowerCase().replace(/…|\\.{2,}/g,"").trim();if(!e)continue;if(e===n)return s;let t=0;if(n.startsWith(e)||e.startsWith(n)){t=Math.min(n.length,e.length)*10}else if(n.includes(e)||e.includes(n)){t=Math.min(n.length,e.length)*5}t>a&&(a=t,r=s)}return a>=30?r:null};const c=r.length>32?r.substring(0,32).trim():r;await d(c);let f=m(r);if(!f&&a.length>1)for(const e of a)if(e!==r){await d(e);f=m(e);if(f)break}if(!f){const e=l.querySelector('mat-list-item:has(mat-icon:contains("accessibility_new")), mat-list-item:contains("Characters")');const n=l.querySelector('mat-list-item:has(mat-icon:contains("image")), mat-list-item:contains("Images")');if(t&&e&&e.offsetParent){(e.querySelector('a, button')||e).click();await(async e=>new Promise(t=>setTimeout(t,e)))(250);f=m(r)}else if(n&&n.offsetParent){(n.querySelector('a, button')||n).click();await(async e=>new Promise(t=>setTimeout(t,e)))(250);f=m(r)}}if(!f){const e=Array.from(document.querySelectorAll('flow-add-menu-popover-content flow-add-menu-asset-list button[role="option"], flow-add-menu-popover-content flow-add-menu-asset-list div.cdk-virtual-scroll-content-wrapper > div:has(img)'));if(1===e.length)f=e[0]}if(f){(f.querySelector('a, button, [role="button"], img')||f).click();await(async e=>new Promise(t=>setTimeout(t,e)))(400);o=!0;I(\`✅ Selected reference chip for "\${r}"\`)}else{await p("Escape","Escape",27);await(async e=>new Promise(t=>setTimeout(t,e)))(200)}}if(!o){I(\`✍️ Direct text insertion fallback for reference: @\${r}\`);ensureCaretAtEnd();await u(\`@\${r} \`);await(async e=>new Promise(t=>setTimeout(t,e)))(200)}ensureCaretAtEnd();await u(" ");await(async e=>new Promise(t=>setTimeout(t,e)))(150);},R=async(e,t)=>tagReference(e,!1,t),k=async(e,t)=>tagReference(e,!0,t),`;

content = content.substring(0, rIdx) + trustableTaggingCode + content.substring(mIdx);
fs.writeFileSync(filePath, content, 'utf8');
console.log("✅ Successfully patched trustable exact-and-prefix tagging engine in index.ts-DFAayvhs.js");
