# Dependency-aware parallel image submission

## Goal

Reduce total generation time by keeping several independent Google Flow image generations active while preserving strict ordering for frames that use a previous frame.

## Configuration

The top-level JSON field max_parallel_generations controls the maximum active independent generations. It defaults to 3 and accepts any positive whole number. The older parallel_gen_value name is accepted as an alias. The side panel exposes the same setting.

## Required behavior

1. Frames without frame_reference and without continuity set to continue are independent.
2. Consecutive independent frames are submitted in source order with at most max_parallel_generations active at once.
3. One UI submitter adds references and prompt text, clicks Generate, and moves to the next independent frame only after Flow accepts the submission.
4. Submitting an independent prompt does not wait for that image to finish when another slot is available.
5. Before each Generate click, snapshot the existing Flow tiles and bind the frame only to the newly created tile using a stable per-prompt marker.
6. Reject a captured media URL that is already assigned to a different frame and stop the batch with an error.
7. Frames with frame_reference or continuity set to continue are ordering barriers and run one at a time in source order.
8. A dependent frame starts only after its referenced predecessor is complete.
9. If any required frame fails, stop scheduling dependent frames and show an error state.
10. Pause cancels the active Flow batch and prevents further submissions.
11. The image model remains Nano Banana 2.

## Implementation

The Spec Pipeline panel groups consecutive independent frames into batches. A dependent frame is a barrier: the preceding batch completes first, then that frame runs alone using the captured Flow title of its completed reference. Resume skips completed frames. Invalid or incomplete references stop the pipeline with an error.

The Flow bridge uses one submitter for the shared editor and separate completion watchers for accepted tiles. It verifies Nano Banana 2, the requested aspect ratio, and x1 before every submission. It uses the current named settings controls and stops before Generate if configuration cannot be verified. Once settings match, later prompts need no menu interaction or fixed wait.

Each submission snapshots existing identities, pending DOM elements, queued-prompt counts, and media URLs just before Generate. It arms the acceptance observer before dispatching the click, so a pending tile is retained even when generation finishes before the click acknowledgement returns. Current Flow pending tiles have no native ID. A unique matching pending prompt identifies the submission. Otherwise, a unique new active pending tile identifies it under the serialized submitter and verified x1 settings. Active means it exposes pending text or generation progress; that text need not match the editor's serialized prompt. Empty grid placeholders are excluded from the active count and cannot establish acceptance, so old images still loading do not delay the next prompt. Previously pending elements and unchanged queued-prompt counts are excluded even when Flow replaces their DOM nodes. Unrelated ready images revealed by virtual scrolling are also excluded. A grid container recycled from an older image may retain a custom marker; a new submission's pending child replaces that ownership after acceptance. The tracker can rebind a replaced pending node by its unique prompt. Completed images expose data-media-id, which is persisted for tracking and sync after a DOM replacement. Older data-tile-id remains supported. Completion watchers observe DOM readiness and reuse a slot immediately; they do not wait for the global Stop button, hover tiles, or open rename menus.

Capture messages include the batch ID and frame index, and the panel accepts them only from the selected Flow tab and active batch. Duplicate media assignments fail the batch. Pause sends CANCEL_PROMPT_GROUP and keeps the run locked until cancellation completes. Already accepted server generations may continue in Flow, but the extension stops submissions, collection, and downloads for that cancelled batch.

The setting is saved in session mappings and exported JSON. There is no fixed inter-frame or post-submit delay in this path. Existing waits needed to populate the editor and select reference chips remain.

## Submission failures and recovery

Flow can display an automatically generated caption such as "Map of Middle East displayed" instead of the prompt text. The submitter binds a pending tile before that caption is generated. The compatibility path can accept a single new identity without a matching caption. Multiple candidates during a grid refresh keep the observer running rather than immediately failing the submission. Acceptance continues as soon as sufficient evidence appears, without a fixed settling delay. If the existing 30-second acceptance window expires without a unique match, the pipeline reports a tracking failure and stops automatic resubmission. The final scan is included in the error details. Generation progress is read from .loading-percentage, never from percentages embedded in captions or prompt text.

Submission state is persisted before Generate is dispatched and after a tile is bound. An uncertain click or an accepted image with a tracking/download failure is never automatically generated again. Only preparation failures before Generate, or a confirmed Flow generation failure, permit automatic regeneration. One failed worker stops new scheduling but lets other accepted images finish collection.

Completion tracking keeps ownership of the same pending DOM child even if its text changes. It saves the generated native media ID as soon as a new image appears, including while the pending overlay is still present. If Flow replaces the entire pending container, a mutation observer can recover a unique transition from one removed owned pending job to one unseen, unclaimed ready image. It refuses transitions involving multiple lost jobs or multiple unclaimed images. This avoids assigning images by grid position or semantic caption. Completion logs report whether a job is still generating, its tile disappeared, its image is loading, or the container still displays old media. Timeout details include the last observed state and progress.

The batch keeps unsubmitted frames pending after a worker failure. Its final log identifies the first failing frame and lists queued frame numbers, so an early timeout does not appear as a separate generation failure on every later card.

Resume watches an accepted tile or retries delivery/download of its already captured image. Re-roll explicitly starts a fresh generation. Older sessions reporting "Failed to fill prompt", and interrupted sessions without submission metadata, require reconciliation before Resume can submit them again.

Sync Flow Images can recover completed images using the saved native tile ID or a unique Flow title match. It also handles saved semantic titles with no captured image URL. It refuses ambiguous duplicates and media owned by another frame. For an older crashed batch, reload the extension, refresh Flow, restore the saved session, and sync existing images before resuming. If matching is ambiguous, edit the frame's Flow Title to the exact unique tile title and sync again.

## Spec Pipeline settings and logs

The Spec Pipeline has Frames, Settings, and Logs views. Settings edit the current project's parallel-generation limit, maximum attempts (including the first attempt), aspect ratio, and output folder. They are saved in the session mapping and exported spec; generation settings stay locked during a run. The model is Nano Banana 2 and output count is one image per prompt.

Logs collect the same ACTION_LOG messages displayed by Classic Batch plus Spec Pipeline scheduling and frame errors. The latest 2000 entries are saved in chrome.storage.local and restored after reopening the panel. Logs support level filtering, a frame selector, an Errors only shortcut, search, auto-scroll, copy, JSON download, and clearing history. Each Spec Flow entry includes the frame number, target filename, and Preparation, Submission, Generation, or Delivery phase; the shared submitter's reference-selection messages also receive this context. Search recognizes filenames and expressions such as Frame #16. Copy and download include the entries selected by the current filters, with frame and phase labels retained.

Acceptance diagnostics include the pre-submit pending tiles, current candidates, native IDs and markers, pending DOM elements versus percentage-based detection, reused containers, prompt matches, and prompt excerpts and lengths. These details are available under each log entry's Details disclosure and in copied or downloaded logs. Logging does not change scheduling or add a wait to generation.

No automated tests were run for these additions and tracking changes, at the user's request. Reload the extension and reopen its panel to access the new tabs. Runtime logs first showed 0 new pending candidates becoming 39 immediately after one x1 submission; the tracker previously failed on that first ambiguous scan. Later logs confirmed that the extra candidates are empty grid placeholders: 33 pending candidates contained 32 placeholders, decreasing to one active candidate and zero placeholders. The remaining active tile was still rejected by the extra prompt/progress requirements until it completed before the acceptance timeout. Those requirements have been replaced with unique active-tile acceptance. Acceptance logs now report active jobs separately from grid placeholders and state the evidence used to bind a tile.

A later run completed frames 28 and 29 while frames 16 and 26 hit the five-minute completion limit. Frame 26 still had no saved native tile ID; frames 30 and 31 then displayed the generic batch-failure fallback despite not being submitted. The completion ownership, native-ID persistence, mutation recovery, and batch-reporting changes address these failure paths. The user subsequently confirmed that the updated extension is working and requested the final implementation commit. No additional automated tests were run.

## Earlier verification

Run `node --test tests/parallel-generation.test.js tests/pipeline-integration.test.js` for overlap, serialized acceptance, slot reuse, dependency barriers, tile identity, out-of-order capture, duplicate prevention, failure, pause/resume, re-roll, and the installed Flow submitter. Existing helper checks are `node tests/pipeline-concurrency.test.js`, `node tests/flow-destination.test.js`, and `node tests/project-dir-session.test.js`.

The September 26 live browser check found Flow set to x2 because the previous configuration selector missed the current Settings trigger button. Flow was changed to x1, and one test image completed successfully. Its pending tile exposed the full prompt with no tile ID; the finished image exposed data-media-id. Regression fixtures cover those observed structures, settings correction, and pending-node replacement.

After reloading the unpacked extension and refreshing the Flow tab, set Parallel generations in Spec Pipeline (or max_parallel_generations in JSON). An independent / independent / continue sequence exercises overlapping independent images and a dependent barrier. The available automation browser blocks the extension-management page needed to reload the installed extension; the successful updated-extension run was reported by the user.
