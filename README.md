# GflowAuto_Extention

Unlocked VEO Automation Chrome Extension for Google Flow, featuring the Spec-Driven pipeline engine, full-name reference tagging, and automated frame generation.

## Features
- **Spec-Driven Automation**: Automated frame-by-frame and batch generation on Google Flow (`flow.google.com`).
- **Exact Full-Name Tagging**: Prefix-based reference chip selection matching Google Flow tiles without truncation or heuristic word-dropping.
- **Selective Relevance & Text Exclusion**: Built-in universal reference rules instructing models to isolate style and anatomy while discarding unrelated props, title cards, dates, and typography.
- **Local Frame Title Mapping**: Automated tracking and resolution of Google Flow tile titles across scenes and character assets.
- **Agent Mode Safeguards**: Prevents accidental activation of Google Flow's AI agent mode.
- **Collection Management**: Project-level collection grouping.

## Installation
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select this folder (`veo-automation-unlocked`).
4. Navigate to `flow.google.com` and open the **VEO Automation** Side Panel.

## Generate inside a manually created collection
1. Create the collection in Google Flow and open it.
2. Load the JSON spec in the extension.
3. Click **Use open Flow page** beside **Google Flow collection URL**. This binds the pipeline to the open tab even if Flow does not change the URL when entering a collection.
4. Start the pipeline.

You can also set the collection_url field to an https://flow.google.com/... address in the JSON. Capturing the open page is recommended when multiple Flow tabs use the same project URL.

## Parallel image generation

Set max_parallel_generations at the top level of the JSON to control active independent image generations. The default is 3, and the side panel accepts any positive whole number. Frames with frame_reference or continuity set to continue still run one at a time after their referenced frame completes.
