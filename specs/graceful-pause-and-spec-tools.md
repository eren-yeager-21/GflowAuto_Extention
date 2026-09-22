# Graceful pause and Spec Pipeline tools

## Goal

Let the user pause safely during image generation and give the Spec Pipeline the basic settings and diagnostic controls already available in Classic Batch.

## Scope

This feature applies to the Spec Pipeline image workflow. The only enabled generation mode is Text to Image with the Nano Banana 2 model. Frame to Video and Text to Video remain future work.

## Graceful pause behavior

1. Clicking Pause immediately prevents the pipeline from submitting another frame.
2. Any prompt already accepted by Google Flow is allowed to finish.
3. The extension waits for each accepted image to be downloaded and mapped to its frame before the pipeline becomes paused.
4. A frame that was never submitted returns to Pending with zero progress and no error.
5. Pause alone must not mark a frame as Error.
6. A real generation, download, mapping, or duplicate-tile failure remains an Error even if Pause was also requested.
7. Resume continues from the first Pending frame.
8. While active work is draining, the UI shows Finishing active generations and disables repeated Pause requests.

## Settings behavior

1. Generation mode displays Text to Image and cannot be changed in this feature.
2. Image model displays Nano Banana 2 and cannot be changed.
3. Aspect ratio can be selected from 16:9, 9:16, and 1:1.
4. Output count is fixed to one image per frame.
5. Automatic download uses original quality.
6. Max active independent generations is a dropdown from 1 through 10 and defaults to 3.
7. Dependent frames always run sequentially regardless of the selected maximum.

## Debug Log behavior

1. The log displays Spec Pipeline events and action log messages emitted by the Flow content worker.
2. The panel keeps the newest 300 entries.
3. Copy writes the visible log history to the clipboard.
4. Clear removes the current in-memory log history.
