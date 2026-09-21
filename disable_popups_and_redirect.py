import os
import re
import subprocess

def patch_background(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # Find chrome.runtime.onInstalled.addListener
    old_listener_regex = r"chrome\.runtime\.onInstalled\.addListener\(async\s*e\s*=>\s*\{[\s\S]*?new-version-installed=true[\s\S]*?flow\.google\.com[\s\S]*?\}\)\(\)\)\s*:\s*e\.reason\s*\}\)"
    
    # We want to replace it with a simple listener that only sets panel behavior
    new_listener = "chrome.runtime.onInstalled.addListener(async e => { await i(); })"
    
    new_text, count = re.subn(old_listener_regex, new_listener, text)
    if count == 0:
        # Fallback string replace
        marker = 'chrome.runtime.onInstalled.addListener(async e=>{await i(),'
        pos = text.find(marker)
        if pos != -1:
            pos_end = text.find('):e.reason})', pos)
            if pos_end != -1:
                new_text = text[:pos] + 'chrome.runtime.onInstalled.addListener(async e=>{await i();})' + text[pos_end + len('):e.reason})'):]
                count = 1
    
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_text)
        print(f"[OK] Patched onInstalled in {filepath}")
        return True
    else:
        print(f"[WARN] onInstalled listener pattern not found in {filepath}")
        return False

def patch_modal(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. In TipBeforeUseModal setup, make it return () => null
    old_pu = 'pu=pa({__name:"TipBeforeUseModal",props:{visible:{type:Boolean}},emits:["dismiss","dismiss-forever"],setup(t,{emit:e}){const n=e,{t:o}=Fc(),i=$s(()=>{const t=o("tipBeforeUseModal.step1"),e="Agent Automation",n=t.indexOf(e);return-1===n?{hasKeyword:!1,before:t,after:""}:{hasKeyword:!0,before:t.slice(0,n),after:t.slice(n+16)}});return(e,o)=>{const a=Ra("PButton"),r=Ra("PDialog");return as(),ds(r,{visible:t.visible,closable:!0,modal:!0,draggable:!1,style:{width:"28rem"},"pt:root:class":"border border-green-400/40 bg-slate-100 dark:bg-slate-800","onUpdate:visible":o[2]||(o[2]=t=>{t||n("dismiss")})},{header:Vi(()=>[gs("span",Jd,An(e.$t("tipBeforeUseModal.title")),1)]),default:Vi(()=>[gs("div",Zd,[gs("div",Qd,[o[3]||(o[3]=gs("div",{class:"flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-800"},[gs("i",{class:"pi pi-exclamation-circle text-green-600 dark:text-green-300 text-xl"})],-1)),gs("p",tu,An(e.$t("tipBeforeUseModal.description")),1)]),gs("div",eu,[gs("p",nu,An(e.$t("tipBeforeUseModal.stepsTitle")),1),gs("ol",ou,[gs("li",iu,[o[5]||(o[5]=gs("span",{class:"flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white font-bold text-xs mt-0.5"},"1",-1)),gs("div",au,[i.value.hasKeyword?(as(),cs(Qr,{key:0},[gs("span",null,An(i.value.before),1),o[4]||(o[4]=gs("span",{class:"inline-flex items-center gap-1 font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-1.5 py-0.5 rounded border border-green-400/40"},[gs("i",{class:"pi pi-bolt text-[11px]"}),vs(" Agent Automation ")],-1)),gs("span",null,An(i.value.after),1)],64)):(as(),cs("span",ru,An(e.$t("tipBeforeUseModal.step1")),1))])]),gs("li",su,[o[6]||(o[6]=gs("span",{class:"flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 font-bold text-xs"},"2",-1)),gs("span",null,An(e.$t("tipBeforeUseModal.step2")),1)]),gs("li",lu,[o[7]||(o[7]=gs("span",{class:"flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 font-bold text-xs"},"3",-1)),gs("span",null,An(e.$t("tipBeforeUseModal.step3")),1)]),gs("li",cu,[o[8]||(o[8]=gs("span",{class:"flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 font-bold text-xs"},"4",-1)),gs("span",null,An(e.$t("tipBeforeUseModal.step4")),1)])]),gs("p",du,An(e.$t("tipBeforeUseModal.note")),1)]),gs("div",uu,[fs(a,{label:e.$t("tipBeforeUseModal.dismissButton"),icon:"pi pi-check",severity:"success",size:"small",class:"w-full text-xs",onClick:o[0]||(o[0]=t=>n("dismiss"))},null,8,["label"]),fs(a,{label:e.$t("tipBeforeUseModal.dismissForeverButton"),icon:"pi pi-check",severity:"secondary",size:"small",outlined:"",class:"w-full text-xs",onClick:o[1]||(o[1]=t=>n("dismiss-forever"))},null,8,["label"])])])]),_:1},8,["visible"])}}})'
    new_pu = 'pu=pa({__name:"TipBeforeUseModal",props:{visible:{type:Boolean}},emits:["dismiss","dismiss-forever"],setup(t,{emit:e}){return()=>null}})'

    if old_pu in text:
        text = text.replace(old_pu, new_pu)
        print(f"[OK] Replaced TipBeforeUseModal in {filepath}")
    else:
        # regex replace for pu definition
        pu_regex = r'pu=pa\(\{\s*__name:\s*"TipBeforeUseModal"[\s\S]*?\}\}\}\)'
        text, cnt = re.subn(pu_regex, new_pu, text)
        print(f"[REGEX] Replaced TipBeforeUseModal count: {cnt} in {filepath}")

    # 2. Also set visible: !1 in template call
    text = text.replace('fs(pu,{visible:v.value', 'fs(pu,{visible:!1')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    return True

if __name__ == '__main__':
    bases = ['E:/Gflow_MCP', 'E:/VideoGen_Pipeline/veo-automation-unlocked']
    for b in bases:
        b2 = os.path.join(b, 'assets/index.ts-B2QzyOff.js')
        patch_background(b2)
        
        html_js = os.path.join(b, 'assets/index.html-YcmfxOFZ.js')
        patch_modal(html_js)

        for p in [b2, html_js]:
            res = subprocess.run(['node', '-c', p], capture_output=True, text=True)
            if res.returncode != 0:
                print(f"[ERR] Syntax error in {p}: {res.stderr}")
            else:
                print(f"[SYNTAX OK] {p}")
