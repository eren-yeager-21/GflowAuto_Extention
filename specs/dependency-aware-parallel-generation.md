# Dependency-aware parallel image submission

## Goal

Reduce total generation time by keeping several independent Google Flow image generations active while preserving strict ordering for frames that use a previous frame.

## Configuration

The top-level JSON field max_parallel_generations controls the maximum active independent generations. It defaults to 3 and accepts whole numbers from 1 through 10. The older parallel_gen_value name is accepted as an alias. The side panel exposes the same setting.

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
10. Pause prevents further submissions, lets accepted generations finish downloading and mapping, and returns untouched frames to Pending.
11. The image model remains Nano Banana 2.
12. After Flow accepts a prompt, a tile with no percentage and no media remains active until media appears or the full generation timeout expires.
13. While the side panel is open, a named keep-alive port and periodic ping keep the extension service worker available through submission, capture, mapping, and download.
14. Tile matching uses the pre-submit tile count and normalized media URLs; it does not depend on DOM node identity because Flow may re-render existing cards.
15. Media URLs present before submission are excluded from completion and download, even if Flow exposes them inside the selected tile.
