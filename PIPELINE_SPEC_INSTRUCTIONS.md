# Pipeline Specification & JSON Generation Guide
## Google Flow Spec-Driven Production Pipeline (`Video_Visualyzer` ➔ `Chrome Extension` ➔ `VideoGen_Pipeline`)

This guide specifies the exact JSON structures, parameters, and visual prompt standards required when generating project specifications in `Video_Visualyzer`.

---

## 1. Overview: Project Directory Architecture & Deliverables

### 1.1 Project Directory Standard (`E:\Stick_Figure_videos\<project_name>\`)
All project-specific generation files, visual prompt JSONs, video timeline blueprints, transcripts, and maps must be created and organized under a dedicated folder in:
```
E:\Stick_Figure_videos\<project_name>\
```
Inside this project directory, deliverables are saved under both their project-specific names and canonical aliases:
- **Visual Prompt Spec**: `<project_name>_spec.json` and `visual_prompt.json`
- **Video Timeline Blueprint**: `<project_name>_timeline.json`, `video_timeline.json`, and `timeline_blueprint.json`
- **Project Concept Map & Transcripts**: `<PROJECT>_MAP.md`, `transcript.json`

### 1.2 The Two Primary Pipeline Deliverables

| Deliverable | File Name | Primary Consumer | Purpose |
| :--- | :--- | :--- | :--- |
| **Visual Prompt Spec** | `visual_prompt.json` / `<project>_spec.json` | Chrome Extension Side Panel (**Spec Pipeline** tab) | Orchestrates character suite creation, reference attachment, automatic retries, and sequential frame generation inside Google Flow. Must contain `"project_dir"`. |
| **Timeline Blueprint** | `video_timeline.json` / `timeline_blueprint.json` | `tts_qwen3_engine.py` & `render_timeline.py` | Governs narration voiceover synthesis, exact millisecond durations, and FFmpeg video assembly. |

---

## 2. Storyboard Spec (`storyboard_spec.json` / `visual_prompt.json`)

### 2.1 Complete Specification Schema (`format: "spec_v2"`)

```json
{
  "title": "Prehistoric Leisure & Cultural Evolution",
  "project": "how_humans_learned_to_have_fun",
  "project_dir": "E:\\Stick_Figure_videos\\how_humans_learned_to_have_fun",
  "format": "spec_v2",
  "description": "2D hand-drawn animated stick figure explainer analyzing the prehistoric origins of human leisure, social play, and the 40,000-year-old Hohle Fels bone flute.",
  "global_settings": {
    "aspect_ratio": "16:9",
    "output_folder": "how_humans_learned_to_have_fun",
    "project_dir": "E:\\Stick_Figure_videos\\how_humans_learned_to_have_fun",
    "style": "2D hand-drawn animated stick figure explainer style, clean bold organic black ink outlines, flat solid color fills, minimalist stick figure with white circular head and simple dot eyes, warm cream background (#FAF7EE), full bleed 16:9, zero gradients, no 3D rendering, no borders.",
    "negative_prompt": "photorealistic, 3D render, realistic human hands, fleshy skin, muscular arms, knuckles, fingernails, veins, dark murky shadows, borders",
    "model": "veo-2.0-generate-001",
    "max_retries": 3
  },
  "characters": [
    {
      "id": "narrator_stickfigure",
      "name": "narrator_stickfigure",
      "flow_tag": "@narrator_stickfigure",
      "description": "Stylized stick figure narrator avatar with circular cream head, cocked eyebrow, conversational gestures.",
      "image_url": "references/clean/narrator_stickfigure.png"
    },
    {
      "id": "male_early_human",
      "name": "male_early_human",
      "flow_tag": "@male_early_human",
      "description": "Upper Paleolithic male stick figure with circular white head, dot eyes, shaggy brown hair, one-shoulder animal pelt tunic.",
      "image_url": "references/clean/male_early_human.png"
    }
  ],
  "visuals": [
    {
      "id": "frame_001",
      "frame_number": 1,
      "timestamp_start": "00:00",
      "timestamp_end": "00:01",
      "matched_trope": "Modern Alarm Awakening & Morning Routine",
      "reference_video_sample_frame": "frame_001_00m01s.jpg",
      "prompt": "Vibrant 2D stylized digital animation art in rich saturated color. A sleek modern smartphone with a vivid glowing cyan screen lies flat on a warm amber-grained wooden nightstand inside a cozy morning bedroom with soft lavender wall tones. The phone screen brightly displays a glowing orange 06:00 digital alarm while vibrating furiously with dynamic golden soundwave shock lines. Macro top-down shot, vivid color palette, crisp stylized contours, edge-to-edge full bleed 16:9, zero white borders.",
      "negative": "monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding",
      "character_references": [
        "@narrator_stickfigure"
      ],
      "frame_reference": null,
      "continuity": "anchor",
      "reference_statement": "## Use @narrator_stickfigure strictly for vector stroke proportions. Render all scene objects, phone, and nightstand in full rich vibrant colors and ambient morning light. Do not render in black and white or sketch doodle style.",
      "target_filename": "frame_001.png"
    },
    {
      "id": "frame_002",
      "frame_number": 2,
      "timestamp_start": "00:01",
      "timestamp_end": "00:02",
      "matched_trope": "Alarm Silencing Quick Cut",
      "reference_video_sample_frame": "frame_002_00m02s.jpg",
      "prompt": "Vibrant 2D stylized digital animation art in rich saturated color. A stylized stick figure character arm and hand enter swiftly from the upper right, slamming downward onto the vibrating smartphone on the amber wooden nightstand to silence the alarm. Bright yellow and orange dynamic impact bursts, glowing cyan phone display, soft lavender bedroom background. Close-up static shot, continuous scene from previous frame, rich color palette, crisp stylized contours, full bleed 16:9.",
      "negative": "monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding",
      "character_references": [
        "@narrator_stickfigure"
      ],
      "frame_reference": "frame_001.png",
      "continuity": "continue",
      "reference_statement": "## Use @narrator_stickfigure strictly for stick-figure hand and arm line thickness.\n## Use the provided frame reference {frame_name} for phone dimensions, glowing screen color, and nightstand perspective continuity. Render in full rich vibrant color palette.",
      "target_filename": "frame_002.png"
    },
    {
      "id": "frame_003",
      "frame_number": 3,
      "timestamp_start": "00:02",
      "timestamp_end": "00:04",
      "matched_trope": "Dawn Savannah Awakening & Campfire Serenity",
      "reference_video_sample_frame": "frame_009_00m15s.jpg",
      "prompt": "Vibrant 2D stylized animation art in warm golden sunrise colors. Upper Paleolithic male stick figure with shaggy brown hair and a rich reddish-brown one-shoulder fur tunic sits cross-legged on a woven straw mat beside a blazing campfire with glowing orange embers and golden flames encircled by dark river stones. Behind him stretches an expansive golden African savannah with acacia silhouettes under a soft peach and warm violet dawn sky. He gently raises both arms upward in a relaxed morning stretch toward the sunrise. Warm rich color palette, clean stylized outlines, high contrast, full bleed 16:9 wide shot, zero borders.",
      "negative": "monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding",
      "character_references": [
        "@male_early_human"
      ],
      "frame_reference": null,
      "continuity": "anchor",
      "reference_statement": "## Use @male_early_human strictly for stick figure anatomy, head proportions, hair silhouette, and one-shoulder fur tunic style. Render the campfire, landscape, and sunrise in full rich warm dawn color palette.",
      "target_filename": "frame_003.png"
    }
  ]
}
```

### 2.1.1 Root Specification Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `title` | `string` | **Yes** | Human-readable title of the video project. |
| `project` | `string` | **Yes** | Project identifier (snake_case, e.g. `how_humans_learned_to_have_fun`). |
| `project_dir` | `string` | **Yes** | Absolute filesystem directory path: `E:\Stick_Figure_videos\<project_name>`. |
| `format` | `string` | **Yes** | Specification schema version (strictly `"spec_v2"`). |
| `global_settings` | `object` | **Yes** | Global pipeline settings including `project_dir`, `output_folder`, `aspect_ratio`, `model`, and `max_retries`. |

---

### 2.2 Visual Frame Field Dictionary

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | Unique frame ID formatted strictly as `frame_001`, `frame_002`, `frame_NNN` (3-digit zero-padded). |
| `frame_number` | `integer` | **Yes** | Sequential integer starting from `1`. |
| `timestamp_start` | `string` | **Yes** | Start timestamp in narration (`MM:SS`). |
| `timestamp_end` | `string` | **Yes** | End timestamp in narration (`MM:SS`). |
| `matched_trope` | `string` | Recommended | Directorial trope or scene theme from the visual reference map. |
| `reference_video_sample_frame` | `string` | Optional | Corresponding extracted frame from the reference video library (e.g. `frame_120_05m23s.jpg`). |
| `prompt` | `string` | **Yes** | **Vibrant 2D Stylized Animation prompt**. Scene description in natural descriptive prose. Always specifies vivid environmental colors and lighting. Never uses monochrome or sketch language. Never describes physical character anatomy if a character reference tag is attached. |
| `negative` | `string` | **Yes** | Universal locked negative prompt preventing monochrome, sketches, photorealism, and borders. |
| `character_references` | `array[string]` | **Yes** | `@` mention tags of character or style anchors (e.g. `["@male_early_human"]`). |
| `frame_reference` | `string \| null` | **Yes** | Target filename of previous frame (e.g. `"frame_001.png"`) for continuity, or `null` for new anchor scenes. |
| `continuity` | `string` | **Yes** | `"anchor"` (new visual concept/scene) or `"continue"` (continuous camera angle / action). |
| `reference_statement` | `string \| null` | Recommended | Explicit directive telling the model how to use references. Written with `##` headings. Mandates rendering in full vibrant color. |
| `target_filename` | `string` | **Yes** | Strict 3-digit zero-padded filename: `frame_001.png`, `frame_002.png`, etc. |

---

### 3.1 2D Hand-Drawn Animated Stick Figure Style (DO NOT USE "VIBRANT")
Diffusion models interpret the word "vibrant" as permission to render neon 3D cybernetic objects, purple alien characters, and heavy airbrushed CGI lighting.
- ❌ **FORBIDDEN PHRASES**: 
  - `Vibrant 2D stylized digital animation art in rich saturated color`
  - `neon glowing display`, `isometric 3D render`
  - `cyberpunk lighting`, `hyper-saturated`
- ✅ **MANDATORY 2D HAND-DRAWN EXPLAINER PATTERN**:
  - Start with: `2D hand-drawn animated stick figure explainer style. Clean bold black ink outlines, flat color fills, minimalist stick figure with white circular head and simple dot eyes.`
  - Describe the active scene, props, environment, and flat color palette in clean natural prose.
  - End with: `Warm cream background (#FAF7EE) [or dark indigo night sky with stars], full bleed 16:9, zero gradients, no 3D rendering, no borders.`

### 3.2 Natural Descriptive Prose Style
Do **NOT** structure prompts into rigid uppercase keyword blocks like `SUBJECT: ... ACTION: ... COMPOSITION: ... CAMERA: ...`. Google Flow's generative model produces superior compositions and natural poses when prompted in fluid, cohesive descriptive sentences.

### 3.3 Scene-Only Prompting & Mandatory Stick Figure Reference Rule
- **STICK FIGURE RULE (Anchor Frames)**: Whenever a stick figure is described or mentioned in an anchor frame prompt, you **MUST** attach its corresponding character reference tag in `character_references`:
  - Modern stick figure / narrator ➔ `@narrator_stickfigure`
  - Ancient male hunter ➔ `@male_early_human`
  - Ancient female ➔ `@women_early_human`
  - Skeptical / expressive host ➔ `@expression_stick_figure`
  - Archaeologist / researcher ➔ `@archieologiest_stick_figure` or `@ref_char_anthropologist_field`
- **CONTINUATION FRAMES RULE**: For continuation frames (`continuity: "continue"` where `frame_reference` is set), `character_references` **MUST be empty `[]`**. The previous frame serves as the visual reference; adding extra references causes Google Flow to blend conflicting anchors and corrupts the style.
- **Law of Character Decoupling**: Do NOT describe complex anatomy or clothing in the prompt when an anchor tag is attached; describe only the stick figure's action, posture, and interaction with props.

### 3.4 Decoupled `reference_statement` Formatting
The `reference_statement` uses `##` directives and instructs Google Flow to borrow only the structure from the reference while rendering in clean 2D hand-drawn style:

```
## Use @narrator_stickfigure strictly for vector stroke proportions. Render all scene objects and environment in clean flat color fills. Do not render in photorealistic or 3D CGI style.
```

When chaining a previous frame for scene continuity:
```
## Use the provided frame reference {frame_name} for phone dimensions, room background, and couch perspective continuity. Render in clean 2D hand-drawn explainer style.
```

> **Dynamic Google Flow Title Translation**: The pipeline automatically resolves `{frame_name}` or `frame_001.png` into the actual Google Flow tile title (e.g. `Smartphone vibrating on nightstand`) at runtime.

### 3.5 Rapid Micro-Animation Pacing & Narrative Continuity Chaining
For snappy explainer animation, visuals must change rapidly in rhythm with spoken narration:

1. **Pacing Guard (~Every 4 Words / 0.7s to 2.0s Max)**: Never hold a single visual across an entire sentence or paragraph. Break spoken narration down roughly every 3 to 6 words into distinct visual micro-beats.
2. **Title Cards for Temporal Jumps**: When the script shifts era (e.g. *"about 40,000 years ago, a human sat by a fire"*), use a 2-beat micro-animation sequence:
   - *Beat 1*: Title card reading `'40,000 YEARS AGO'` (`@title_reference`).
   - *Beat 2*: Early human stick figure sitting cross-legged at campfire under starry night sky (`@male_early_human`, `@fire_reference`, `@ref_env_camp_night_stars`).
3. **Continuous Sequence Chaining (Sequence of Story)**:
   When an action unfolds sequentially in the same setting (e.g. Frames 1 to 6 on the couch):
   - Keep the environment, furniture, and character identical across all frames.
   - Set Frame 1 to `"continuity": "anchor"`, `"frame_reference": null`.
   - Set Frames 2 through 6 to `"continuity": "continue"`, with `"frame_reference": "frame_XXX.png"` pointing to the previous frame.
4. **No Extra References on Continuation Frames**: For all continuation frames (`continuity: "continue"`), set `"character_references": []`. The previous frame reference is already passed as the conditioning image, so adding additional tags causes conflicting multi-reference blending, style drift, and 3D artifacts.
5. **Universal Locked Negative Standard**:
   ```text
   monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding, abnormally long arms, stretched limbs, elongated noodle arms, rubber hose limbs, elastic limbs, extra elbows, double joints, broken joints, dislocated shoulders, distorted anatomy, warped stick figure, extra limbs, mutated hands, multiple arms
   ```

### 3.6 Creative Background Environment Specification & Aesthetics (The Anti-Sterile Rule)
Never leave the background as a blank cream void or a generic featureless room. A sterile background makes the frame look flat, cheap, and lifeless (e.g. plain couch against an empty off-white wall). Instead, specify a rich, layered, aesthetically pleasing 2D animated environment (e.g. the "Stick figure slumped on couch" reference):

1. **The 3-Plane Architectural Depth Model**:
   - **Foreground Plane**: Lived-in props and grounded surfaces that establish scale and physical presence (e.g. a low mid-century wooden coffee table sitting on a dark forest-green rug with a ceramic coffee mug, TV remote, and turquoise accessory box; or smooth river stones encircling campfire embers on straw mats).
   - **Midground Plane**: The primary staging feature where the character acts (e.g. a plush teal-green sofa with matching corner throw pillows; or an early human sitting cross-legged on sand beside a crackling hearth).
   - **Background Plane**: Architectural depth and eye-travel pathways that prevent visual claustrophobia (e.g. a soft lavender living room accent wall with an open cased doorway on the right revealing a warm golden-orange glowing hallway; or rolling golden sand dunes under an expansive starry midnight indigo sky; or cavern walls with hanging stalactites and faint prehistoric ochre cave paintings).
2. **Motivated 2D Atmospheric Lighting**:
   - Specify clear, stylized 2D lighting sources that cast distinct pools or cones of illumination:
   - A wooden tripod floor lamp with a yellow conical shade casting a cozy golden cone of light down onto the couch arm and dark hardwood floor.
   - Campfire flame tongues casting a warm circular pool of amber light onto sand, figures, and stone hearth.
   - Hanging terracotta oil lamps casting warm flickering amber sidelight across chiseled Roman plaster walls.
3. **Color Palette & Temperature Harmony**:
   - Balance cool environmental tones with warm accent lighting:
   - *Modern Living Room*: Cool soft lavender wall + rich teal couch + warm golden-yellow lamp cone + dark hardwood planks.
   - *Paleolithic Night*: Deep midnight indigo sky dotted with white stars + warm amber campfire circle + golden sand dunes.
   - *Classical Antiquity*: Weathered limestone masonry + draped deep crimson linen curtains + warm terracotta lamp glow.

### 3.7 Kinetic Action & Proportional Limb Guard (Solving Noodle Arms and Warped Anatomy in Continuation Frames)
When animating stick figures across continuous sequence frames (e.g. Frame 1 slumped on a couch ➔ Frame 2 reaching for a phone on a coffee table), diffusion models frequently generate **grotesque elongated noodle arms, rubber hose limbs, or double elbow joints**.

#### Root Cause Analysis
1. **Isolated Reach Command Without Kinetic Torso Shift**: In Frame 1, the character is slumped against the couch backrest. If Frame 2 simply commands *"stick figure extends arm forward to reach the phone on the coffee table"*, the AI keeps the torso pinned to the couch backrest while forcing the hand onto the table. Because human limbs cannot stretch 2 meters, the model generates an elongated rubber arm with multiple bend joints.
2. **Dangerous Elongation Trigger Words**: Phrasing such as *"extends a long stick arm"*, *"reaches outward"*, or *"reaches a stick arm"* prompts the model to stretch the stroke rather than move the body.
3. **Missing Anatomy Guards in Negative Prompt**: Diffusion priors default to rubber-hose cartoons unless prohibited.

#### The 3-Part Solution
1. **Full-Body Kinetic Physics (Always Shift the Torso & Spine)**:
   Never command a reach or grasp in isolation. Always articulate the movement of the entire body:
   - *Torso & Hips*: *"scoots forward to the front edge of the cushion and leans its upper torso and head forward over its knees toward the coffee table"*
   - *Supporting Arm*: *"left hand braces naturally on its left knee for balance"*
   - *Reaching Arm*: *"right arm reaches forward with a single clean elbow bend, maintaining fixed proportional stick limb lengths"*
2. **Explicit Proportion & Single-Joint Constraints in Every Action Prompt**:
   Mandate joint clarity in the prompt text:
   - `"standard human stick-figure proportions, fixed limb length, single clean elbow bend, zero elongated noodle arms, no rubber stretching, no extra joints"`
### 3.8 Stick-Figure Hands & Close-Up Actions (Preventing Fleshy Human Hands Drift)
When the camera zooms in for a macro or close-up action (e.g. carving a bone with flint, tapping a smartphone, holding a flute), diffusion models tend to drift toward photorealistic, fleshy, 5-fingered human hands with knuckles, fingernails, veins, or hair.

#### Rules for Prompting Hands & Arms:
1. **Explicit 2D Cartoon Stroke Language**:
   - Never say "hands", "weathered hands", or "human hands".
   - Always specify:
     `"minimalist 2D black stick-figure arms ending in simple black cartoon mitten hands with zero realistic knuckles, zero fingernails, zero veins, zero skin texture, zero fleshy human anatomy"`.
2. **Solid Black or Flat Fills**:
   - Stick figure arms must be described as solid black ink strokes. Hands are simple black rounded mittens or small circular grips.
3. **Face & Profile Drift Guard**:
   - When the stick figure interacts closely with props (e.g. blowing breath over carved bone), explicitly maintain:
     `"minimalist circular white head, simple deadpan dot eyes, flat 2D stick figure face, zero realistic skin, zero flesh tones, zero 3D shading"`.

### 3.9 Embedded In-Prompt Negative Headings (`## Negative prompt (Don't use these):`)
Google Flow's interface takes the prompt string directly. Placing negative constraints in a separate JSON field that the UI ignores results in drift. Instead, embed negative instructions **directly at the end of each prompt** under a dedicated heading with 2–3 natural language sentences:

```text
## Negative prompt (Don't use these):
Do not render realistic human hands, fleshy skin, muscular arms, knuckles, fingernails, veins, or anatomical details. Never render 3D CGI models, glossy lighting, photorealism, oil painting textures, dark murky shadows, or extra limbs. Avoid monochrome sketches, borders, and realistic human faces.
```

For artifact and infographic frames, tailor the negative heading:
```text
## Negative prompt (Don't use these):
Do not render museum display pedestals, dark spotlights, glass cases, or realistic human hands and forearms. Avoid 3D CGI models, photorealism, glossy reflections, dark murky shadows, text watermarks, and borders. Never render realistic human anatomy, flesh tones, or monochrome sketches.
```

### 3.10 Light-Themed Aesthetic Standard (Matching Curated Reference Pack)
To maintain the high-clarity, bright, airy visual quality of the curated clean reference library:
1. **Light, Clean Canvas**:
   - Studio, concept, prop, and infographic frames use warm paper cream `#FAF7EE` or pure white `#FFFFFF`.
   - Drafting diagrams (e.g. 24-hour chronometers) use clean bright ivory parchment `#FAF7EE`, light blonde pine rulers, and mint-green accents.
2. **Bright Daylight Environments**:
   - Savannah scenes feature bright clear cyan skies (`#A0D2EB`), light golden sand dunes (`#F5E6C8` / `#EED9B3`), and warm sun-drenched ambient light.
   - Avoid dark muddy brown earth, murky dirt tones, or gloomy shadows.
3. **Warm, Cheerful Firelight**:
   - Campfire and cave scenes feature bright golden-orange flame tongues (`#FFA028`) casting cheerful warm amber light over pale limestone walls and clean sand, set against a clear starry indigo sky.

### 3.11 Infographics & Artifact Cards (The `ref_prop_vulture_bone_flute_clean` Standard)
When displaying archaeological artifacts (flutes, dice, tools, fragments):
1. **Exact Layout Formula**:
   - Canvas: Clean warm cream paper background (`#FAF7EE`).
   - Title: Bold hand-lettered uppercase title centered at top (e.g. `HOHLE FELS BONE FLUTE`, `SWAN BONE FLUTE`, `12 BONE FLUTE FRAGMENTS`).
   - Graphic: Centered horizontal 2D hand-drawn line art of the artifact with flat ivory/cream fills and crisp black ink contours.
   - Annotations: Clean hand-drawn dimension lines or callout brackets (e.g. `22 CM`), drawn in simple black ink line art.
2. **Prohibited Display Elements**:
   - Never describe or render museum pedestals, dark spotlights, wooden plinths, glass display cases, or realistic human arms for scale.
3. **CRITICAL Tag Isolation Rule**:
   - **NEVER attach `@title_reference` to artifact, wildlife, or prop frames!** `@title_reference` contains the safari hat and `1963 — RICHARD LEE`, which diffusion models will literally paste onto the artifact. Use `@ref_prop_vulture_bone_flute` for flute frames and isolate `@title_reference` strictly to actual Richard Lee title cards.

---

## 4. Pipeline Execution & Automatic Retries

- **Per-Frame Retry Mechanism**: In `spec-pipeline.js`, if a frame generation fails or times out, the engine automatically retries up to `max_retries` (default: **3 attempts**).
- **Sequential Guard**: The pipeline halts before advancing to downstream frames if all retries fail. This guarantees that downstream frames (e.g. Frame 4 and Frame 5) will **never execute prematurely or duplicate** when an upstream frame fails.

---

## 5. Timeline Blueprint (`timeline_blueprint.json`)

The `timeline_blueprint.json` controls audio synthesis and FFmpeg video assembly:

```json
{
  "project_name": "how_humans_learned_to_have_fun",
  "video_target_resolution": "1920x1080",
  "total_duration_estimate_seconds": 630.0,
  "timeline": [
    {
      "beat_id": "beat_001",
      "frame_id": "frame_001",
      "visual_filename": "frame_001.png",
      "start_time_seconds": 0.0,
      "end_time_seconds": 1.0,
      "duration_seconds": 1.0,
      "narration_text": "This morning, a machine screamed at you until you woke up.",
      "audio_filename": "narration_beat_001.wav"
    }
  ]
}
```
