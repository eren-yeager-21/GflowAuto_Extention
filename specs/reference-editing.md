# Reference editing

Branch `references-editing` starts from `da39b03`, the completed parallel generation implementation.

## User interface

Each frame shows its assigned image and character references with a preview when available, a source type, and a usage role. Edit references opens a dialog to add, replace, or remove assignments, choose an earlier frame, and edit reference guidance. An earlier-frame reference is a dependency barrier; selecting None restores independent generation.

Manage references in Characters & References opens the project library. Refresh from Flow reads visible ready project images and registered characters, including their names, thumbnails, and native asset IDs when available. Users can select an existing asset or enter its exact Flow name. This feature does not upload or create reference assets. Flow virtualizes its image grid, so the library reports that users may need to scroll Flow and refresh again to expose other images.

Library edits update frames assigned to that reference. Image and character identity are separate from the usage role: a Flow image can supply character appearance or style, and is attached through the image picker. Existing submissions and completed images retain their original generation; edits apply to subsequent generations or an explicit Re-roll.

Reference editing and Flow scanning are locked during generation. A reference refresh also locks generation until its Flow navigation has finished.

## Storage and generation

The project stores `reference_library` entries with `id`, `name`, `kind`, `preview_url`, `tile_id`, and `flow_url`. Edited frames store `reference_assignments` containing `reference_id` and `role` (`character`, `style`, or `image`). Legacy character, style, and image lists are maintained for compatibility. These lists, assignments, the library, and custom reference guidance survive saved sessions and JSON export/import.

Existing unedited specs continue using their existing reference picker behavior. Edited frames derive actual generation attachments from the saved library and source kind, and receive guidance based on each reference's usage role. Previous-frame images are retained alongside the edited attachments.

Edited selections use strict attachment: native media IDs or matching image identity distinguish references with duplicate captions. Exact unique names are allowed when no identity is available. Missing or ambiguous references fail during preparation, before Generate; the extension does not substitute an alias, a different asset with the same caption, or plain unbound @ text.

## Validation

No generation runs or automated tests are performed, following the user's preference. Runtime confirmation requires reloading the extension and refreshing Flow. Existing parallel scheduling and accepted-submission recovery are retained.

Static JavaScript syntax checks cover the reference editor, pipeline controller, strict picker, and content automation bundle.
