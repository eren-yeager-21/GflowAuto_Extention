# Spec-Driven Video Production Workflow & Visual Consistency Guide
**Repository:** `E:\VideoGen_Pipeline` & `E:\Gflow_MCP`  
**Target Output:** 9–12 Minute YouTube Educational & Narrative Explainer Videos (1080p 16:9)  
**Core Aesthetic:** Minimalist Black Ink Stick-Figure Animation, Warm Parchment Palette, Rapid Micro-Cuts

---

## 1. Executive Pipeline Architecture

This pipeline is built on a **Spec-Driven Model** separating script structuring, visual generation, and post-production rendering into clean, deterministic stages:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. INGESTION & STORYBOARDING (AI Agent)                                     │
│    • Verbatim Narration Script Analysis                                     │
│    • Narrative Beat Segmentation (0.8s – 3.5s micro-cadence)                │
│    • Pipeline Spec JSON (`storyboard_spec.json`)                            │
│    • Video Timeline Blueprint (`timeline_blueprint.json`)                   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Upload JSON to Extension
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. VISUAL ASSET PRODUCTION (Chrome Extension in Google Flow)                │
│    • User creates required missing characters via `📋 Copy Prompt` buttons   │
│    • Extension auto-executes frame generation sequentially                  │
│    • Conditions on `@character_references` and prior `@frame_references`    │
│    • Auto-downloads all `frame_001.png` – `frame_NNN.png` to project folder  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Point Agent to Downloaded Scenes
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. AUDIO SYNTHESIS & TIMELINE SYNC (AI Agent / Python Scripts)              │
│    • Batch narration synthesis via Qwen3-TTS (`tts_qwen3_engine.py`)         │
│    • Precise audio-duration-to-visual-hold alignment                        │
│    • Timeline manifest compilation (`timeline_manifest.json`)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Automated FFmpeg Execution
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. FINAL RENDERING & WATERMARKING                                           │
│    • FFmpeg assembly with smooth crossfades and audio ducking               │
│    • Channel watermark branding overlay (bottom-right 100x100 white card)   │
│    • Export finalized 1080p MP4 ready for YouTube                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Visual Consistency Laws & Anti-Drift Standards

> [!CAUTION]
> **Why Visuals Drift**: Image generation models (Imagen 3 / Nano Banana 2 in Google Flow) default to photorealism, heavy 3D CGI, or painterly art whenever prompts describe complex nouns (e.g. *"desert"*, *"jeep"*, *"skeleton"*, *"cat"*, *"excavation"*) **without strict negative prompts and style reference anchors**.

To guarantee 100% visual consistency across all 60–100+ frames of a video, the following **4 Laws** are mandatory:

### Law 1: Mandatory Universal Negative Prompt
Every visual frame in `storyboard_spec.json` **MUST** include this locked negative prompt:
```text
photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, blurry, low resolution
```

### Law 2: The Style Reference Anchor Rule (No Orphan Frames)
Google Flow drifts whenever an image is generated without an attached reference. **Every single frame must have at least one reference**:
1. **Character Acting Frames**: Must tag `@character_reference` (e.g., `@narrator_stickfigure`, `@Early_man_stickfigure`).
2. **Continuous / Action Frames**: Must tag `frame_reference` (the mapped Google Flow tile title of the preceding frame, e.g. `"Smartphone vibrating on nightstand"`).
3. **Stand-Alone Objects / Cards / Environments**: If no character or prior frame applies, you **MUST** attach the **Master Style Anchor Image** (`@narrator_stickfigure` or `style_anchor_stickfigure`) as a style reference so Flow anchors to the ink stick-figure aesthetic.

### Law 3: The Scene-Only Prompt Rule
- **NEVER describe character physical appearance in the prompt text** when a character reference is attached.
- Describing appearance in text (*"man with hair, tunic, stick legs"*) while attaching a reference creates conflicting signals that cause 3D/realistic bleed.
- **The prompt text describes ONLY**: scene, environment, props, camera composition, and character action.

### Law 4: Standard Prompt Structure Formula
Every prompt in the specification must adhere to this exact structure:
```text
Minimalist black ink line art illustration with flat color fills, warm cream/ivory background (#FFFDD0), bold clean black ink linework, flat cel-shading, zero gradients, edge-to-edge full-bleed composition, 16:9 wide shot, no borders, no padding. [ACTION & SCENE DESCRIPTION ONLY]. [KEY PROPS & LIGHTING].
```

---

## 3. Master Character Model Sheet & Anatomical Standards

All characters share the exact same stick figure anatomy. Differentiations exist **only** through modular props:

```
          ┌──────────────┐
          │  Head Ring   │ ◄── Perfect geometric circle. Stroke: 4px solid black (#000000).
          │  (Fill: #FFF)│     Interior: Pure White (#FFFFFF) or Pale Cream (#FFFDD0).
          └──────┬───────┘
                 │         ◄── Facial Matrix: 2 solid black dots for eyes, simple arc mouth.
                 ▼
          ┌──────────────┐
          │ Torso & Limbs│ ◄── 4px solid black stick lines. No anatomy/musculature.
          │ (Stick Line) │     Mitten/arc hands (no 5-finger details), barefoot or simple shoes.
          └──────────────┘
```

### Character Suite Specifications
| Character ID | Flow Tag | Style Ref | Modular Identifiers & Prompt Definition |
| :--- | :--- | :--- | :--- |
| `CHAR_NARRATOR` | `@narrator_stickfigure` | `ref_stick_figure_narrator` | Pale cream fill head (`#FFFDD0`), vintage brown fedora with dark ribbon band, open conversational hand gestures. |
| `CHAR_PALEO_MAN` | `@Early_man_stickfigure` | `ref_prehistoric_human` | Wild shaggy brown hair silhouette, jagged fur pelt tunic over one shoulder, bare feet, stone spear or flint scraper. |
| `CHAR_PALEO_WOMAN` | `@Early_women_stickfigure` | `ref_prehistoric_human` | Hair tied back silhouette, simple animal pelt dress, bare feet, holding woven gathering basket. |
| `CHAR_ARCHAEOLOGIST` | `@archieologiest_stick_fig` | `ref_archaeologist` | Tan safari field hat with brim, khaki utility vest outlines, holding trowel, magnifying glass, or notebook. |
| `CHAR_EARLY_FARMER` | `@early_farmer_stickfigure` | `ref_prehistoric_human` | Coarse woven linen tunic, stooped posture holding a curved wooden digging stick or sickle, straw hat. |
| `CHAR_RICHARD_LEE` | `@richard_lee_stickfigure` | `ref_archaeologist` | 1960s field anthropologist, short spectacles on white circle head, short-sleeve safari shirt, clipboard and stopwatch. |
| `CHAR_MAP_ANCHOR` | `@maps_reference` | `ref_world_map` | Historical parchment map anchor, vintage ink continental outlines, warm beige territory fills. |

---

## 4. Pipeline Specification Schema (`storyboard_spec.json`)

The spec JSON consumed by the Chrome Extension Side Panel has this structure:

```json
{
  "project_name": "Ancient Humans Free Time - Hunter vs Farmer",
  "default_model": "Nano Banana 2",
  "default_aspect_ratio": "16:9",
  "output_folder": "ancient_humans_scenes",
  "frame_title_mapping": {
    "frame_001.png": "Smartphone vibrating on nightstand",
    "frame_001": "Smartphone vibrating on nightstand"
  },
  "characters": [
    {
      "id": "CHAR_PALEO_MAN",
      "name": "Early_man_stickfigure",
      "flow_tag": "@Early_man_stickfigure",
      "reference_image": "ref_prehistoric_human",
      "character_prompt": "Minimalist black ink line art stick figure paleolithic hunter-gatherer with shaggy brown hair silhouette, animal fur pelt tunic over one shoulder, bare feet, holding chipped flint hand axe. Clean bold outlines, flat color fills, zero gradients, pure white background."
    }
  ],
  "visuals": [
    {
      "id": "frame_001",
      "frame_number": 1,
      "prompt": "Minimalist black ink line art illustration with flat color fills, warm cream background (#FFFDD0), zero gradients. A modern sleek smartphone lying flat on a wooden nightstand vibrating furiously, displaying 06:00 alarm on its screen with bold black ink vibration lines. High contrast, full-bleed 16:9 wide shot, no borders, no padding.",
      "negative": "photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic faces, deformed limbs",
      "character_references": [],
      "frame_reference": null,
      "continuity": "anchor",
      "target_filename": "frame_001.png",
      "flow_tile_title": "Smartphone vibrating on nightstand"
    },
    {
      "id": "frame_002",
      "frame_number": 2,
      "prompt": "Minimalist black ink line art illustration with flat color fills, warm cream background (#FFFDD0), zero gradients. Stick figure character lying in bed tangled in sheets, staring exhaustedly toward the vibrating smartphone on the nightstand. Full-bleed 16:9 wide shot, no borders, no padding.\n\n### Reference Guidance: Use the provided reference Smartphone vibrating on nightstand for creating continuous scene layout, perspective, lighting, color palette, and background coherence.",
      "negative": "photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic faces, deformed limbs",
      "character_references": [],
      "frame_reference": "frame_001",
      "continuity": "continue",
      "target_filename": "frame_002.png",
      "flow_tile_title": "Exhausted character staring at alarm"
    }
  ]
}
```

---

## 5. Google Flow Extension Automation Protocol

### Reference Tagging Protocol
When downstream frames reference an earlier frame or character:
1. **Never use local upload menus**: Frames already exist in Google Flow; they do not need to be re-uploaded from disk.
2. **Direct `@` Mention in Prompt Editor**:
   - The extension types `@` inside the prompt editor box.
   - It clicks the **`Images`** tab (`mat-icon: image`), **never** `Uploads` (`drive_folder_upload`).
   - It types the clean 2-word title (e.g. `"Smartphone vibrating"`).
   - It clicks the matched asset button to insert the chip.
3. **Local Tile Title Mapping**:
   - Google Flow assigns human-readable titles (e.g. `"Smartphone vibrating on nightstand"`).
   - The extension maintains a mapping `localFrameTitleMap` linking `frame_001.png` ➔ `"Smartphone vibrating on nightstand"`.
   - The Side Panel provides a **`🔄 Sync Flow Titles`** button to scan the open Flow project and auto-map all tile titles.

---

## 6. Timeline Blueprint & Post-Production (`timeline_blueprint.json`)

### Blueprint Structure
```json
{
  "project_name": "ancient_humans_free_time",
  "target_fps": 30,
  "resolution": [1920, 1080],
  "beats": [
    {
      "beat_id": "beat_001",
      "start_time": 0.0,
      "end_time": 2.2,
      "duration": 2.2,
      "verbatim_text": "This morning, a machine screamed at you until you woke up.",
      "audio_file": "audio_001.wav",
      "frame_file": "frame_001.png"
    }
  ]
}
```

### Post-Production Execution Commands
Once frames are downloaded:
```powershell
# 1. Batch Speech Synthesis (Qwen3-TTS)
python E:\VideoGen_Pipeline\tts_qwen3_engine.py --blueprint "storyboard/timeline_blueprint.json" --output_dir "audio"

# 2. Compile Timeline Manifest & Concat List
python E:\VideoGen_Pipeline\assemble_timeline.py --project "ancient_humans_free_time"

# 3. Final Video Render (FFmpeg with Logo Watermark)
python E:\VideoGen_Pipeline\render_timeline.py --manifest "rendering/timeline_manifest.json" --output "output/final_video.mp4"
```

---

## 7. Troubleshooting & Anti-Drift Checklist

| Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Visuals turn 3D / photorealistic** | Empty negative prompt or realistic description in prompt text. | Enforce Law 1 locked negative prompt; remove realistic adjectives from prompt. |
| **Random style on standalone props** | Condition 4 orphan frame generated without any reference. | Enforce Law 2: Attach `@narrator_stickfigure` as Master Style Anchor. |
| **Extension stuck on "No assets found"** | Search was executed under "Uploads" tab instead of "Images" tab, or trailing dots in search query. | Extension must select `Images` tab and search 2 clean words (`"Smartphone vibrating"`). |
| **Character looks different in every frame** | Describing character features in prompt text while tagging character. | Strip character descriptions from prompt text (Law 3 Scene-Only Rule). |
| **Missing character in Google Flow** | Character not yet created in Flow project. | Click `📋 Copy Prompt` in Side Panel, paste into Flow character creator, create once. |
