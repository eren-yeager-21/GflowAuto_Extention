# Persistent pipeline diagnostics

## Goal

Make generation, capture, mapping, download, and extension-lifecycle failures reviewable from the Spec Pipeline Debug Logs tab, including after the side panel is closed or reloaded.

## Required behavior

1. Diagnostics are structured with timestamp, severity, source, event name, message, and bounded details.
2. The latest 500 entries persist in chrome.storage.local and reload with the side panel.
3. Clear removes both the visible entries and persisted entries; Copy includes all structured fields.
4. Full HTTP, blob, data, and filesystem URLs are not persisted in log messages. Media is described by scheme, host, path tail, length, and render-risk classification.
5. The side panel records keep-alive connection changes, uncaught errors, and unhandled promise rejections.
6. Every re-roll records its frame identity, active generation group, status transitions, captured-resource count, and terminal outcome.
7. Capture handling records the media type and every acceptance or rejection decision.
8. Preview load success and failure are recorded so a broken mapped URL is distinguishable from a missing capture.
9. The content worker records the pre-submit tile snapshot, candidate wait state, selected post-submit tile candidate, and emitted capture media type and scheme.
10. Diagnostics must not change a failed capture into a successful mapping or infer a result from unrelated visible Flow cards.
11. A media URL that merely becomes visible through lazy loading is not proof of a new generation; tile selection requires generation state or a position verified against the pre-submit snapshot.
