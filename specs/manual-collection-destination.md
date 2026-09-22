# Manual collection destination

## Goal

Generate every frame inside a Google Flow collection that the user creates manually. The extension receives the collection page URL instead of trying to create, find, or rename a collection through Flow's changing UI.

## Input

The user may paste the URL into the side panel or provide it in the uploaded JSON:

```json
{
  "project": "how_humans_learned_to_have_fun",
  "collection_url": "https://flow.google.com/project/..."
}
```

`flow_collection_url` and `collection.url` are accepted aliases. Only HTTPS URLs on `flow.google.com` are valid.

## Required behavior

1. The dashboard shows the configured destination and lets the user capture the currently open Flow page and tab.
2. Starting or re-running generation uses the exact configured URL.
3. The captured tab is preferred so collection state is preserved even when Flow does not change the project URL.
4. If it is not open, the extension navigates one existing Flow tab to the URL and waits for it to load.
5. An invalid configured URL stops generation with a clear message.
6. With no configured URL, the extension keeps the current behavior and uses the best open Flow project tab.
7. The extension does not create or rename collections.

## Manual verification

1. Create a collection in Flow and open it.
2. Load a spec, click **Use open Flow page**, and confirm the URL appears.
3. Start with one frame and confirm the generated tile appears in that collection.
4. Open a different Flow project in another tab and confirm the next frame still goes to the configured collection.
