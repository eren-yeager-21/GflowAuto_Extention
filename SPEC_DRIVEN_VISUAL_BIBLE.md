# SPEC-DRIVEN VISUAL DIRECTOR BIBLE
## Constructing Consistent 2D Ink Explainer Visuals from Transcripts
*Synthesized from frame-by-frame analysis of "What Did Ancient Humans Actually Do All Day" and the Google Flow Production Pipeline.*

---

## 1. Executive Summary & Core Philosophy

This Visual Bible defines the exact rules, aesthetic grammar, and JSON spec-construction methodology required to translate any historical, anthropological, or comparative script into visually consistent, high-retention 2D animated stick-figure explainers.

### The Golden Rules of the Visual Style:
1. **Never Rely on Text Prompts Alone for Consistency**: Diffusion models drift rapidly across prompts. Character anatomy, map designs, line weights, and layout structures must be anchored to canonical visual reference images (`@women_early_human`, `@male_early_human`, `@archieologiest_stick_figure`, `@expression_stick_figure`, `@narrator_stickfigure`, `@maps_reference`, etc.).
2. **Decouple Base Prompt from Reference Guidance**:
   - `prompt`: Pure description of scene geometry, character actions, emotional state, props, lighting, and camera angle. Zero boilerplate.
   - **Automatic Custom Reference Guidance**: Do NOT include reference instructions or boilerplate in the JSON. The Chrome extension automatically appends custom reference instructions to the prompt at runtime (`## Use provided reference for visual understanding and stick figure anatomy...`).
3. **Vibrant 2D Stylized Animation Art**:
   - Rich saturated color palette across characters, objects, and colored backgrounds.
   - Clean, crisp vector contours and dynamic ambient lighting.
   - 100% full-bleed 16:9 cinematic framing with zero monochrome, zero uncolored canvas, zero 3D CGI shading.

---

## 2. Visual DNA & Aesthetic Standards

### 2.1 Styling & Rendering Engine
- **Aesthetic Style**: 2D hand-drawn animated stick figure explainer style, clean bold black ink outlines, flat color fills.
- **Universal Locked Negative Prompt**:
  ```text
  monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding, abnormally long arms, stretched limbs, elongated noodle arms, rubber hose limbs, elastic limbs, extra elbows, double joints, broken joints, dislocated shoulders, distorted anatomy, warped stick figure, extra limbs, mutated hands, multiple arms
  ```

### 2.2 Color Palette Specifications

| Palette Component | Hex Code | Visual Application & Meaning |
| :--- | :--- | :--- |
| **Paper Canvas** | `#FAF7EE` / `#FFFFFF` | Default negative space for titles, explanations, diagrams, metaphors. |
| **Savannah Sand** | `#EED9B3` / `#E4C795` | Daytime hunter-gatherer terrain, rolling hills, open wilderness. |
| **Campfire Warmth** | `#FFA028` / `#FF5500` | Flame tongues, warm cel-shaded amber rim light on characters and cave rock. |
| **Paleolithic Hide** | `#7A5230` / `#94653D` | Shaggy animal pelt tunics, shoulder wraps, hide tents. |
| **Neolithic Soil** | `#5C4033` / `#3D2817` | Gridded farm furrows, muddy excavation pits, archaeological strata. |
| **Map Pastel Fills** | Cyan `#6BB8D9`, Pink `#F49AC2`, Green `#7BC676`, Orange `#F79438`, Yellow `#FCD241` | Continental fills on maps (`@maps_reference`), regional borders (`@maps_country_reference`). |
| **Alert / Marker Red** | `#E63946` | Teardrop location map pins, red 'X' over modern distractions, alarm bells. |

---

## 3. Canonical Character Archetypes & Anatomy Standards

Every character in the explainer belongs to a defined archetype. In Google Flow, each archetype is anchored to an uploaded reference asset:

```
                  ┌─────────────────────────────────┐
                  │      CORE CHARACTER SUITE       │
                  └─────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      │                            │                            │
▼ Hunter-Gatherers           ▼ Modern & Hosts              ▼ Scholars
- @male_early_human          - @expression_stick_figure   - @archieologiest_stick_figure
- @women_early_human        - @narrator_stickfigure      
```

### 3.1 Hunter-Gatherer Male (`@male_early_human`)
- **Reference Image**: `male_early_human.png`
- **Anatomy**: Perfectly circular white head, dot eyes, simple line mouth, shaggy brown hair mane that flares outward behind head, thin stick limbs.
- **Attire**: Jagged-edge brown animal pelt tunic worn over one shoulder, cinched with a dark leather cord belt at the waist, bare feet.
- **Props**: Chipped flint spear bound with sinew cords, fire-hardened digging stick, carved bone flute.
- **Reference Guidance Rule**:
  > *"Character Anatomy: Use @male_early_human strictly for physical stick-figure traits, circular head structure, shaggy brown hair, one-shoulder animal fur tunic, and line weight. Render scene actions, background, and lighting as specified in the prompt."*

### 3.2 Hunter-Gatherer Female (`@women_early_human`)
- **Reference Image**: `women_early_human.png`
- **Anatomy**: Circular white head, delicate dot eyes, slight curved smile, long wavy brown hair falling past shoulders with a small carved bone hairpin or bead on the left side.
- **Attire**: Brown jagged fur tunic/dress with waist tie, bare feet, optional shell necklace.
- **Props**: Woven gathering pouch, mongongo nuts, wild tuber digging tools.
- **Reference Guidance Rule**:
  > *"Character Anatomy: Use @women_early_human strictly for physical stick-figure traits, long wavy brown hair with bone hairpin, fur dress with cord waist belt, and line weight."*

### 3.3 Expression Host / Skeptical Narrator (`@expression_stick_figure`)
- **Reference Image**: `expression_stick_figure.png`
- **Anatomy**: Perfectly circular pale cream head (`#FFFDD0`), cocked arched eyebrow, knowing smirk/smile, index finger pointing upward in an "aha!" or explanatory posture.
- **Role**: Breaks the fourth wall, presents surprising statistics, addresses viewer misconceptions ("Ancient life was brutal, short, and desperate... or was it?").
- **Reference Guidance Rule**:
  > *"Character Expression: Use @expression_stick_figure strictly for facial smirk, cocked eyebrow, clean circular head, and witty demonstrative gestures."*

### 3.4 Contemplative Narrator (`@narrator_stickfigure`)
- **Reference Image**: `narrator_stickfigure.png`
- **Anatomy**: Clean circular head tilted upward and slightly to the right, thoughtful gaze, open conversational palm gesture.
- **Role**: Posing existential or philosophical questions ("What should I do today?", "How many hours belong to someone else?").
- **Reference Guidance Rule**:
  > *"Narrator Pose: Use @narrator_stickfigure strictly for neutral stick-figure host proportions, upward contemplative head angle, and open hand gesture."*

### 3.5 Field Archaeologist / Historian (`@archieologiest_stick_figure`)
- **Reference Image**: `archieologiest_stick_figure.png`
- **Anatomy**: Minimalist stick figure wearing a wide tan brimmed safari/pith helmet with dark band, brown leather shoulder satchel strap across chest, holding a field notebook and pen.
- **Role**: Depicting Richard Lee (1963 Kalahari expedition), fossil excavations, academic studies, and field notes.
- **Reference Guidance Rule**:
  > *"Character Anatomy: Use @archieologiest_stick_figure strictly for field researcher anatomy, tan safari pith helmet, shoulder strap satchel utility bag, and notebook."*

---

## 4. Environment & Infographic Archetypes

### 4.1 Global World Map (`@maps_reference`)
- **Reference Image**: `maps_reference.png`
- **Visual Style**: Clean hand-drawn black vector continental coastlines on pure white background. Each continent is filled with a distinct flat pastel tint:
  - North America: Cyan Blue (`#6BB8D9`)
  - South America: Pastel Pink (`#F49AC2`)
  - Europe: Soft Yellow (`#FCD241`)
  - Asia: Warm Orange (`#F79438`)
  - Africa: Fresh Leaf Green (`#7BC676`)
  - Australia / Oceania: Tan Khaki (`#D4B28C`)
- **Iconography**: Minimalist red teardrop location pins with clean hand-lettered city/site labels ("Cairo", "SF", "Mumbai", "London", "SITES WORLDWIDE").

### 4.2 Regional Territory Map (`@maps_country_reference`)
- **Reference Image**: `maps_country_reference.png`
- **Visual Style**: Close-up country or regional borders outlined with bold black ink. Distinct pastel fills for each territory. Prominent red map pin marking the focal territory, accompanied by minimal symbols (e.g. small vector evergreen tree, tent, or river line). Hand-lettered uppercase nation names.

### 4.3 Campfire & Hearth Prop (`@fire_reference`)
- **Reference Image**: `fire_reference.png`
- **Visual Style**: Circular ring of rounded grey river stones enclosing stacked logs. Vibrant yellow-orange flame tongues with thin, playful black-ink smoke wisps rising vertically. Bold uppercase hand-lettered text ("FIRE") centered above when used as a chapter or concept intro.

### 4.4 Title Card & Chapter Marker (`@title_reference`)
- **Reference Image**: `title_reference.png`
- **Visual Style**: Minimalist stark white background. A single iconic vector symbol (e.g. safari hat, bone flute, alarm clock) centered directly above clean hand-lettered uppercase date and subject text: `1963 — RICHARD LEE` or `2014 — POLLY WIESSNER`.

---

## 5. Compositional Patterns & Visual Grammar

Analysis of the 231 scene transitions reveals 6 recurring directorial shot types:

```
┌───────────────────────────────┬───────────────────────────────┐
│       1. SPLIT-SCREEN         │      2. JUXTAPOSITION         │
│  "YOU"               "HIM"    │      Spear upright in ground  │
│  Alarm / Office  │ Camp / Sky │   surrounded by red crossed-  │
│  (Vertical dashed black line) │   out modern electronics      │
├───────────────────────────────┼───────────────────────────────┤
│       3. 3-PANEL COMIC        │       4. FULL-BLEED SCENE     │
│ [MUSIC]   │ [GAME]   │[WATCH] │ Hunter cross-legged by night  │
│ Headset   │ Gamepad  │ Screen │ fire in cave; warm orange glow│
│ (Clean black vertical borders)│ against deep charcoal stone   │
├───────────────────────────────┼───────────────────────────────┤
│       5. INFOGRAPHIC CARD     │       6. CHAPTER TITLE CARD   │
│ Bar chart comparing:          │            [Hat Icon]         │
│ Hunter (15 hrs) vs Farmer(40) │       1963 — RICHARD LEE      │
│ Minimalist clean typography   │ (Stark white, hand-lettered)  │
└───────────────────────────────┴───────────────────────────────┘
```

1. **Split-Screen Comparative Dualism** (`@ref_comp_split_screen_dual`):
   - Divides screen exactly at center with a black dashed line.
   - Left: Overworked modern human or struggling farmer.
   - Right: Free hunter-gatherer relaxing by fire or on open savannah.
2. **Visual Metaphor Juxtaposition**:
   - Primitive artifact juxtaposed against modern symbols (e.g. flint spear surrounded by red crossed-out smartphones and laptops).
3. **Multi-Panel Strip Layout**:
   - 2 or 3 clean vertical panels on pure white background, isolating clean icons with hand-lettered labels below.
4. **Cinematic Full-Bleed Atmosphere**:
   - Edge-to-edge environment for immersive moments (night campfire with stars, Pleistocene cave interior with firelight, panoramic sun-drenched savannah).
5. **Data Infographic Cards**:
   - Simple comparison bar charts or pie graphs drawn in ink line art, comparing daily working hours with bold annotations.
6. **Iconic Title Cards**:
   - Uncluttered historical timeline pins with a single prop icon and date.

---

## 6. Spec Construction Methodology: From Transcript to JSON

When turning a script into visual prompts, follow this 4-step pipeline:

```
[Transcript Beat] ──▶ [Identify Core Idea] ──▶ [Select Archetype & Layout] ──▶ [Assemble Spec Object]
```

### Step 1: Script Chunking & Beat Detection
Divide transcript into **micro-animation beats of 0.4 – 3 seconds** (max). The goal is a fast-cut animation feel — each frame should hold for no more than 3 seconds. Very brief action moments (a hand gesture, a cut to an object) can be as short as 0.4 – 0.5 seconds. Never generate one visual for more than 3 seconds of narration. Each beat must present a new visual idea, prop, or camera angle.

### Step 2: Archetype & Reference Tag Selection
Determine whether the beat requires:
- Character tag: `@male_early_human`, `@women_early_human`, `@archieologiest_stick_figure`, `@expression_stick_figure`, or `@narrator_stickfigure`.
- Layout anchor: `@ref_comp_split_screen_dual`, `@ref_env_savannah_wide`, `@ref_env_camp_night_stars`.
- Style anchor: `@maps_reference`, `@maps_country_reference`, `@fire_reference`, `@title_reference`.

> **IMPORTANT — `@` tags must exist as uploaded images in Google Flow's `Images` tab.** The Chrome Extension resolves tags by searching Flow's image library. A tag that has no matching uploaded image is silently ignored. The field `reference_video_sample_frame` (e.g. `"frame_120_05m23s.jpg"`) is **informational annotation only** — it tells the spec author which source video frame inspired this scene, but is never used by the extension or sent to Google Flow.

### Step 3: Scene Continuity Rule
- If the scene is a **brand-new location or concept**, set `"continuity": "anchor"`, `"frame_reference": null`.
- If the scene is a **camera angle cut or continuous action within the same room/camp**, set `"continuity": "continue"`, `"frame_reference": "frame_XXX.png"`.

### Step 3b: Rapid Micro-Animation Pacing (0.5s – 3.0s Max) & Granular Visual Build-Up
Visuals must change rapidly in rhythm with narration:
- **Duration Constraints**: Keep visuals changing every **0.5s, 1s, 2s, or 3s (maximum)**. Never hold a visual for 4+ seconds.
- **Granular Decomposition**: Break compound sentences into sub-beats to build the visual scene progressively as the words are spoken.

**Walkthrough Example**:
> Narration: *"The last time you were bored, you reached for your phone without even deciding to. Music, a game, something to watch."*
- **Sub-beat 1** (1.0s): *"The last time you were bored"* ➔ Visual: A stick figure with an exaggerated bored, vacant expression.
- **Sub-beat 2** (1.5s): *"you reached for your phone without even deciding to."* ➔ Visual: The stick figure reaching their arm instinctively toward a phone on a desk.
- **Sub-beat 3** (1.5s): *"Music, a game, something to watch"* ➔ Visual: Close-up macro shot of the phone screen bursting with colorful app icons for music, games, and videos.

### Step 4: Natural Fluid Prose Prompting (No "Vibrant", Strict 2D Hand-Drawn Explainer Style)
Do **NOT** structure prompts into rigid uppercase keyword blocks like `SUBJECT: ... ACTION: ... COMPOSITION: ... CAMERA: ...`. Google Flow produces superior visual coherence and natural poses when prompted in fluid, cohesive descriptive paragraphs.

**Mandatory Prompt Pattern**:
- Start with: `"2D hand-drawn animated stick figure explainer style. Clean bold black ink outlines, flat color fills, minimalist stick figure with white circular head and simple dot eyes."`
- Body: Dynamic scene action, kinetic full-body movement, props, environmental colors, ambient lighting, and shot perspective in natural prose.
- End with: `"full bleed 16:9, zero gradients, no 3D rendering, no borders."`

**Example Prompt (Frame 002 Continuation)**:
```text
2D hand-drawn animated stick figure explainer style. Clean bold black ink outlines, flat color fills, minimalist stick figure with white circular head and simple dot eyes. Continuous scene in the cozy lavender living room: performing a natural reaching action from the teal couch, the stick figure scoots forward to the front edge of the seat cushion and leans its upper torso and head forward over its knees toward the coffee table. Maintaining standard proportional stick limb lengths and a single clean elbow bend, its right arm reaches forward naturally toward the sleek black smartphone on the coffee table surface beside the ceramic coffee mug, while its left hand braces naturally on its left knee for balance. Realistic kinetic forward body lean, standard human stick-figure proportions, fixed limb length, zero elongated noodle arms, no rubber stretching, no extra joints. Dark wood plank floor, open warm hallway doorway in background, full bleed 16:9, zero gradients, no 3D rendering, no borders.
```

**Universal Locked Negative**:
```text
monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding, abnormally long arms, stretched limbs, elongated noodle arms, rubber hose limbs, elastic limbs, extra elbows, double joints, broken joints, dislocated shoulders, distorted anatomy, warped stick figure, extra limbs, mutated hands, multiple arms
```

### Step 4b: Kinetic Full-Body Action & Proportional Limb Rule (Solving Noodle Arms in Action Frames)
When a stick figure transitions from a seated or idle posture into an action (e.g. reaching for an object, throwing a spear, chiseling a tool):
1. **Never prompt limb reach in isolation**: Prompting an arm reach while the body remains seated forces the AI to stretch the arm 3x normal length, producing grotesque noodle/rubber limbs and extra elbows.
2. **Move the Torso, Spine, and Hips**: Always describe the kinetic motion of the entire body (e.g., scooting forward to the edge of the seat, leaning the torso and head forward over the knees, bracing the off-hand on the knee for support).
3. **Proportional Joint Constraints**: Explicitly include: `"standard human stick-figure proportions, fixed limb length, single clean elbow bend, zero elongated noodle arms, no rubber stretching, no extra joints"`.

### Step 4c: Stick-Figure Hands & In-Prompt Negative Heading (`## Negative prompt (Don't use these):`)
When the camera zooms in for close-up actions (carving bone with flint, tapping phones, holding flutes):
1. **Stick Hands Specification**:
   Prompt: `"minimalist 2D black stick-figure arms ending in simple black cartoon mitten hands with zero realistic knuckles, zero fingernails, zero veins, zero skin texture, zero fleshy human anatomy"`.
2. **Embedded In-Prompt Negative Directive**:
   Place directly at the end of each prompt:
   ```text
   ## Negative prompt (Don't use these):
   Do not render realistic human hands, fleshy skin, muscular arms, knuckles, fingernails, veins, or anatomical details. Never render 3D CGI models, glossy lighting, photorealism, oil painting textures, dark murky shadows, or extra limbs. Avoid monochrome sketches, borders, and realistic human faces.
   ```

### Step 4d: Infographics & Artifact Cards (The `ref_prop_vulture_bone_flute_clean` Standard)
For historical artifacts and tools:
1. **Clean Paper Canvas**: Warm paper cream `#FAF7EE` or pure white `#FFFFFF`.
2. **Centered Uppercase Title**: Bold hand-lettered title centered at top (`HOHLE FELS BONE FLUTE`).
3. **Centered 2D Illustration**: Horizontal 2D ink line art artifact with flat ivory fill.
4. **No Museum Furniture**: Prohibit pedestals, dark spotlights, glass display cases, and realistic human arms for scale.
5. **CRITICAL Tag Rule**: **NEVER attach `@title_reference` to artifact frames.** Use `@ref_prop_vulture_bone_flute`. `@title_reference` contains "1963 — RICHARD LEE" and the safari hat, which will be printed on the artifact.


### Step 5: `reference_statement` — Tell the Model What Each Reference Is For
Add a `reference_statement` field to each frame. This is a `##` heading directive string that tells the model **exactly what to extract from each reference**. When set, it replaces the extension's auto-generated guidance.

**Always include `reference_statement` when the frame uses non-character references** (maps, environment anchors, title cards, previous frames with continuity). For pure character-only frames, you may omit it and rely on auto-guidance.

Quick reference by type:

| Reference Type | What to say in `reference_statement` |
| :--- | :--- |
| `@male_early_human` / `@women_early_human` | "...strictly for stick figure anatomy, limb proportions, and line weight. Do not derive scene, background, or lighting from the reference." |
| `@maps_reference` | "...strictly for flat pastel continent fills, bold black ink coastline style, and red teardrop pin iconography only." |
| `@maps_country_reference` | "...for regional border style, territory pastel fills, and hand-lettered label typography only." |
| `@fire_reference` | "...for campfire stone ring arrangement, flame tongue shapes, and smoke wisp style only." |
| `@title_reference` | "...for typography style, icon symbol placement, and stark white background layout only." |
| `@ref_env_*` / environment anchors | "...for [specific background element] only. Do not derive character anatomy from this reference." |
| `frame_reference` (prev frame) | "...for scene layout, camera angle, background environment, and lighting continuity only. Character pose and action are specified in this prompt." |

> **IMPORTANT — No `reference_instructions` parameter**: Do NOT include `reference_instructions` or `formatted_reference_guidance` in your spec JSON. The Chrome Extension Side Panel automatically appends the reference guidance at generation time.


---

## 7. Canonical Examples from the Source Video

> **Note on `reference_video_sample_frame`**: This field (e.g. `"frame_001_00m01s.jpg"`) is **informational annotation only**. It records which extracted source video frame inspired the scene for the spec author's reference. It is never sent to Google Flow or processed by the extension. The actual Flow references are the `@` tags in `character_references` and the filename in `frame_reference`.

---

### Example 1: Modern Alarm Dread (Beat 00:00 - 00:02)
**Transcript**: *"This morning, a machine screamed at you until you woke up."*

```json
{
  "id": "frame_001",
  "frame_number": 1,
  "timestamp_start": "00:00",
  "timestamp_end": "00:02",
  "matched_trope": "Modern Alarm Awakening & Morning Routine",
  "reference_video_sample_frame": "frame_001_00m01s.jpg",
  "prompt": "STYLE: Minimalist black ink line art, flat color fills, bold vector outlines, full-bleed 16:9, zero gradients, no borders.\n\nSUBJECT: A sleek modern smartphone lying flat on a wooden nightstand.\n\nACTION: The phone is vibrating furiously, screen lit with a glowing 06:00 alarm display and bold radiating black ink sound-wave zigzags pulsing outward.\n\nCOMPOSITION: Close-up centered shot. Phone fills the lower half of the frame. Zigzag sound waves radiate to the edges.\n\nCAMERA: Slightly elevated top-down static shot.\n\nLIGHTING: High contrast, cold blue-white screen glow against warm cream background (#FAF7EE).\n\nENVIRONMENT: Simple wooden nightstand surface, warm cream background, no other objects.\n\nCONSTRAINTS: Do not introduce photorealism, 3D rendering, anime styling, additional characters, or unrelated visual elements.",
  "negative": "photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding",
  "character_references": [
    "@narrator_stickfigure"
  ],
  "frame_reference": null,
  "continuity": "anchor",
  "target_filename": "frame_001.png"
}
```

---

### Example 2: Ancient Man Freedom (Beat 00:15 - 00:18)
**Transcript**: *"A man wakes up in the morning light with no alarm, no schedule."*

```json
{
  "id": "frame_009",
  "frame_number": 9,
  "timestamp_start": "00:15",
  "timestamp_end": "00:18",
  "matched_trope": "Dawn Savannah Awakening & Campfire Serenity",
  "reference_video_sample_frame": "frame_009_00m15s.jpg",
  "prompt": "STYLE: Minimalist black ink line art, flat color fills, bold vector outlines, full-bleed 16:9, zero gradients, no borders.\n\nSUBJECT: A hunter-gatherer stick figure on a dry golden straw bedroll beside a crackling campfire.\n\nACTION: Slowly stretching both arms wide out to the sides, face tilted upward to meet the dawn light, completely relaxed.\n\nCOMPOSITION: Wide shot. Figure is centered-left. Campfire enclosed by smooth river stones sits to the right. A chipped flint spear leans against a large grey boulder in the far right background.\n\nCAMERA: Eye-level static wide shot.\n\nLIGHTING: Soft warm dawn light (#FFF0CC) washing in from the upper-left, campfire amber glow (#FFA028) from the right.\n\nENVIRONMENT: Open savannah, warm sandy gold palette (#EED9B3), clear pastel sky, distant flat horizon.\n\nCONSTRAINTS: Do not introduce photorealism, 3D rendering, anime styling, additional characters, or unrelated visual elements.",
  "negative": "photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding",
  "character_references": [
    "@male_early_human",
    "@fire_reference"
  ],
  "frame_reference": null,
  "continuity": "anchor",
  "target_filename": "frame_009.png"
}
```

---

### Example 3: Global Archaeological Evidence Map (Beat 01:05 - 01:08)
**Transcript**: *"Anthropologists compiled site records from dozens of hunter-gatherer communities worldwide."*

```json
{
  "id": "frame_022",
  "frame_number": 22,
  "timestamp_start": "01:05",
  "timestamp_end": "01:08",
  "matched_trope": "Global Academic Mapping & Multi-Site Evidence",
  "reference_video_sample_frame": "frame_045_01m45s.jpg",
  "prompt": "STYLE: Minimalist hand-drawn black ink vector map, flat pastel continent fills, bold clean coastlines, full-bleed 16:9, zero gradients.\n\nSUBJECT: A clean hand-drawn world map infographic.\n\nACTION: Red teardrop location marker pins appear at multiple archaeological study sites across all continents.\n\nCOMPOSITION: Full-bleed wide shot. Map fills the entire frame edge to edge. Bold uppercase hand-lettered title 'SITES WORLDWIDE' anchored at the top-center.\n\nCAMERA: Flat frontal static shot, perfectly orthographic.\n\nLIGHTING: Neutral, flat, even — crisp white background with no shadow or depth.\n\nENVIRONMENT: Pure white background. Continents: cyan North America, pastel pink South America, soft yellow Europe, warm orange Asia, leaf green Africa, tan Australia. Black text callouts beside each pin.\n\nCONSTRAINTS: Do not introduce photorealism, 3D rendering, anime styling, satellite imagery, topography, or unrelated visual elements.",
  "negative": "photorealistic, 3D render, CGI, satellite map, topography, glossy, gradients, dark muddy lighting, realistic terrain, blurry",
  "character_references": [
    "@maps_reference"
  ],
  "frame_reference": null,
  "continuity": "anchor",
  "target_filename": "frame_022.png"
}
```

---

### Example 4: Field Researcher Kalahari Title Card (Beat 02:40 - 02:42)
**Transcript**: *"In 1963, an anthropologist named Richard Lee walked into the Dobe region of the Kalahari Desert."*

```json
{
  "id": "frame_016",
  "frame_number": 16,
  "timestamp_start": "02:40",
  "timestamp_end": "02:42",
  "matched_trope": "Historical Field Study Timestamp Card",
  "reference_video_sample_frame": "frame_016_00m28s.jpg",
  "prompt": "STYLE: Minimalist black ink line art on stark white background, clean hand-lettered typography, zero gradients, full-bleed 16:9.\n\nSUBJECT: A stylized tan safari pith helmet with a dark brown leather band, centered on the frame.\n\nACTION: Static — the hat is presented as a symbolic icon above the date text.\n\nCOMPOSITION: Centered minimalist layout. Hat icon in the upper-center, bold uppercase hand-lettered text '1963 — RICHARD LEE' directly below. Generous negative space on all sides.\n\nCAMERA: Flat frontal static shot.\n\nLIGHTING: Flat even light, high contrast black on white.\n\nENVIRONMENT: Pure stark white background, no other elements.\n\nCONSTRAINTS: Do not introduce photorealism, 3D rendering, anime styling, additional characters, ornate fonts, or unrelated visual elements.",
  "negative": "photorealistic, 3D render, CGI, glossy, ornate serif font, realistic hat, textures, dark muddy lighting, blurry",
  "character_references": [
    "@title_reference"
  ],
  "frame_reference": null,
  "continuity": "anchor",
  "target_filename": "frame_016.png"
}
```

---

### Example 5: Richard Lee Tracking Foragers (Beat 02:42 - 02:45)
**Transcript**: *"He carried notebooks and a stopwatch to record every single minute of their daily routine."*

```json
{
  "id": "frame_017",
  "frame_number": 17,
  "timestamp_start": "02:42",
  "timestamp_end": "02:45",
  "matched_trope": "Academic Field Observation & Empirical Tracking",
  "reference_video_sample_frame": "frame_088_03m42s.jpg",
  "prompt": "STYLE: Minimalist black ink line art, flat color fills, bold vector outlines, full-bleed 16:9, zero gradients, no borders.\n\nSUBJECT: A field researcher stick figure crossing the open Kalahari desert sand.\n\nACTION: Walking steadily toward the right of the frame, head bowed slightly, pen moving across a small open spiral notebook held in both hands.\n\nCOMPOSITION: Medium-wide shot. Figure positioned in the left-center third. Wide open desert fills the rest of the frame behind them.\n\nCAMERA: Eye-level static side shot.\n\nLIGHTING: Warm afternoon sunlight from the upper right, casting a short shadow to the left. Pale gold ambient fill.\n\nENVIRONMENT: Flat pale sand terrain (#EED9B3), clear sky, no structures or vegetation.\n\nCONSTRAINTS: Do not introduce photorealism, 3D rendering, anime styling, additional characters, or unrelated visual elements.",
  "negative": "photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models",
  "character_references": [
    "@archieologiest_stick_figure"
  ],
  "frame_reference": null,
  "continuity": "anchor",
  "target_filename": "frame_017.png"
}
```




## 8. Strict Frame Naming Conventions & Downstream References

To guarantee seamless automated downloads, asset pairing, and video assembly, all frame IDs, filenames, and references MUST adhere to strict naming standards:

### 8.1 Zero-Padded 3-Digit Naming Standard
- **Frame ID (`id`)**: Strictly `frame_001`, `frame_002`, `frame_003`, ..., `frame_NNN` (always 3 digits, zero-padded, lowercase).
- **Frame Number (`frame_number`)**: Integer matching the ID (`1`, `2`, `3`, ..., `N`).
- **Target Filename (`target_filename`)**: Strictly `frame_001.png`, `frame_002.png`, ..., `frame_NNN.png` (matching `id` + `.png`).

### 8.2 Downstream Frame Referencing
When an animation beat continues the action or camera shot of an earlier frame:
- **`continuity`**: Set to `"continue"`.
- **`frame_reference`**: Must specify the referenced frame's filename or ID:
  - `"frame_001.png"` or `"frame_001"`
- The Chrome Extension automatically resolves this reference, fetches the generated image, and passes it into Google Flow's reference image slot with scene continuity directives.

---

## 9. Timeline Blueprint Specification (`timeline_blueprint.json`)

Along with the Storyboard Spec (`storyboard_spec.json`), every production project requires a companion `timeline_blueprint.json`. This blueprint serves as the single source of truth for:
1. **Audio Narration Synthesis**: Used by `tts_qwen3_engine.py` to batch-synthesize voiceover lines per beat.
2. **Timeline Manifest Compilation**: Used by `assemble_timeline.py` to calculate exact frame hold durations and crossfades.
3. **FFmpeg Video Assembly**: Used by `render_timeline.py` to combine visual frames, synthesized audio WAVs, and watermarks into the final `.mp4`.

### 9.1 Schema Definition

```json
{
  "project_name": "how_humans_learned_to_have_fun",
  "target_fps": 30,
  "resolution": [1920, 1080],
  "estimated_duration_sec": 120.0,
  "total_beats": 30,
  "total_frames": 30,
  "beats": [
    {
      "beat_id": "beat_001",
      "frame_id": "frame_001",
      "frame_file": "frame_001.png",
      "audio_file": "audio_001.wav",
      "timestamp_start": "00:00",
      "timestamp_end": "00:02",
      "start_time": 0.0,
      "end_time": 2.0,
      "duration": 2.0,
      "verbatim_text": "This morning, a machine screamed at you until you woke up.",
      "transition_type": "cut",
      "transition_duration": 0.0
    },
    {
      "beat_id": "beat_002",
      "frame_id": "frame_002",
      "frame_file": "frame_002.png",
      "audio_file": "audio_002.wav",
      "timestamp_start": "00:02",
      "timestamp_end": "00:06",
      "start_time": 2.0,
      "end_time": 6.0,
      "duration": 4.0,
      "verbatim_text": "You silenced it, checked notifications, and traded leisure for a schedule.",
      "transition_type": "crossfade",
      "transition_duration": 0.3
    }
  ]
}
```

### 9.2 Field Dictionary

| Field | Type | Description |
| :--- | :--- | :--- |
| `beat_id` | `string` | Unique beat identifier (`beat_001`, `beat_002`). |
| `frame_id` | `string` | Links directly to `id` in storyboard spec (`frame_001`). |
| `frame_file` | `string` | Downloaded image file name (`frame_001.png`). |
| `audio_file` | `string` | Synthesized voiceover file name (`audio_001.wav`). |
| `timestamp_start` / `_end` | `string` | Human-readable `MM:SS` timestamp. |
| `start_time` / `end_time` | `float` | Exact timeline offset in seconds. |
| `duration` | `float` | Duration in seconds (`end_time - start_time`). |
| `verbatim_text` | `string` | Narration text passed to Qwen3-TTS engine. |
| `transition_type` | `string` | Transition into this beat: `"cut"` or `"crossfade"`. |
| `transition_duration` | `float` | Crossfade duration in seconds (typically `0.2` - `0.4`s). |

---

## 10. Summary Checklist for Any New Video Spec

When generating visuals for a new script:

- [ ] **Extract Transcript Timestamps**: Break into **micro-animation beats of 0.4 – 3 seconds**. Never hold a single frame longer than 3 seconds.
- [ ] **Follow 3-Digit Naming Convention**: `id`: `frame_001`, `target_filename`: `frame_001.png`.
- [ ] **Select Primary Character Tag**: `@male_early_human`, `@women_early_human`, `@archieologiest_stick_figure`, `@expression_stick_figure`, or `@narrator_stickfigure`. **Tags must be uploaded to Google Flow's `Images` tab.**
- [ ] **Select Style / Prop Anchor**: `@maps_reference` (world maps), `@maps_country_reference` (regional borders), `@fire_reference` (campfires), `@title_reference` (chapter dates).
- [ ] **Write Structured Prompt** (STYLE / SUBJECT / ACTION / COMPOSITION / CAMERA / LIGHTING / ENVIRONMENT / CONSTRAINTS): Focus on the visual scene; **never describe character physical traits when a `@reference` is attached**.
- [ ] **Add `reference_statement`**: Tell the model exactly what each reference is for. Use `##` directives (e.g. `"## Use @maps_reference for coastline style only"`). Required for map, infographic, environment, and continuity frames. May omit for pure character-only frames.
- [ ] **`reference_video_sample_frame` is informational only**: It notes which source video frame inspired the scene. It is never sent to Google Flow.
- [ ] **DO NOT add `reference_instructions` or `formatted_reference_guidance`**: The Chrome Extension automatically appends custom reference instructions (`## Use provided reference for visual understanding and stick figure anatomy...`) based on attached tags.
- [ ] **Generate Timeline Blueprint (`timeline_blueprint.json`)**: Build the matching timing and narration blueprint for audio synthesis and FFmpeg assembly.
- [ ] **Execute via Chrome Extension**: Load spec into the **Spec Pipeline** tab in Google Flow to run character creation and frame generation.
