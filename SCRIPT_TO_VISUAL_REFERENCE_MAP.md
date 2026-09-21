# SCRIPT-TO-VISUAL REFERENCE BIBLE
## Direct Script-to-Frame Mapping, Pattern Catalog, and Visual Director Decision Engine
*Derived from the complete 231-frame visual breakdown of "What Did Ancient Humans Actually Do All Day"*

---

## 1. How This System Works

When you have a script for a new video (whether it is about prehistoric humans, medieval times, or modern society), you do not guess the visual style. Instead, you follow the **Script-to-Visual Decision Matrix**:

```
[Script Line] ──▶ [Identify Narrative Trope] ──▶ [Match Reference Frame] ──▶ [Generate Decoupled Spec]
```

1. **Granular Narration Decomposition (0.5s – 3.0s Max Pacing)**: Never hold a visual across a long sentence. Break every narration sentence into micro-beats of **0.5s, 1s, 2s, or 3s (maximum)** to build up the visual story dynamically as words are spoken.
2. **Identify the Core Narrative Trope**: Determine whether the script beat is about *Modern Anxiety*, *Ancient Freedom*, *Skepticism*, *Data / Comparison*, *Mapping*, *Hunting/Action*, *Gathering/Domestic*, *Night Socializing*, or *Historical Citation*.
3. **Find the Nearest Canonical Frame in the Reference Video**: Look up how the reference video framed, lit, and paced that exact concept.
4. **Vibrant 2D Fluid Paragraph Prompts (No SUBJECT/ACTION blocks)**: Write prompts in rich, descriptive narrative prose: `"Vibrant 2D stylized digital animation art in rich saturated color. [Scene action, props, lighting, environment, camera]. Rich color palette, crisp stylized contours, full bleed 16:9."`
5. **Attach Verified Google Flow References (≥ 1 tag required)**: Every frame must attach at least one `@` reference tag from Section 2. The Chrome extension automatically injects custom reference guidance (`## Use provided reference for visual understanding and stick figure anatomy...`) so Google Flow never drifts.

---

## 2. Complete Reference Tag Directory (All Google Flow Assets)

Use these tags in `character_references` when building scene specs. Pick the most specific tag available — it gives Google Flow better anatomy and style anchors than the generic base tags alone.

### Characters — Modern
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@narrator_stickfigure` | `narrator_stickfigure.png` | Neutral narrator, philosophical queries, open gestures |
| `@expression_stick_figure` | `expression_stick_figure.png` | Knowing smirk, eyebrow raise, fourth-wall breaks, skepticism |
| `@ref_char_modern_bedroom_waking` | `ref_char_modern_bedroom_waking_clean.png` | Modern human waking, reaching for alarm, bed + nightstand |
| `@ref_char_modern_insomnia_bed` | `ref_char_modern_insomnia_bed_clean.png` | 2 AM bolt-upright anxiety, digital clock glow, nighttime dread |
| `@ref_char_modern_office_desk` | `ref_char_modern_office_desk_clean.png` | Office desk, laptop, calendar, corporate exhaustion |

### Characters — Ancient Hunter-Gatherer
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@male_early_human` | `male_early_human.png` | Generic Paleolithic male anatomy baseline |
| `@women_early_human` | `women_early_human.png` | Generic Paleolithic female anatomy baseline |
| `@ref_char_hunter_neutral` | `ref_char_hunter_neutral_clean.png` | Hunter standing proud with spear — master anatomy reference |
| `@ref_char_hunter_waking_dawn` | `ref_char_hunter_waking_dawn_clean.png` | Hunter waking on straw bed, stretching, morning joy |
| `@ref_char_hunter_tracking_sand` | `ref_char_hunter_tracking_sand_clean.png` | Walking / tracking footprints, spear carry angle, endurance pace |
| `@ref_char_hunter_carrying_game` | `ref_char_hunter_carrying_game_clean.png` | Triumphant return, prey across shoulders, sweat beads |

### Characters — Farmers & Specialists
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@ref_char_farmer_standing_hut` | `ref_char_farmer_standing_hut_clean.png` | Farmer with hoe at thatched hut, grain pot, crop field |
| `@ref_char_farmer_hunched_weeding` | `ref_char_farmer_hunched_weeding_clean.png` | Stooped back, grimace, hoe, furrow rows — agricultural toil |
| `@ref_char_farmer_quern_grinding` | `ref_char_farmer_quern_grinding_clean.png` | Indoor milling, quern stone, dim hut lighting, repetitive work |
| `@ref_char_anthropologist_field` | `ref_char_anthropologist_field_clean.png` | Safari hat, stopwatch, notebook, following hunter — field research |
| `@archieologiest_stick_figure` | `archieologiest_stick_figure.png` | Archaeologist excavating, brushing bones, trench work |

### Characters — Tribal & Community
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@ref_char_tribal_campfire_circle` | `ref_char_tribal_campfire_circle_clean.png` | Group seated around fire, communal meal, conversation |
| `@ref_char_tribal_social_grooming` | `ref_char_tribal_social_grooming_clean.png` | Two figures grooming each other, intimate companionship |
| `@ref_char_tribal_solidarity_circle` | `ref_char_tribal_solidarity_circle_clean.png` | Circle holding hands — "THE SAFETY NET" mutual aid concept |
| `@ref_char_urban_specialists` | `ref_char_urban_specialists_clean.png` | Potter, weaver, toolmaker — division of labor, early urbanism |

### Environments
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@ref_env_savannah_wide` | `ref_env_savannah_wide_clean.png` | Master outdoor palette — golden grassland, blue sky, horizon line |
| `@ref_env_camp_night_stars` | `ref_env_camp_night_stars_clean.png` | Night scenes — indigo sky, star dots, campfire illumination circle |
| `@ref_env_agricultural_furrows` | `ref_env_agricultural_furrows_clean.png` | Converging crop rows, tilled earth, "PROGRESS?" context |
| `@ref_env_prehistoric_cave` | `ref_env_prehistoric_cave_clean.png` | Cave interior, rock paintings, stone hearth, cavern lighting |

### Props & Objects
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@fire_reference` | `fire_reference.png` | Campfire stone ring, flame tongues, smoke wisps, hearth |
| `@ref_prop_flint_spear` | `ref_prop_flint_spear_clean.png` | Stone-tipped spear close-up, sinew wrapping, chipped flint |
| `@ref_prop_screaming_alarm_clock` | `ref_prop_screaming_alarm_clock_clean.png` | Red double-bell alarm at 6 AM, vibrating sound lines |
| `@ref_prop_vulture_bone_flute` | `ref_prop_vulture_bone_flute_clean.png` | Bone flute artifact, 5 finger holes, prehistoric music props |

### Maps & Infographics
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@maps_reference` | `maps_reference.png` | Global / world maps, continent outlines, red site pins |
| `@maps_country_reference` | `maps_country_reference.png` | Regional / national maps, territory borders, migration paths |

### Composition & Titles
| Tag | File | Use When |
| :--- | :--- | :--- |
| `@ref_comp_split_screen_dual` | `ref_comp_split_screen_dual_clean.png` | YOU vs HIM vertical split, modern vs ancient contrast |
| `@title_reference` | `title_reference.png` | Chapter cards, historical dates, researcher intro title cards |

---

## 3. The 12 Canonical Narrative Tropes (The Visual Director's Playbook)

Below are the 12 core visual formulas used throughout the reference video. Whenever you write or encounter a script line, map it to one of these 12 tropes.

---

### Trope 1: Modern Grind, Time Pressure & Alarm Anxiety
- **Script Keywords / Triggers**: *alarm, morning, schedule, hurry, deadline, hours belong to someone else, commute, office, rat race, exhausted*.
- **Directorial Technique**:
  - Close-up of vibrating alarm / smartphone with radiating black zigzags.
  - Frantic stickman sprinting with briefcase against stark white background.
  - Stickman hunched at office desk under a looming wall clock or giant stack of papers.
- **Canonical Video Frames**:
  - `frame_001_00m00s.jpg`: Vibrating double-bell alarm clock screaming at 6:00 AM.
  - `frame_002_00m02s.jpg`: Exhausted stickman reaching out from messy bed sheets.
  - `frame_004_00m06s.jpg`: Stickman sprinting frantically with speed lines and briefcase.
  - `frame_005_00m08s.jpg`: Stickman trapped at office desk beneath looming wall clock.
- **Reference Anchor**: `@narrator_stickfigure` + `@ref_char_modern_bedroom_waking` + `@ref_char_modern_insomnia_bed` + `@ref_char_modern_office_desk` + `@ref_prop_screaming_alarm_clock`
- **Color Palette**: Neutral office grey, muted cream `#FAF7EE`, vibrant warning red `#E63946` for alarms.

---

### Trope 2: Ancient Freedom, Natural Sunrise & Leisure Awakening
- **Script Keywords / Triggers**: *no alarm, no schedule, free, dawn light, waking up, campfire, stretches, what should I do today, relaxed, peaceful*.
- **Directorial Technique**:
  - Full-bleed wide shot of expansive golden savannah under pastel dawn sky.
  - Paleolithic hunter waking on dry straw bedding beside smooth river boulder and crackling fire.
  - Hunter joyfully raising and stretching arms into morning light; lean chipped spear resting nearby.
- **Canonical Video Frames**:
  - `frame_009_00m15s.jpg`: Hunter waking on straw bed beside campfire boulders at dawn.
  - `frame_010_00m16s.jpg`: Hunter relaxing with hands behind head gazing at sunrise.
  - `frame_013_00m22s.jpg`: Hunter joyfully raising arms beside campfire in complete tranquility.
  - `frame_069_02m39s.jpg`: Hunter stretching peacefully in front of open desert horizon.
- **Reference Anchor**: `@male_early_human` + `@fire_reference` + `@ref_env_savannah_wide` + `@ref_char_hunter_waking_dawn`
- **Color Palette**: Savannah Sand `#EED9B3`, Campfire Amber `#FFA028`, Soft Morning Peach Sky.

---

### Trope 3: Challenging Viewer Misconceptions & Witty Commentary
- **Script Keywords / Triggers**: *brutal, short, desperate, that's what everyone believes, but is it true?, your brain is fighting this, common myth, rethink*.
- **Directorial Technique**:
  - Center-frame stickman with knowing smirk, arched eyebrow, index finger pointing upward ("aha!").
  - Stack of dusty leather-bound antique history textbooks with dust puffs blowing off pages.
  - Clean anatomical stick-figure human skeleton with question boxes floating overhead.
- **Canonical Video Frames**:
  - `frame_019_00m34s.jpg`: Stack of antique textbooks with open pages emitting dust puffs.
  - `frame_020_00m35s.jpg`: Title card 'THE OFFICIAL STORY' with quill pen and open textbook icon.
  - `frame_023_00m44s.jpg`: Smug stickman avatar with raised eyebrow and pointing index finger.
  - `frame_067_02m30s.jpg`: Clean skeleton with question boxes indicating bones cannot reveal daily joy.
- **Reference Anchor**: `@expression_stick_figure`
- **Color Palette**: Pure white background `#FFFFFF`, black ink linework, subtle parchment yellow.

---

### Trope 4: Comparative Split-Screen ("YOU vs HIM" / "MODERN vs ANCIENT")
- **Script Keywords / Triggers**: *contrast, compared to, modern human vs hunter, then vs now, 40 hours vs 15 hours, chained vs free*.
- **Directorial Technique**:
  - 16:9 frame split down the middle by a clean vertical dashed black line.
  - **Left Side**: Overworked, stressed modern figure (under fluorescent lights, paperwork, alarm).
  - **Right Side**: Peaceful ancient figure (under open sky, glowing campfire, savannah grass).
  - Clean hand-lettered bold labels at the top: `YOU` vs `HIM`, or `NOW` vs `THEN`.
- **Canonical Video Frames**:
  - `frame_014_00m25s.jpg`: Split screen: Modern human chained to clock vs Hunter gazing at open horizon.
  - `frame_030_00m58s.jpg`: Split screen: 'YOU' with giant wall clock vs 'HIM' hands behind head by fire.
  - `frame_044_01m29s.jpg`: Split screen: Modern office burnout vs Paleolithic hunter relaxing in grass.
- **Reference Anchor**: `@ref_comp_split_screen_dual` + `@male_early_human` + `@narrator_stickfigure`
- **Color Palette**: Muted blue-grey on the left; warm amber-gold on the right.

---

### Trope 5: Historical Timeline, Academic Citation & Title Cards
- **Script Keywords / Triggers**: *in 1963, Richard Lee, anthropologist, study, published, expedition, records, history, compiled*.
- **Directorial Technique**:
  - Minimalist stark white background.
  - A single stylized icon centered directly above bold hand-lettered uppercase text:
    `[Safari Hat Icon] ── 1963 — RICHARD LEE`
    `[Campfire Icon] ── 2014 — POLLY WIESSNER`
  - Field researcher wearing safari pith helmet and satchel bag walking in desert with notebook.
- **Canonical Video Frames**:
  - `frame_016_00m28s.jpg`: Title card '1963 — RICHARD LEE' with safari hat icon.
  - `frame_017_00m30s.jpg`: Field researcher in safari helmet walking in desert sand writing in notebook.
  - `frame_022_00m41s.jpg`: Archaeologist in safari helmet kneeling in trench brushing fossilized skeleton.
  - `frame_149_06m59s.jpg`: Title card '2014 — POLLY WIESSNER' with orange campfire icon.
- **Reference Anchor**: `@title_reference` + `@archieologiest_stick_figure` + `@ref_char_anthropologist_field`
- **Color Palette**: Pure white background `#FFFFFF`, khaki tan `#C89C62`, charcoal ink `#1A1A1A`.

---

### Trope 6: Global & Continental Archaeological Maps
- **Script Keywords / Triggers**: *worldwide, across continents, site records, global, Africa, Middle East, Europe, America, Asia*.
- **Directorial Technique**:
  - Minimalist world map with clean black continental outlines.
  - Continents filled with distinct flat pastel colors (cyan, pink, yellow, orange, green, tan).
  - Red teardrop location marker pins marking study sites with hand-lettered city labels.
  - Hand-lettered bold header: `'SITES WORLDWIDE'`.
- **Canonical Video Frames**:
  - `frame_022_00m41s.jpg` / `maps_reference.png`: World map with colored continents and red site pins.
  - `frame_034_01m05s.jpg`: Middle East map highlighting Turkey, Syria, Iraq, Iran, Egypt.
  - `frame_074_02m54s.jpg`: Map of Southern Africa highlighting Botswana and the Kalahari Basin.
- **Reference Anchor**: `@maps_reference`
- **Color Palette**: Cyan `#6BB8D9`, Pink `#F49AC2`, Green `#7BC676`, Orange `#F79438`, Yellow `#FCD241`, Red `#E63946`.

---

### Trope 7: Regional Country Maps & Territorial Borders
- **Script Keywords / Triggers**: *in this region, specific valley, country border, Botswana, Kalahari, territory, river basin*.
- **Directorial Technique**:
  - Regional close-up map with bold hand-drawn borders.
  - Solid pastel fills for neighboring countries with bold hand-lettered labels.
  - Prominent red location marker pin accompanied by simple vector landmark icon (tree, campfire, mountain).
- **Canonical Video Frames**:
  - `maps_country_reference.png`: South America map (Brazil, Paraguay, Argentina) with tree icon and pin.
  - `frame_075_02m58s.jpg`: Kalahari Desert regional map with dotted hunter migration paths.
- **Reference Anchor**: `@maps_country_reference`
- **Color Palette**: Fresh Green, Canary Yellow, Soft Pink, Warm Orange, Alert Red pin.

---

### Trope 8: Male Subsistence: Tracking, Endurance & Hunting
- **Script Keywords / Triggers**: *hunting, tracking, spear, spoor, footprints, animal hide, stalking, carrying meat, prey, endurance*.
- **Directorial Technique**:
  - Hunter walking steadily across desert sand following animal footprints.
  - Hunter carrying spear at ready angle; calm facial expression (endurance hunting, not frantic panic).
  - Hunter carrying hunted prey across shoulders back to camp with small sweat beads.
- **Canonical Video Frames**:
  - `frame_086_03m36s.jpg`: Hunter tracking footprints across sand dunes.
  - `frame_087_03m39s.jpg`: Triumphant hunter carrying antelope across shoulders back to camp.
  - `frame_082_03m18s.jpg`: Hunter calmly watching antelope sprint away in dust cloud.
  - `frame_011_00m18s.jpg`: Hunter standing peacefully with upright spear on golden savannah.
- **Reference Anchor**: `@male_early_human` + `@ref_prop_flint_spear` + `@ref_char_hunter_neutral` + `@ref_char_hunter_tracking_sand` + `@ref_char_hunter_carrying_game`
- **Color Palette**: Sandy dune tones `#EED9B3`, brown fur pelt `#7A5230`, soft horizon sky.

---

### Trope 9: Female Subsistence: Foraging, Gathering & Abundance
- **Script Keywords / Triggers**: *gathering, women, nuts, mongongo, tubers, berries, reliable calories, children, abundance*.
- **Directorial Technique**:
  - Female stick figure with wavy hair and bone hair ornament walking across landscape with collection bag.
  - Two women kneeling beneath a lush mongongo tree happily filling woven baskets with nuts.
  - Smiling woman showing shell necklace or woven crafts to companion.
- **Canonical Video Frames**:
  - `frame_001.png` (ancient_humans_pleasure): Female gatherer walking across sunlit desert ridge.
  - `frame_214_10m19s.jpg`: Smiling women in afternoon wearing shell necklace and grooming hair.
  - `frame_123_05m30s.jpg`: Strung prehistoric seashell necklace labeled 'SHELL NECKLACE'.
- **Reference Anchor**: `@women_early_human`
- **Color Palette**: Warm terracotta, leaf green, pale bone ivory `#FFFFF0`, rich earth brown.

---

### Trope 10: Quantitative Data, Time Audits & Working Hours Comparison
- **Script Keywords / Triggers**: *15 hours a week, 40 hours, data showed, measured, clock, percentage, pie chart, bar graph*.
- **Directorial Technique**:
  - Clean hand-drawn minimalist comparison bar chart or clock diagram.
  - Bold black ink bars: short green bar for Hunter-Gatherers (`15 hrs`), tall red/grey bar for Modern Workers (`40+ hrs`).
  - Minimal hand-lettered annotations and zero decorative clutter.
- **Canonical Video Frames**:
  - `frame_038_01m15s.jpg`: Comparative bar graph showing weekly working hours.
  - `frame_104_04m35s.jpg`: Circular 24-hour clock diagram divided into hunting, resting, and storytelling slices.
- **Reference Anchor**: `@anchor_infographic_chart_card`
- **Color Palette**: Pure white background `#FFFFFF`, black ink strokes, green (leisure) vs red (toil).

---

### Trope 11: Agricultural Revolution Contrast: Toil, Furrows & Strain
- **Script Keywords / Triggers**: *farming, agriculture, wheat, Neolithic, hoe, backbreaking, sunrise to sunset, weeding, monotonous*.
- **Directorial Technique**:
  - Sunken-eyed, exhausted farmer hunched over in repetitive posture holding primitive wooden hoe.
  - Endless muddy, gridded farm furrows stretching to horizon under harsh unforgiving sun.
  - Neolithic woman or man kneeling on knees grinding grain on rough quern stone with sweat beads.
- **Canonical Video Frames**:
  - `frame_055_01m58s.jpg`: Exhausted farmer standing in barren field with bold text 'PROGRESS?'.
  - `frame_172_08m08s.jpg`: Farmer hunched over pulling weeds in monotonous gridded furrow rows.
  - `frame_175_08m18s.jpg`: Farmer grinding grain on heavy quern stone in smoky clay hut.
- **Reference Anchor**: `@ref_char_farmer_standing_hut` + `@ref_char_farmer_hunched_weeding` + `@ref_char_farmer_quern_grinding` + `@ref_env_agricultural_furrows`
- **Color Palette**: Murky earth brown `#5C4033`, dull flax linen `#D8CDBA`, bleached pale sky.

---

### Trope 12: Night Campfire Hearth, Storytelling & Social Solidarity
- **Script Keywords / Triggers**: *fire, night, stories, stars, grooming, safety net, music, flute, shared food, gossip, laughter*.
- **Directorial Technique**:
  - Circle of tribe members sitting together cross-legged around bright crackling campfire.
  - Warm amber firelight rim-lighting figures against dark limestone cave stone or starry night sky.
  - Storyteller gesturing with arms imitating a woolly mammoth as listeners watch wide-eyed.
  - Friends grooming each other's hair or playing hollow bone flute.
- **Canonical Video Frames**:
  - `frame_120_05m23s.jpg`: Two tribe members sitting together, one carefully grooming the other's hair.
  - `frame_140_06m27s.jpg`: Circle of ancient humans holding hands in unity labeled 'THE SAFETY NET'.
  - `frame_161_07m29s.jpg`: Storyteller gesturing upward as speech bubble reveals earth and stars myth.
  - `frame_162_07m31s.jpg`: Storyteller imitating huge woolly mammoth with arms by campfire.
  - `frame_195_09m15s.jpg`: Paleolithic flute player playing hollow vulture bone flute by glowing embers.
- **Reference Anchor**: `@fire_reference` + `@male_early_human` + `@women_early_human` + `@ref_env_camp_night_stars` + `@ref_char_tribal_campfire_circle` + `@ref_char_tribal_social_grooming` + `@ref_char_tribal_solidarity_circle` + `@ref_env_prehistoric_cave`
- **Color Palette**: Charcoal night `#1C1C1E`, Glowing Campfire Orange `#FF6F00`, Warm Gold.

---

## 3. The "Find-or-Adapt" Algorithm (When the Subject Differs)

When your new script covers a subject not in the video (e.g., *Medieval Knights, Victorian Industrialists, Space Explorers*), do NOT reinvent the visual style. Use this 3-rule adaptation ladder:

```
[New Script Subject]
       │
       ▼ (Rule 1: Map the Narrative Trope)
       Is it Grind/Time? Freedom? Academic Proof? Data? Night Social?
       │
       ▼ (Rule 2: Adopt the Reference Composition & Framing)
       Borrow the camera angle, negative space, and line weight from that Trope's frame.
       │
       ▼ (Rule 3: Swap Costume/Props while Keeping the Stick Figure Engine)
       Keep circular white head, dot eyes, and uniform 4px black ink strokes.
```

### Adaptation Examples:
| New Script Line | Matched Trope | Reference Frame from Video | Adapted Visual Spec |
| :--- | :--- | :--- | :--- |
| *"In 1850, Victorian factory workers clocked in for 14-hour shifts."* | **Trope 1 & 5** (Grind / Historical Date) | `frame_005_00m08s.jpg` & `frame_016_00m28s.jpg` | Minimalist title card `'1850 — FACTORY SYSTEM'`, then stick figure hunched over industrial steam loom under massive clock face. |
| *"Medieval peasants celebrated up to 80 church feast days a year without work."* | **Trope 2 & 12** (Freedom / Social Hearth) | `frame_013_00m22s.jpg` & `frame_140_06m27s.jpg` | Peasant stick figure in coarse woolen smock resting on hay bale holding wooden ale mug under sunny blue sky, smiling peacefully. |
| *"Geneticists mapped human migration out of Africa across the globe."* | **Trope 6** (World Map Infographic) | `maps_reference.png` | Hand-drawn world map with pastel continents (`@maps_reference`) and dotted red arrow migration vectors originating from East Africa. |

---

## 4. Master Script-to-Frame Reference Table (First 50 Scene Beats)

Here is how the first 50 scene cuts in the reference video map from script line to visual technique:

| Frame # | Timestamp | Transcript Line | Visual Technique / Shot | Canonical Reference Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **001** | 00:00 | *"This morning, a machine screamed at you"* | Close-up vibrating alarm clock with soundwave zigzags | `@narrator_stickfigure` |
| **002** | 00:02 | *"until you woke up. You silenced it."* | Tired stickman reaching from messy bed sheets | `@narrator_stickfigure` |
| **004** | 00:06 | *"decided where you had to be, what you had to finish"* | Frantic stickman sprinting with briefcase & speed lines | `@narrator_stickfigure` |
| **005** | 00:08 | *"how many hours belong to someone else"* | Stickman trapped at office desk beneath giant clock | `@narrator_stickfigure` |
| **006** | 00:09 | *"And tonight, before you sleep..."* | Minimalist text card `'AND TONIGHT...'` with crescent moon | `@title_reference` |
| **008** | 00:13 | *"Now, rewind 50,000 years."* | Hand-drawn hourglass with `'50,000 YEARS'` | `@title_reference` |
| **009** | 00:15 | *"A man wakes up in the morning light"* | Hunter waking peacefully on straw bed by campfire | `@male_early_human`, `@fire_reference` |
| **010** | 00:16 | *"with no alarm, no schedule, and nowhere he has to be"* | Hunter resting with hands behind head, gazing at dawn | `@male_early_human` |
| **012** | 00:19 | *"He owns a spear, two animal hides, and a fire."* | Clean flint spear upright with label `'SPEAR'` | `@male_early_human`, `@ref_prop_flint_spear` |
| **013** | 00:22 | *"And he sits up, stretches, and asks himself..."* | Hunter joyfully stretching arms outward by fire | `@male_early_human`, `@fire_reference` |
| **014** | 00:25 | *"a question you have never once been free enough to ask"* | Split screen: Modern human chained to clock vs Hunter | `@ref_comp_split_screen_dual` |
| **015** | 00:27 | *"What should I do today?"* | Bold hand-lettered title card `'WHAT SHOULD I DO TODAY?'` | `@title_reference` |
| **016** | 00:28 | *"Now, your brain is already fighting this. It's telling you no."* | Stickman sitting cross-legged with floating question marks | `@expression_stick_figure` |
| **019** | 00:34 | *"That's what everyone believes. That's the story."* | Stack of dusty textbooks puffing dust clouds | `@title_reference` |
| **020** | 00:35 | *"The official story."* | Title card `'THE OFFICIAL STORY'` with quill pen | `@title_reference` |
| **021** | 00:38 | *"Subterranean layers showing fossilized bones"* | Earth cross-section with skeleton in dark soil stratum | `@archieologiest_stick_figure` |
| **022** | 00:41 | *"Archaeologists digging up the past"* | Field archaeologist in pith helmet brushing skeleton | `@archieologiest_stick_figure` |
| **023** | 00:44 | *"Smug explanation of historical assumptions"* | Smirking stickman host with cocked eyebrow pointing up | `@expression_stick_figure` |
| **027** | 00:52 | *"Modern appliances promise to save time, but do they?"* | Modern man shrugging with floating microwave & car icons | `@expression_stick_figure` |
| **028** | 00:55 | *"Hunter standing calmly on open savannah"* | Full-bleed panoramic golden savannah with hunter | `@male_early_human`, `@ref_env_savannah_wide` |
| **029** | 00:56 | *"Primitive spear surrounded by crossed-out electronics"* | Upright spear encircled by red crossed-out smartphones | `@ref_prop_flint_spear` |
| **030** | 00:58 | *"Split screen: YOU vs HIM"* | Vertical dashed divider: Office toil vs Campfire ease | `@ref_comp_split_screen_dual` |
| **034** | 01:05 | *"Color-coded Middle East map"* | Pastel-filled regional map of Middle East nations | `@maps_country_reference` |
| **035** | 01:06 | *"Archaeological dig sites in the Levant"* | Multiple researchers excavating in roped trench | `@archieologiest_stick_figure` |
| **038** | 01:15 | *"Bar chart comparing work hours"* | Clean minimalist bar chart (Hunter 15h vs Farmer 40h) | `@anchor_infographic_chart_card` |
| **041** | 01:22 | *"In 1963, an anthropologist walked into the Kalahari"* | Title card `'1963 — RICHARD LEE'` with safari hat icon | `@title_reference` |
| **042** | 01:25 | *"Richard Lee tracking Kalahari foragers"* | Field researcher in safari hat writing in notebook | `@archieologiest_stick_figure` |
| **055** | 01:58 | *"Neolithic farmer exhausted in field"* | Sunken-eyed hunched farmer with text `'PROGRESS?'` | `@early_farmer_stickfigure` |
| **086** | 03:36 | *"Hunter tracking footprints across desert"* | Male hunter following animal footprints across sand | `@male_early_human` |
| **087** | 03:39 | *"Hunter carrying hunted prey across shoulders"* | Triumphant hunter carrying antelope back to camp | `@male_early_human` |
| **120** | 05:23 | *"Two tribe members grooming hair in camp"* | Social grooming scene, companions chatting peacefully | `@male_early_human`, `@women_early_human` |
| **140** | 06:27 | *"Circle of tribe members holding hands"* | Circle of stick figures unified: `'THE SAFETY NET'` | `@male_early_human`, `@women_early_human` |
| **149** | 06:59 | *"In 2014, Polly Wiessner recorded campfire stories"* | Title card `'2014 — POLLY WIESSNER'` with campfire icon | `@title_reference`, `@fire_reference` |
| **161** | 07:29 | *"Storyteller gesturing by campfire beneath stars"* | Storyteller pointing to starry sky speech bubble | `@male_early_human`, `@fire_reference` |
| **162** | 07:31 | *"Storyteller imitating mammoth with arms"* | Dynamic physical storytelling by crackling night fire | `@male_early_human`, `@fire_reference` |
| **195** | 09:15 | *"Playing bone flute by the campfire"* | Paleolithic musician playing carved hollow bone flute | `@male_early_human`, `@fire_reference` |
| **214** | 10:19 | *"Women gathering, smiling with shell necklace"* | Woman gatherer smiling in afternoon light | `@women_early_human` |
| **228** | 11:05 | *"Three generations standing together at sunset"* | Child, adult hunter, and white-haired elder at sunset | `@male_early_human` |
| **231** | 11:11 | *"Rolled parchment scroll with checkered flag: 'Someday'"* | Rolled antique scroll labeled `'Someday.'` | `@title_reference` |

---

## 5. Summary Spec Construction Template

When constructing a new visual for any script line:

```json
{
  "id": "frame_001",
  "frame_number": 1,
  "timestamp_start": "00:00",
  "timestamp_end": "00:01",
  "matched_trope": "[NAME_OF_MATCHED_TROPE]",
  "reference_video_sample_frame": "frame_XXX_XXmXXs.jpg",
  "prompt": "2D hand-drawn animated stick figure explainer style. Clean bold black ink outlines, flat color fills, minimalist stick figure with white circular head and simple dot eyes. The stick figure sits slumped lazily on a simple green couch in a cozy minimalist living room, arms dangling limply at sides, staring blankly ahead with an exaggerated bored expression. Warm cream background (#FAF7EE), wooden side table nearby, full bleed 16:9, zero gradients, no 3D rendering, no borders.",
  "negative": "monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding",
  "character_references": [
    "@narrator_stickfigure"
  ],
  "frame_reference": null,
  "continuity": "anchor",
  "target_filename": "frame_001.png"
}
```

---

## 6. Micro-Animation Pacing, Continuity & Prompt Standards

### 6.1 Pacing Guard (~Every 4 Words / 0.7s to 2.0s Max)
Visuals must change rapidly in rhythm with spoken narration:
- **Target Frame Durations**: Keep every visual changing around **0.7s, 1s, 1.5s, or 2s (3s maximum)**.
- **Granular Micro-Beats**: Break spoken narration down roughly every 3 to 6 words into distinct visual actions.
- **Example**: *"about 40,000 years ago, a human sat by a fire"*
  1. *Beat 1* (`00:06.5 - 00:08`): Title card with bold text `'40,000 YEARS AGO'` (`@title_reference`).
  2. *Beat 2* (`00:08 - 00:09.5`): Early human sitting cross-legged at campfire in dark starry desert (`@male_early_human`, `@fire_reference`, `@ref_env_camp_night_stars`).

### 6.2 Narrative Continuity Chaining (Sequence of Story)
When a scene unfolds across multiple micro-beats (e.g. Frames 1 to 6 in the living room):
- **Maintain Environmental Continuity**: Keep the same room, same green couch, same wooden table, same character anatomy across every frame.
- **Set Continuity Flags**: Frame 1 is `"continuity": "anchor"`, `"frame_reference": null`. Frames 2 through 6 must be `"continuity": "continue"`, with `"frame_reference": "frame_XXX.png"` pointing to the immediately preceding frame.
- **Action Sequence Walkthrough**:
  - `frame_001`: Stick figure slumped on green couch looking bored.
  - `frame_002`: Continuous scene: stick figure reaches arm toward phone on side table.
  - `frame_003`: Continuous scene: close-up on table as stick figure hand grasps glowing phone.
  - `frame_004`: Continuous scene: stick figure holds phone, music note icon pops on display.
  - `frame_005`: Continuous scene: stick figure taps phone, gaming D-pad icon appears.
  - `frame_006`: Continuous scene: stick figure reclines on couch watching phone screen with red play icon.

### 6.3 Prompt Formatting Standards (No "Vibrant", Strict 2D Style)
- **Do NOT use the word "vibrant"**: "Vibrant" causes diffusion models to generate neon glowing 3D cyberpunk renders, purple alien characters, and glossy arcade art.
- **Mandatory 2D Hand-Drawn Opening**:
  `"2D hand-drawn animated stick figure explainer style. Clean bold black ink outlines, flat color fills, minimalist stick figure with white circular head and simple dot eyes. ..."`
- **Mandatory Closing**:
  `"Warm cream background (#FAF7EE) [or dark indigo night sky with stars], full bleed 16:9, zero gradients, no 3D rendering, no borders."`
- **Universal Locked Negative**:
  ```text
  monochrome, black and white, grayscale, sketch, pencil drawing, ink doodle, blank cream background, uncolored paper, photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models, borders, padding, abnormally long arms, stretched limbs, elongated noodle arms, rubber hose limbs, elastic limbs, extra elbows, double joints, broken joints, dislocated shoulders, distorted anatomy, warped stick figure, extra limbs, mutated hands, multiple arms
  ```

### 6.4 Strict Rules for `character_references`
1. **CONTINUATION FRAMES RULE (CRITICAL)**: For continuation frames (`continuity: "continue"` where `frame_reference` points to the previous frame), **`character_references` MUST be strictly empty `[]`**. Do NOT add any extra references because the previous frame already serves as the sole visual anchor. Adding extra tags causes Google Flow's multi-reference conditioning to blend conflicting anchors, resulting in severe style drift, 3D artifacts, and character distortion.
2. **ANCHOR FRAMES RULE**: For anchor frames (`continuity: "anchor"`, `frame_reference: null`), `character_references` is **REQUIRED — minimum 1 tag, always**. Never leave this array empty or null for anchor frames.
3. **STICK FIGURE RULE (ANCHOR FRAMES)**: Whenever a stick figure is described or mentioned in an anchor prompt, you **MUST** include its corresponding character reference tag in `character_references`:
   - Modern stick figure / narrator ➔ `@narrator_stickfigure`
   - Ancient male hunter ➔ `@male_early_human`
   - Ancient female ➔ `@women_early_human`
   - Skeptical / expressive host ➔ `@expression_stick_figure`
   - Archaeologist / researcher ➔ `@archieologiest_stick_figure` or `@ref_char_anthropologist_field`
4. Use the **most specific tag** available from Section 2 (e.g. `@ref_char_hunter_tracking_sand` beats `@male_early_human` for a tracking shot).
5. Use the **trope's Reference Anchor** from Section 3 as your starting point — pick the tag(s) that match the scene action.
4. **Selection guide by scene type**:
   - *Character in action* → use the specific `@ref_char_*` tag for that action + base character tag
   - *Environment only* → use `@ref_env_*` + the character that would inhabit it
   - *Prop / object close-up* → use `@ref_prop_*` tag
   - *Map / infographic* → use `@maps_reference` or `@maps_country_reference`
   - *Split-screen* → use `@ref_comp_split_screen_dual` + one tag per side
   - *Title card* → use `@title_reference`
   - *Narrator / commentary beat* → use `@expression_stick_figure` or `@narrator_stickfigure`
5. Frame IDs and files must follow the strict 3-digit zero-padded format: `frame_001`, `frame_001.png`.
6. Do NOT add `reference_instructions` or `formatted_reference_guidance` to the spec JSON. The Chrome Extension Side Panel automatically appends custom reference instructions (`## Use provided reference for visual understanding and stick figure anatomy...`) at runtime.

### 6.5 Creative Background Environment Specification & Aesthetics (The Anti-Sterile Rule)
Never prompt a bare cream void or a featureless room. A sterile background makes the frame look flat, cheap, and lifeless (e.g. plain couch against an empty off-white wall). Instead, specify a rich, layered, aesthetically pleasing 2D animated environment (e.g. the "Stick figure slumped on couch" reference):

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

### 6.6 Kinetic Action & Proportional Limb Guard (Solving Noodle Arms and Warped Anatomy)
When generating continuation frames where a stick figure performs an action (e.g. reaching for a phone on a coffee table while seated on a sofa):

1. **The Kinetic Physics Rule (Torso & Spine Movement)**:
   - Never command a limb action in isolation while leaving the torso static.
   - Prompt realistic full-body kinetics: *"scoots forward to the front edge of the seat cushion and leans its upper torso and head forward over its knees toward the coffee table; right arm reaches forward with a single clean elbow bend, while left hand braces on left knee for balance"*.
2. **Proportion & Joint Constraints**:
   - Include positive constraints in the action prompt:
     `"standard human stick-figure proportions, fixed limb length, single clean elbow bend, zero elongated noodle arms, no rubber stretching, no extra joints"`.

### 6.7 Stick-Figure Hands & Close-Up Actions (Preventing Human Fleshy Hands)
- In close-up shots (carving bone, chiseling, holding props), never use terms like "weathered hands" or "human hands".
- Always prompt:
  `"minimalist 2D black stick-figure arms ending in simple black cartoon mitten hands with zero realistic knuckles, zero fingernails, zero veins, zero skin texture, zero fleshy human anatomy"`.

### 6.8 In-Prompt Negative Heading Standard (`## Negative prompt (Don't use these):`)
Always embed negative instructions directly inside the prompt text under a dedicated markdown heading with 2–3 clear sentences:
```text
## Negative prompt (Don't use these):
Do not render realistic human hands, fleshy skin, muscular arms, knuckles, fingernails, veins, or anatomical details. Never render 3D CGI models, glossy lighting, photorealism, oil painting textures, dark murky shadows, or extra limbs. Avoid monochrome sketches, borders, and realistic human faces.
```

### 6.9 Infographics & Artifact Cards Matching `ref_prop_vulture_bone_flute_clean`
For historical artifacts (e.g. Hohle Fels bone flute, Geissenklösterle swan flute, mammoth ivory flute):
1. **Clean Paper Canvas**: Render against clean bright warm cream paper canvas (`#FAF7EE`).
2. **Bold Centered Title**: Place a bold hand-lettered uppercase title centered at the top (`HOHLE FELS BONE FLUTE`).
3. **Centered 2D Illustration**: Draw the artifact horizontally in the center with clean black ink contours and flat ivory fill.
4. **No Museum Furniture**: Never prompt museum pedestals, dark spotlights, glass display cases, or realistic human limbs.
5. **CRITICAL Reference Isolation**: **Never attach `@title_reference` to artifact or wildlife frames.** Use `@ref_prop_vulture_bone_flute` for flutes. `@title_reference` contains "1963 — RICHARD LEE" and the safari hat, which Google Flow will literally paste onto the image if attached.

