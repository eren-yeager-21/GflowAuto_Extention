# Automatic AI validator worker

## Goal

When the user enables automatic AI review for a Spec Pipeline project, each newly generated image is sent to the existing DeepSeek review worker with that frame's visual prompt and `verbatim_script`. A rejected image is regenerated with the reviewer's complete corrected prompt, then reviewed again. The user can turn this on from the pipeline dashboard without starting a review frame by frame.

## Behavior

- The dashboard shows whether automatic review is enabled. It remains an explicit project setting because candidates are uploaded to the user's DeepSeek account. Automatic correction is on by default when review is enabled; the existing reviewer settings control the correction limit (default two).
- Flow may generate independent frames in parallel. Each completed candidate enters the durable reviewer queue immediately; DeepSeek reviews are serialized in one project conversation without occupying a Flow generation slot. Dependent frames wait until their source candidate is approved.
- A review response must identify the current frame, attempt, and exact image hash. Only a valid `regenerate_image: true` decision with a complete `corrected_prompt` starts a correction. A pass publishes the assessed image. A response error, inaccessible image, or ambiguous assessment stops for manual attention and never creates another Flow submission.
- A correction first marks its old candidate as superseded and its frame as pending. If Flow is unavailable before the corrected submission, resuming the pipeline must generate the corrected prompt instead of reviewing or downloading the rejected image again. Accepted but interrupted submissions use Flow recovery rather than submitting twice.
- At most `maxCorrections` corrections are made for a frame. Every candidate and decision remains in review history; only an approved candidate is downloaded as the final frame. Pause stops new submissions, and a reopened panel resumes persisted reviews.

## Acceptance

1. Enable automatic review, start a project with independent and dependent frames, and confirm each completed candidate is queued with the frame narration and prompt. A dependent frame does not submit before its source passes.
2. Return a valid mismatch decision and verify one corrected Flow submission for the same frame, followed by a new review; a second mismatch respects the configured limit.
3. Return a pass and verify the reviewed candidate is mapped and published. Return invalid JSON or an upload error and verify no regeneration occurs.
4. Make Flow unavailable just before correction generation. The frame remains pending with the corrected prompt; Resume Pipeline does not reuse the rejected candidate.
