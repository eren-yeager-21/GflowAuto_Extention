import shutil
import os
import subprocess

def revert():
    # 1. Restore index.ts-DFAayvhs.js from .bak
    bak_file = 'E:/Gflow_MCP/assets/index.ts-DFAayvhs.js.bak'
    t1 = 'E:/Gflow_MCP/assets/index.ts-DFAayvhs.js'
    t2 = 'E:/VideoGen_Pipeline/veo-automation-unlocked/assets/index.ts-DFAayvhs.js'

    shutil.copyfile(bak_file, t1)
    shutil.copyfile(bak_file, t2)
    print(f"Restored index.ts-DFAayvhs.js in {t1} and {t2}")

    # 2. Restore index.ts-B2QzyOff.js from backup
    b2_backup = 'E:/VideoGen_Pipeline/veo-automation-unlocked-backup/assets/index.ts-B2QzyOff.js'
    with open(b2_backup, 'r', encoding='utf-8') as f:
        b2_text = f.read()

    # Add reload action to initVeoMcpBridge so MCP tool veo_reload_extension works
    marker = "if (req.action === 'ping') {"
    if marker in b2_text and "req.action === 'reload'" not in b2_text:
        reload_handler = """if (req.action === 'reload') {
            log('Reload request received. Reloading extension...');
            try { ws.send(JSON.stringify({ id: req.id, success: true })); } catch(e) {}
            setTimeout(() => { chrome.runtime.reload(); }, 200);
            return;
          }
          """
        b2_text = b2_text.replace(marker, reload_handler + marker)

    b2_t1 = 'E:/Gflow_MCP/assets/index.ts-B2QzyOff.js'
    b2_t2 = 'E:/VideoGen_Pipeline/veo-automation-unlocked/assets/index.ts-B2QzyOff.js'

    with open(b2_t1, 'w', encoding='utf-8') as f:
        f.write(b2_text)
    with open(b2_t2, 'w', encoding='utf-8') as f:
        f.write(b2_text)
    print(f"Restored index.ts-B2QzyOff.js in {b2_t1} and {b2_t2}")

    # 3. Check JavaScript syntax for all files
    for filepath in [t1, t2, b2_t1, b2_t2]:
        res = subprocess.run(['node', '-c', filepath], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"SYNTAX ERROR in {filepath}: {res.stderr}")
            return False
        else:
            print(f"Syntax OK: {filepath}")

    print("Revert completed successfully!")
    return True

if __name__ == '__main__':
    revert()
