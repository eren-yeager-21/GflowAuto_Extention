# Optional AI reviewer

This module reviews a generated storyboard image against its visual prompt and narration, using the project's contact sheets and full transcript as context. Validator instructions and project context are sent once in an opening message. Later requests send the candidate image, prompt, narration, and tracking metadata; dependent frames also attach their preceding reference frame. Named Flow character references are not required by the reviewer.

## Setup

Reload the unpacked extension and reopen its panel. In Spec Pipeline, open AI reviewer beside Frames, Settings, and Logs. Load or resume a project before configuring review. DeepSeek must be logged in in the browser/profile running the extension; a login in Codex's separate browser does not log that profile in.

Automatic review is off by default. Review with AI sits directly beside Edit Spec in every frame's footer. On a completed/synced frame with no review, it starts a standalone review; with an existing review it opens the result/progress dialog. The dialog shows the image, narration, review status, saved DeepSeek conversation, corrected prompt, and compact attempt history. Detailed JSON and image-file recovery are collapsed. Enable automatic review to check newly generated images. Independent Flow generation keeps its slots; review jobs run serially in the project's shared background conversation. Dependent generation waits for approval of its source frame.

Manual Review with AI remains available on generated images while the pipeline runs. Clicking it queues that image in the background reviewer without pausing Flow generation. Another active review for the same candidate is not submitted twice. Starting a review remains unavailable without a generated image or during review preparation/correction; the button tooltip explains that state. The pipeline follows the current review job when a manual review replaces an earlier completed assessment.

The extension saves a DeepSeek conversation URL for each initialized context and exports the current URL as ai_reviewer_chat_url in the spec. Subsequent frames and correction attempts reuse that context's chat. Changing contact sheets, transcript, or validator instructions initializes a new conversation before new reviews; already submitted jobs retain their own conversation. A closed tab is reopened at its saved URL. Each response must contain the current request's unique ID, preventing reuse of another frame's assessment. Reviews run serially, and the next job is woken as soon as the previous adapter releases the composer.

## One-time context setup

Open AI reviewer → One-time project context. The bundled starting package contains copies of 15 contact sheets from E:\Video_Visualyzer\contact_sheets and the user's provided timestamped transcript, stored as context/transcript.txt. The transcript is also saved beside the source contact sheets as transcript.txt. These are this video's defaults; import a different folder for another video.

Place the final transcript.txt inside E:\Video_Visualyzer\contact_sheets and choose Import contact_sheets folder, or use Replace transcript only. The importer accepts 1–20 PNG/JPEG/WebP/GIF images and one TXT/Markdown/JSON transcript. File changes outside the extension require re-import; browser extensions cannot watch an arbitrary disk directory.

Initialize context uploads the sheets and sends the full transcript with the validator instructions in a new background chat. It waits for exactly this acknowledgement before sending any frame:

```json
{"context_id": "supplied-context-id", "context_ready": true}
```

The first Review with AI initializes context automatically if needed. Once acknowledged, instructions, sheets, and transcript are not repeated. A dependent review attaches CANDIDATE and PREVIOUS_FRAME, clearly labeled; the prompt identifies the previous frame as continuity evidence only. DeepSeek's website has no system-message field here: the validator is an opening user message, not an API system role. Retry context setup reconciles an existing submission without sending it again. Context upload or acknowledgement errors stop reviews instead of approving or regenerating images.

When regenerate_image is true, the corrected prompt drives regeneration if automatic correction is enabled, subject to two corrections by default (three candidates total). When false, the image is approved. Technical errors and assessments that cannot be completed require attention and do not initiate automatic generation.

This applies to Review image as well as pipeline-generated reviews. With automatic correction enabled (the default), a completed standalone review with regenerate_image=true immediately starts correction of that same frame when the pipeline is idle. The corrected_prompt replaces the frame's active visual prompt and is sent to Flow; the original scene prompt stays in review history so corrections preserve the scene. The new image is reviewed again until approved or the correction limit is reached. Duplicate result events cannot regenerate an assessment already consumed. A running pipeline owns its corrections; standalone corrections queue behind it. Paused reviews wait for resume. The panel must be open to start generation; reopening and resuming reconciles persisted reviews.

## Validator and instructions folder

The active defaults are:

    defaults/settings.json
    defaults/validator.md

Edit validator instructions and project context in the UI, or use Import instructions folder. Import reads settings.json and validator.md. Any references.json or reference images in an older folder are ignored. Files are read only when chosen; filesystem edits require re-import. Export instructions folder downloads both files to the project's ai-reviewer-context directory.

The validator checks whether the image communicates the narration, respects the textual prompt and intended drawing style, and has visible defects. Short narration fragments are interpreted with the scene prompt. Narration does not need to be printed in the image. Absent narration uses the visual prompt alone. Unreadable images or material conflicts between requirements cannot produce an approval or correction decision. An unattached named reference is not a reason to reject the image.

New reviews use schema 3 with exactly seven fields:

```json
{
  "schema_version": 3,
  "review_id": "supplied-review-id",
  "frame_id": "frame_001",
  "attempt": 1,
  "candidate_sha256": "supplied-image-hash",
  "regenerate_image": true,
  "corrected_prompt": "Complete improved visual prompt."
}
```

The five tracking fields must match the candidate exactly. regenerate_image must be a JSON boolean: true requires a nonempty complete corrected_prompt; false requires null. Issues, scores, confidence, checks, verdict, and summary are absent. Score/confidence controls were removed from settings. Older already-submitted schema-1/2 jobs retain their original validation through legacy-report.js; pending unsent jobs migrate to schema 3. Old default validators update automatically, while custom criteria remain editable and the final output contract controls reporting format.

Response extraction watches the current composer's Send/Stop controls rather than buttons elsewhere in the shared conversation. A complete code block containing the current review ID can be read after streaming stops and its text remains stable, without depending on the response toolbar being visible. Toolbar actions are supplemental evidence for responses without a code block. The user's JSON example is never treated as a review result.

After submission, the content adapter automatically watches DeepSeek's assistant response until streaming stops and its content is stable. It reads the JSON code blocks directly from the page and sends them to the background worker, which checks the schema and exact frame, attempt, review ID, and candidate hash, persists the assessment, and updates the frame and open review dialog. No copying or manual JSON extraction is required. Completed malformed responses are retained and reported as JSON validation errors instead of silently waiting for a timeout; View review shows the received response for diagnosis. Technical parsing errors do not trigger regeneration.

Response actions alone are not completion proof: the reader also checks for a closed JSON container, taking quoted strings and escapes into account. Partial code blocks (including a response cut off inside a property name) remain pending even if the page temporarily shows response actions or Send. An incomplete response timeout specifically directs Retry existing review to reread that chat, without submitting again.

If strict JSON parsing fails because a quoted string contains literal control characters, the parser escapes those characters and retries JSON decoding before applying the same full schema and identity validation. The original response and string contents are preserved, and the dialog reports this formatting recovery. Other malformed JSON is not guessed or evaluated. Retry existing review first reparses a saved response using the current parser; if it still cannot validate, it reads the existing chat without another upload or submission.

Candidate bytes are obtained from Flow's authenticated Google media URL, with original size requested when possible. Data image URLs and temporary blob URLs are supported. When a worker cannot read the source, a packaged function captures the image in its source Flow tab using the exact image address or saved media identity. An editor page URL identifies an asset; it is not uploaded as an image or used to guess which grid image belongs to the frame. If the exact asset is not loaded, scroll to it in Flow or use Choose generated image file in the review dialog to select that frame's downloaded PNG/JPEG/WebP/GIF. There is no need to generate the frame again.

Flow also serves images from https://flow-content.google. The manifest grants access to this specific host and the worker downloads those images directly with credentials, avoiding a page fetch that can be blocked by cross-origin restrictions or a canvas that cannot expose image pixels. Reload the unpacked extension after a host permission change, reopen the panel, and use Retry existing review on a stopped image-reading job.

The candidate must decode as PNG/JPEG/WebP/GIF, be at most 20 MB, and meet the configured minimum image size. DeepSeek receives an actual image attachment with the frame's prompt and narration. The report updates while open to show image retrieval, chat preparation, upload, and assessment. Only one active review may be started per frame. Logs include its frame filename and image source scheme/host. Approved pipeline downloads use the cached bytes that were assessed rather than refetching an expired source.

Upload readiness is checked across the composer and attachment area. Images are added individually, confirming each thumbnail, and Send requires all expected thumbnails to be loaded plus the enabled Send arrow. DeepSeek's image thumbnail does not need to display the filename. Generic loading/spinner matches are diagnostics and do not block Send. Explicit attachment errors, including website attachment limits, stop setup rather than silently omitting sheets. Send intent is persisted before the single automatic click. Upload timeouts include thumbnail and Send control diagnostics.

## State and recovery

IndexedDB flow-ai-reviewer-v1 stores candidate bytes, context sheets and transcript, initialization jobs, and reviews. Spec JSON stores reviewer settings, context fingerprint, chat URL, and job pointers, with no image blobs. Context materials remain available after closing the extension panel.

The worker persists Send intent before clicking and records the conversation URL afterward. An uncertain send is never blindly repeated. Retry existing review reconciles the recorded chat. Unsubmitted reviews bind to initialized context before upload; older already submitted chats are reconciled first. Unsent text or unexpected composer attachments are not overwritten.

Resume Pipeline and Resume reviews recover a response timeout only for the frame's current, unchanged candidate. A saved response is validated first; otherwise the recorded conversation is reopened and read with a fresh response-wait budget. The old Send timestamp does not expire a restored job before that read starts. Recovery does not upload or send the candidate again, and earlier corrected candidates remain in history. A passed review is retained; a regenerated image has its own review ID and candidate hash and must receive its own assessment. No continuous automatic retry loop is used: a subsequent timeout stops for attention again.

Response timeout Details record the review ID, candidate hash, chat URL, number of response elements, whether the current review ID was found, composer Send/Stop state, code-block completeness, text stability, and the blocking reason. View review also retains a matching response snapshot marked not yet validated. Partial snapshots are diagnostic only and cannot approve an image or trigger correction.

Pause reviews stops new submissions; submitted results are retained. Closing the panel does not interrupt a queued/submitted review. Corrections, final publication, and subsequent generation batches continue on Resume Pipeline after reopening the panel. With automatic review enabled, final downloads and dependent frames wait for AI or explicit manual acceptance.

Before starting or resuming a Flow batch, the pipeline checks its target tab's content-script connection with CHECK_FLOW_PAGE. If the receiver is absent after an extension reload, it imports the packaged Flow module into that existing tab and checks again before any generation command. This does not reload the project or repeat an accepted generation. Connection failures identify the tab and recovery step in logs. Resume/pause controls update stored review state without logging historical terminal errors as new failures.

If an accepted image loses its DOM marker while the extension is closed, resume first tries the saved media identity, marker, or exact pending prompt. A resumed image that remains missing for 30 seconds stops with image-recovery instructions instead of waiting the full generation timeout. Choose existing image appears on unresolved accepted/uncertain frames: pause the pipeline, select the correct completed Flow image by its preview, then resume. Selection saves its image URL, native tile ID, and title; it does not generate or approve another image. Images assigned to other frames are excluded. Only currently rendered Flow images can be listed; scroll to the image in Flow and reopen the picker if needed. Saved generating badges reset to pending on session load while their submission receipts remain intact. A review request saved before its candidate was captured is queued after recovery rather than waiting for a nonexistent review job.

Changed scene prompt, narration, instructions, context material, or predecessor image invalidate an older approval. A replaced predecessor can make generated descendants stale because their Flow source changed. Generation references continue to be managed by the separate reference editor.

## Removal

Remove the optional background import in service-worker-loader.js and the panel.js script in src/ui/side-panel/index.html, then reviewer-only host permissions. PipelineReviewer calls are optional; without the module, generation uses its regular delivery path. Pause and reconcile submitted work before detaching the module.

## Validation

An explicitly requested live sample using the earlier schema-2 contract was run in Codex's in-app DeepSeek browser; its inputs, responses, parser results, and screenshots are in artifacts/ai-reviewer-sample. A matching map request passed after correcting the initial response's issue format. A request requiring three red pins failed because the image contained one and returned a corrected prompt. These are historical results, not live validation of schema 3. The live page reproduced uploadBusy=true while the thumbnail and Send arrow were ready, and confirmed that response actions sit outside .ds-message.

The browser tool uploaded through clipboard image paste and submitted using Enter after its click was not acknowledged. It did not run the Chrome extension's DataTransfer upload, automatic background click, job storage, or Flow regeneration. Those extension integration paths remain unverified by this sample. JavaScript syntax checks passed for the changed module files.

An explicitly requested live schema-3 context sample is saved in artifacts/ai-reviewer-context-sample. All 15 sheets and the supplied transcript initialized one chat; an independent map passed, and a dependent request with a deliberate pin-count mismatch returned regeneration plus a corrected prompt. The actual context/review parsers accepted the DOM-extracted JSON with matching identities. Browser upload and submission used the tool's file chooser and keyboard controls; the installed extension's background queue, sequential DataTransfer uploads, automatic click, persistence, and Flow regeneration remain unverified by this sample. The previous image was the same map, so this checks paired attachments rather than varied-frame continuity accuracy.
