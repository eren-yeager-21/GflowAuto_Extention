# Re-roll replacement and revert

## Goal

Keep the project output folder stable when a frame is re-rolled and allow the user to restore the image used before the latest successful re-roll.

## Required behavior

1. Every automatic or manual frame download uses the exact output folder and target_filename from the spec.
2. When that filename already exists, Chrome overwrites it instead of creating a numbered copy such as frame_065(1).png.
3. Manual frame downloads use one background download request, and repeated clicks while that request is active are ignored.
4. Re-roll operations are serialized so only one can manipulate Google Flow at a time.
5. One Re-roll click creates exactly one Google Flow generation attempt. Re-roll does not inherit automatic pipeline retries.
6. A Spec frame captures and downloads only one resource from its generated Flow tile.
7. Re-roll waits for the captured image to be mapped before it finalizes the frame and clears temporary state.
8. The Flow completion result carries the captured image URL, filename, tile title, and re-roll correlation token so mapping does not depend on a separate runtime event.
9. A re-roll started from a restored saved session maps its result and exposes Revert without requiring Start Pipeline first.
10. If the primary capture message or result metadata is unavailable, the extension compares the Flow tiles before and after generation and maps the newly added tile.
11. Starting a re-roll snapshots the frame's current image URL, Flow tile title, and completion time.
12. The snapshot becomes the revert version only after the new generated image is captured successfully.
13. A failed re-roll leaves the current image and existing revert version intact.
14. After a successful re-roll, the frame displays a Revert button.
15. Revert restores the previous image and Flow tile title, clears the one-level revert history, and overwrites the target file with the restored image.
16. Revert changes the extension mapping and downloaded file; it does not delete either generated tile from Google Flow.
