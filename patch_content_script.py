import os
import shutil

replacement = """,tagReference=async(refName,isCharHint,t,folderHint='Branded_references')=>{const cleanName=String(refName||'').replace(/^@/,'').replace(/\\.[^/.]+$/,'').trim();if(!cleanName)return!1;const noEllipsis=cleanName.replace(/(\\u2026|\\.{2,})$/,'').trim(),noBranded=noEllipsis.replace(/(_branded|-branded)$/i,'').trim(),withSpaces=noBranded.replace(/[_-]+/g,' ').trim(),withoutPrefix=withSpaces.replace(/^(ref\\s*char|ref\\s*env|ref\\s*prop|ref\\s*info|ref\\s*comp|ref|frame)\\s+/i,'').trim(),words=(withoutPrefix||withSpaces).split(/\\s+/).filter(Boolean),twoWords=words.length>=2?words.slice(0,2).join(' '):(withoutPrefix||withSpaces),firstWord=words[0]||twoWords,imageQueries=Array.from(new Set([twoWords,withoutPrefix,withSpaces,noBranded,cleanName])).filter(Boolean),folderCandidates=Array.from(new Set([folderHint,'Branded_references','Branded','reference','references'])).filter(Boolean);I(`🎯 Selecting reference @ mention: "${cleanName}" (hints: [${imageQueries.join(', ')}], isChar: ${isCharHint}, folder: ${folderHint})`);const a=t.selectors;await p('@','Digit2',50),await s(400);const tabs=isCharHint?[{name:'Characters',sel:'flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("accessibility_new")), flow-add-menu-popover-content mat-list-item:contains("Characters")'},{name:'Images',sel:'flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("image")), flow-add-menu-popover-content mat-list-item:contains("Images")'},{name:'All',sel:'flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("dashboard")), flow-add-menu-popover-content mat-list-item:contains("All")'}]:[{name:'Images',sel:'flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("image")), flow-add-menu-popover-content mat-list-item:contains("Images")'},{name:'All',sel:'flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("dashboard")), flow-add-menu-popover-content mat-list-item:contains("All")'},{name:'Characters',sel:'flow-add-menu-popover-content mat-list-item:has(mat-icon:contains("accessibility_new")), flow-add-menu-popover-content mat-list-item:contains("Characters")}'];const searchInPopover=async e=>{const t=o('flow-add-menu-popover-content input.search-input, flow-add-menu-popover-content input');if(t.length>0){await i(t.first(),'Click search input');const a=t.get(0);a.focus(),a.value='',a.dispatchEvent(new Event('input',{bubbles:!0})),await s(100),await u(e),await s(600)}};const findMatchingItem=(e,t=!1)=>{const n=o('flow-add-menu-popover-content flow-add-menu-asset-list button[role="option"], flow-add-menu-popover-content flow-add-menu-asset-list div.cdk-virtual-scroll-content-wrapper > div, flow-add-menu-popover-content flow-character-tile');if(0===n.length)return null;for(let a=0;a<n.length;a++){const r=n.eq(a),s=(r.text()||'').toLowerCase(),i=(r.attr('aria-label')||'').toLowerCase(),c=(r.attr('title')||'').toLowerCase(),l=`${s} ${i} ${c}`;if(t){const e=r.find('mat-icon:contains("folder")').length>0||l.includes('folder');for(const t of folderCandidates){const n=t.toLowerCase();if(l.includes(n)||(e&&(l.includes('brand')||l.includes('ref'))))return r}}else for(const t of e){const e=t.toLowerCase();if(e.length>=3&&l.includes(e))return r}}return null};let selected=!1;for(const e of tabs){if(selected)break;const t=o(e.sel);if(0===t.length)continue;await i(t.first(),`Click ${e.name} tab in @ menu`),await s(350);for(const t of imageQueries){if(selected)break;await searchInPopover(t);const a=findMatchingItem([t,withoutPrefix,withSpaces,cleanName]);if(a&&a.length>0){I(`✅ Selected reference item for "${cleanName}" in ${e.name} tab matching "${t}"`),await i(a,`Select reference item matching "${t}"`),await s(500),selected=!0;break}}if(!selected&&('Images'===e.name||'All'===e.name))for(const t of folderCandidates){if(selected)break;await searchInPopover(t);const a=findMatchingItem([t],!0);if(a&&a.length>0){I(`📁 Found folder "${t}" in ${e.name} tab, navigating inside...`),await i(a,`Open folder ${t}`),await s(500);for(const t of imageQueries){if(selected)break;await searchInPopover(t);const a=findMatchingItem([t,withoutPrefix,withSpaces,cleanName]);if(a&&a.length>0){I(`✅ Selected reference item for "${cleanName}" inside folder matching "${t}"`),await i(a,`Select reference item matching "${t}"`),await s(500),selected=!0;break}}}}}selected||(C(`⚠️ Could not find reference item matching "${cleanName}" in Characters, Images (including folder "${folderHint}"), or All tabs.`),await p('Escape','Escape',27)),a?.promptTextarea&&(await i(a.promptTextarea,'Click prompt textarea'),await s(100));return selected},R=async(e,t,f)=>tagReference(e,!1,t,f||'Branded_references'),k=async(e,t,f)=>tagReference(e,!0,t,f||'Branded_references')"""

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    pos_R = text.find(',R=async(')
    pos_M = text.find(',M=async(')

    if pos_R == -1 or pos_M == -1:
        print(f"Error in {filepath}: pos_R ({pos_R}) or pos_M ({pos_M}) not found!")
        return False

    new_text = text[:pos_R] + replacement + text[pos_M:]
    new_text = new_text.replace('await R(o.name,t)', 'await R(o.name,t,e.referenceFolder)')
    new_text = new_text.replace('await k(o,t)', 'await k(o,t,e.referenceFolder)')

    # Backup original
    backup_path = filepath + '.bak'
    if not os.path.exists(backup_path):
        shutil.copyfile(filepath, backup_path)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_text)

    print(f"Patched {filepath} successfully (original len: {len(text)}, new len: {len(new_text)})")
    return True

if __name__ == '__main__':
    p1 = 'e:/Gflow_MCP/assets/index.ts-DFAayvhs.js'
    p2 = 'e:/VideoGen_Pipeline/veo-automation-unlocked/assets/index.ts-DFAayvhs.js'
    patch_file(p1)
    patch_file(p2)
