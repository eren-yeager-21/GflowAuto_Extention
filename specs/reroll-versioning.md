# Re-roll replacement and revert

## Goal

Keep the project output folder stable when a frame is re-rolled and allow the user to restore the image used before the latest successful re-roll.

## Required behavior

1. Every automatic or manual frame download uses the exact output folder and target_filename from the spec.
2. When that filename already exists, Chrome overwrites it instead of creating a numbered copy such as frame_065(1).png.
3. Re-roll operations are serialized so only one can manipulate Google Flow at a time.
4. Starting a re-roll snapshots the frame's current image URL, Flow tile title, and completion time.
5. The snapshot becomes the revert version only after the new generated image is captured successfully.
6. A failed re-roll leaves the current image and existing revert version intact.
7. After a successful re-roll, the frame displays a Revert button.
8. Revert restores the previous image and Flow tile title, clears the one-level revert history, and overwrites the target file with the restored image.
9. Revert changes the extension mapping and downloaded file; it does not delete either generated tile from Google Flow.
