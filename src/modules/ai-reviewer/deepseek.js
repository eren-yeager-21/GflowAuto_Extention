// Isolated-world content adapter. Repeated injections do not register duplicate listeners.
(() => {
  if (globalThis.__flowAiReviewer) return;
  globalThis.__flowAiReviewer = true;
  let active;
  const visible = element => element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const enabled = element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && !element.classList.contains('ds-button--disabled');
  const send = message => chrome.runtime.sendMessage(message).then(response => {
    if (!response?.success) throw new Error(response?.error || 'Reviewer background is unavailable.');
    return response;
  });
  function wait(read, timeout, label) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (value, error) => { if (finished) return; finished = true; observer.disconnect(); clearInterval(timer); clearTimeout(deadline); error ? reject(error) : resolve(value); };
      const inspect = () => { try { const value = read(); if (value) finish(value); } catch (error) { finish(null, error); } };
      const observer = new MutationObserver(inspect); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      const timer = setInterval(inspect, 1000);
      const deadline = setTimeout(() => finish(null, new Error(`Timed out waiting for ${label}.`)), timeout);
      inspect();
    });
  }
  function composer(settings) { return Array.from(document.querySelectorAll(settings.selectors.composer)).find(visible); }
  function sendButton(settings, root = document) { return Array.from(root.querySelectorAll(settings.selectors.send)).find(visible); }
  function isSendArrow(button) {
    return !!button && (Array.from(button.querySelectorAll('svg path')).some(path => (path.getAttribute('d') || '').startsWith('M8.3125 0.980206')) || /send/i.test(button.getAttribute('aria-label') || ''));
  }
  function composerRoot(textarea, settings) {
    // The upload input lives in the bottom controls row; its grandparent does
    // not contain the thumbnail strip above the textarea. Find the shared
    // composer container, then include its enclosing attachment area.
    for (let node = textarea.parentElement; node && node !== document.body; node = node.parentElement) {
      if (!node.querySelector(settings.selectors.fileInput) || !sendButton(settings, node)) continue;
      const outer = node.parentElement;
      return outer && outer !== document.body && !outer.querySelector(settings.selectors.response) ? outer : node;
    }
    throw new Error('Could not locate the DeepSeek image composer.');
  }
  function thumbnails(root) {
    return Array.from(root.querySelectorAll('img')).filter(image => visible(image) && !!(image.currentSrc || image.src));
  }
  function completedControls(element, settings) {
    // Response actions are supplemental evidence, not a requirement for valid
    // JSON. Thinking and answer sections can share a message container.
    let wrapper = element.closest('[data-message-role="assistant"], .ds-message') || element.parentElement;
    for (let depth = 0; wrapper && wrapper !== document.body && depth < 3; depth++, wrapper = wrapper.parentElement) {
      const responses = Array.from(wrapper.querySelectorAll(settings.selectors.response));
      if (responses.some(response => response !== element && response.textContent?.includes('"review_id"'))) return [];
      const actions = Array.from(wrapper.querySelectorAll(settings.selectors.completedActions)).filter(control => visible(control) && !element.contains(control));
      if (actions.length) return actions;
    }
    return [];
  }
  function completeJsonBlock(text) {
    const value = text.trim();
    // Response actions and the Send arrow can appear before the code block
    // finishes rendering. Require the whole JSON container as well. Quoted
    // braces and escaped quotes must not count as the end of the response.
    if (!['{', '['].includes(value[0])) return true; // Completed non-JSON is a validation error.
    let quoted = false, escaped = false, depth = 0, closed = false;
    for (const character of value) {
      if (escaped) { escaped = false; continue; }
      if (quoted && character === '\\') { escaped = true; continue; }
      if (character === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (character === '{' || character === '[') depth++;
      if (character === '}' || character === ']') {
        depth--;
        if (depth === 0) closed = true;
      }
    }
    return !quoted && !escaped && closed && depth === 0 && /[}\]]$/.test(value);
  }
  async function run(id) {
    const { job, files } = await send({ type: 'AIR_JOB_CONTEXT', id });
    if (job.paused) return;
    const settings = job.settings;
    const textarea = await wait(() => composer(settings), 20000, 'the DeepSeek composer; sign in if needed');
    if (job.state === 'ready') {
      const prepared = textarea.value === job.promptText;
      if (job.chatUrl && location.origin + location.pathname.replace(/\/$/, '') !== job.chatUrl) throw new Error('The project review chat changed. Retry to reopen its saved conversation.');
      if (!job.chatUrl && document.querySelector(settings.selectors.response)) throw new Error('This tab is not the saved project review chat. Retry to reopen that conversation.');
      if (!prepared && textarea.value?.trim()) throw new Error('The review composer contains unsent text. Clear it before retrying; it will not be overwritten.');
      const oldAnswers = Array.from(document.querySelectorAll(settings.selectors.response));
      if (oldAnswers.some(element => element.innerText.includes(id) && !/OUTPUT CONTRACT|REVIEW REQUEST|original_scene_prompt/.test(element.innerText))) throw new Error('This review already appears in the chat. It will not be submitted again.');
      const root = composerRoot(textarea, settings);
      await wait(() => {
        const currentRoot = composerRoot(composer(settings) || textarea, settings);
        return !Array.from(currentRoot.querySelectorAll(settings.selectors.stop)).some(visible) && isSendArrow(sendButton(settings, currentRoot));
      }, 90000, 'the previous chat response to finish');
      const input = root.querySelector(settings.selectors.fileInput);
      if (!input) throw new Error('DeepSeek image upload input is unavailable.');
      if (!files.length || files.length > 20) throw new Error('Expected 1–20 labeled review/context images.');
      if (!prepared && thumbnails(root).length) throw new Error('The composer contains unsent images. Clear those attachments before starting this request.');
      const previousThumbnails = new Set(prepared ? [] : thumbnails(root).map(image => image.currentSrc || image.src));
      const upload = await send({ type: 'AIR_CHECKPOINT', id, phase: 'uploading' });
      if (upload.paused) return;
      if (!prepared) {
        // Upload individually so an input without `multiple` also accepts
        // contact sheets or a candidate/previous-frame pair. Confirm each image.
        for (const [index, file] of files.entries()) {
          const transfer = new DataTransfer();
          const binary = atob(file.base64), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
          transfer.items.add(new File([bytes], file.filename, { type: file.mime }));
          const currentRoot = composerRoot(composer(settings) || textarea, settings);
          const currentInput = currentRoot.querySelector(settings.selectors.fileInput);
          if (!currentInput) throw new Error('DeepSeek upload input disappeared.');
          currentInput.files = transfer.files;
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(() => {
            const uploadRoot = composerRoot(composer(settings) || textarea, settings);
            if (/upload failed|failed to upload|file too large|unsupported file|maximum.*(?:files|images)|too many.*(?:files|images)/i.test(uploadRoot.innerText)) throw new Error('DeepSeek rejected the context/review attachment. Inspect the chat before retrying.');
            const previews = thumbnails(uploadRoot).filter(image => !previousThumbnails.has(image.currentSrc || image.src));
            if (previews.length > index + 1) throw new Error('Unexpected extra images in the composer.');
            return previews.length === index + 1 && previews.every(image => image.complete && image.naturalWidth && image.naturalHeight);
          }, 90000, `image attachment ${index + 1}/${files.length} (${file.filename})`);
        }
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, job.promptText); textarea.dispatchEvent(new Event('input', { bubbles: true }));
      let uploadStatus;
      await wait(() => {
        const currentRoot = composerRoot(composer(settings) || textarea, settings);
        if (/upload failed|failed to upload|file too large|unsupported file|no text.*(?:found|extracted)/i.test(currentRoot.innerText)) throw new Error('DeepSeek rejected the image attachment; inspect the review chat.');
        const previews = thumbnails(currentRoot).filter(image => !previousThumbnails.has(image.currentSrc || image.src));
        if (previews.length > files.length) throw new Error('Unexpected extra images in the review composer. Remove unsent attachments before retrying.');
        const button = sendButton(settings, currentRoot);
        uploadStatus = { thumbnails: previews.length, loadedThumbnails: previews.filter(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length,
          uploadBusy: Array.from(currentRoot.querySelectorAll(settings.selectors.uploadBusy)).some(visible), sendFound: !!button, sendEnabled: !!enabled(button), sendArrow: isSendArrow(button) };
        // Generic loading classes can remain visible even after DeepSeek enables
        // Send. Keep them as diagnostics; the loaded candidate and enabled Send
        // arrow determine whether the composer accepts this submission.
        return uploadStatus.loadedThumbnails === files.length && uploadStatus.sendEnabled && uploadStatus.sendArrow;
      }, 90000, 'the generated image thumbnail and enabled Send arrow').catch(error => {
        throw new Error(`${error.message} Upload status: ${JSON.stringify(uploadStatus || {})}`);
      });
      await send({ type: 'AIR_CHECKPOINT', id, phase: 'ready_to_send', uploadStatus });
      const authorization = await send({ type: 'AIR_CHECKPOINT', id, state: 'send_intent', chatUrl: location.href });
      if (authorization.paused) return;
      const button = sendButton(settings, composerRoot(composer(settings) || textarea, settings));
      if (!enabled(button) || !isSendArrow(button)) throw new Error('DeepSeek Send became unavailable before clicking. Inspect the existing review chat; it will not be submitted again automatically.');
      button.click();
      await wait(() => !composer(settings)?.value?.trim() && /\/(?:a\/chat|chat)\//.test(location.pathname), 30000, 'DeepSeek to acknowledge Send');
      await send({ type: 'AIR_CHECKPOINT', id, state: 'submitted', chatUrl: location.href });
    } else {
      // A recorded Send intent must never cause another click after a restart.
      await wait(() => document.body.textContent?.includes(id), 30000, 'the submitted review to load in its saved chat; it will not be submitted again');
    }
    await send({ type: 'AIR_CHECKPOINT', id, state: 'reviewing', chatUrl: location.href });
    let lastText = '', stableSince = 0, incompleteResponse = false, responseStatus, responseSnapshot = '';
    const raw = await wait(() => {
      const currentComposer = composer(settings);
      const root = currentComposer ? composerRoot(currentComposer, settings) : null;
      const control = root && sendButton(settings, root);
      const elements = Array.from(document.querySelectorAll(settings.selectors.response)).reverse();
      responseStatus = { responseCount: elements.length, matchingResponse: false, composerFound: !!root,
        stopVisible: !!root && Array.from(root.querySelectorAll(settings.selectors.stop)).some(visible),
        sendFound: !!control, sendArrow: isSendArrow(control), completedActions: 0, codeBlocks: 0, incompleteJson: false,
        responseCharacters: 0, stableForMs: 0, reason: 'waiting_for_review_id' };
      incompleteResponse = false;
      responseSnapshot = '';
      for (const element of elements) {
        // textContent also works for a response rendered outside the viewport.
        const text = element.textContent || '';
        // The user's request includes an example JSON contract. Never grade that as an answer.
        const assistant = element.matches('.ds-assistant-message-main-content, [data-message-role="assistant"]') || element.closest('[data-message-role="assistant"]');
        // Every frame/attempt shares this chat. Never read an older frame's answer.
        if (!text.includes(id) || (!assistant && /OUTPUT CONTRACT|REVIEW REQUEST|original_scene_prompt/.test(text))) continue;
        responseStatus.matchingResponse = true;
        responseStatus.completedActions = completedControls(element, settings).length;
        const blocks = Array.from(element.querySelectorAll('pre code, pre')).filter((node, index, nodes) => !nodes.some(other => other !== node && other.contains(node)))
          .map(node => node.textContent?.trim()).filter(Boolean);
        incompleteResponse = blocks.some(code => !completeJsonBlock(code));
        // Read the complete answer automatically, including malformed output.
        // The background validates all blocks and the candidate identity; silently
        // skipping a bad answer here would turn a format error into a timeout.
        const response = blocks.length ? blocks.map(code => `\`\`\`json\n${code}\n\`\`\``).join('\n\n') : text.trim();
        responseSnapshot = response.slice(0, 120000);
        Object.assign(responseStatus, { codeBlocks: blocks.length, incompleteJson: incompleteResponse, responseCharacters: response.length });
        // Observe the answer even while streaming, so a timeout explains exactly
        // what was found. Never accept a partial code block or a user contract.
        if (incompleteResponse || !response || !root || responseStatus.stopVisible || !responseStatus.sendArrow) {
          responseStatus.reason = incompleteResponse ? 'incomplete_json' : !root ? 'composer_missing' : responseStatus.stopVisible ? 'response_streaming' : !responseStatus.sendArrow ? 'send_arrow_missing' : 'empty_response';
          lastText = ''; stableSince = 0; return false;
        }
        // A complete JSON object with this review ID, idle composer, and stable
        // text can be read without a toolbar. Toolbar layout/visibility changes
        // must not turn a finished review into a timeout.
        if (!blocks.length && !responseStatus.completedActions) {
          responseStatus.reason = 'waiting_for_response_actions'; lastText = ''; stableSince = 0; return false;
        }
        responseStatus.reason = 'waiting_for_stable_response';
        if (response !== lastText) { lastText = response; stableSince = Date.now(); return false; }
        responseStatus.stableForMs = Date.now() - stableSince;
        if (responseStatus.stableForMs >= 2000) return response;
        return false;
      }
      lastText = ''; stableSince = 0;
      return false;
    }, settings.timeoutSeconds * 1000, 'a completed structured review response').catch(error => {
      if (incompleteResponse) error.message = 'DeepSeek’s JSON response is still incomplete. Retry existing review to read the same chat after the response finishes; the frame will not be submitted again.';
      if (error.message.startsWith('Timed out waiting') || incompleteResponse) {
        error.code = 'response_timeout';
        error.responseStatus = responseStatus;
        error.responseSnapshot = responseSnapshot;
        error.message += ` Response tracking: ${responseStatus?.reason || 'unavailable'}.`;
      }
      throw error;
    });
    await send({ type: 'AIR_RESULT', id, raw, chatUrl: location.href });
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== 'AIR_RUN') return;
    if (active && active !== message.id) { respond({ success: true, busy: true }); return; }
    respond({ success: true });
    if (active) return;
    active = message.id;
    run(message.id).catch(error => chrome.runtime.sendMessage({ type: 'AIR_ADAPTER_ERROR', id: message.id, error: error.message,
      code: error.code, responseStatus: error.responseStatus, responseSnapshot: error.responseSnapshot }).catch(() => {})).finally(() => {
      active = null;
      chrome.runtime.sendMessage({ type: 'AIR_ADAPTER_IDLE', id: message.id }).catch(() => {});
    });
  });
})();
