# Saved session recovery

## Problem

Opening a JSON file updates the latest-project pointer and immediately saves under a key derived only from the project name. A different project hides older sessions; the same project name overwrites the previous mapping. The upload screen also hides sessions with no completed frames.

## Behavior

1. Switch Spec opens a list of all valid sessions in extension storage, including legacy project-name keys and sessions with no completed frames.
2. Each entry shows its project name, completed/total frame counts, and save time. Resume loads only the chosen entry and does not start generation.
3. A new JSON import or sample receives a new storage key even if its project name matches an existing session. Later progress saves update that same key.
4. Resuming a saved session retains its exact storage key. Switching waits for the current save before listing sessions.
5. Importing or resuming a different session must not inherit frame titles from the previous in-memory session.
6. Storage read/write failures are reported; they must not be described as an empty or successfully saved session.
7. Session switching is unavailable while generation or re-roll is running.
8. Existing sessions are neither deleted nor migrated automatically. The list cannot reconstruct a mapping overwritten before this change; an exported mapping is then required.

## Validation

Use mocked extension storage to verify legacy discovery, a stale latest pointer, an incomplete latest session, same-project imports, resume into the original key, registry isolation, save failures, and the selection UI. Preserve signed image URLs and re-roll history when resuming.
