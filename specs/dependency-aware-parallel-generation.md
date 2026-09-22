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
5. Frames with frame_reference or continuity set to continue are ordering barriers and run one at a time in source order.
6. A dependent frame starts only after its referenced predecessor is complete.
7. If any required frame fails, stop scheduling dependent frames and show an error state.
8. Pause cancels the active Flow batch and prevents further submissions.
9. The image model remains Nano Banana 2.
