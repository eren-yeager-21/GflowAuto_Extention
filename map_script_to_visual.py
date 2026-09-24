"""
Script-to-Visual Matching & Spec Generation Utility
Usage:
  python map_script_to_visual.py "In 1920, factory workers clocked in before dawn under harsh factory whistles"
"""

import sys
import json
import re

TROPES = [
    {
        "name": "Night Campfire Hearth & Forge Fire",
        "keywords": ["fire", "campfire", "forge fire", "glowing fire", "flame", "embers", "hearth", "stories by fire", "cave fire"],
        "tag": "@fire_reference",
        "extra_tags": ["@male_early_human"],
        "frame_sample": "frame_120_05m23s.jpg",
        "shot_style": "Warm amber firelight cel-shaded on characters against dark charcoal background or night stone.",
        "borrow": "campfire/forge fire stone ring structure, flame tongue geometry, subtle smoke lines, warm amber lighting",
        "directive": "Render the workshop/hearth environment, tools, and fire glow exactly as described in prompt."
    },
    {
        "name": "Global & Continental Map Infographics",
        "keywords": ["world map", "worldwide", "global map", "continents", "middle east map", "africa map", "sites worldwide", "archaeological sites"],
        "tag": "@maps_reference",
        "frame_sample": "maps_reference.png",
        "shot_style": "Hand-drawn world map with pastel-filled continents (cyan, pink, yellow, orange, green, tan), clean black coastlines, red pins.",
        "borrow": "world map layout, solid flat pastel continent fills, bold hand-drawn vector borders, and red location pins",
        "directive": "Render the map title and specific location callout pins and markers as described."
    },
    {
        "name": "Regional Territory & Border Maps",
        "keywords": ["regional map", "country border", "territory", "kalahari desert", "botswana", "river valley", "kingdom border"],
        "tag": "@maps_country_reference",
        "frame_sample": "maps_country_reference.png",
        "shot_style": "Close-up hand-drawn regional territory borders, flat pastel fills, hand-lettered country names, red marker pin, small tree/tent icons.",
        "borrow": "regional territory borders, clean hand-lettered bold country titles, solid pastel fills, and red location marker pins",
        "directive": "Render the focal territory boundary, neighboring regions, and pin marker as described."
    },
    {
        "name": "Historical Timeline & Academic Citation",
        "keywords": ["1963", "2014", "richard lee", "polly wiessner", "anthropologist", "archaeologist", "expedition", "field study", "published", "excavation", "textbook", "stopwatch"],
        "tag": "@title_reference",
        "extra_tags": ["@archieologiest_stick_figure"],
        "frame_sample": "frame_016_00m28s.jpg",
        "shot_style": "Stark white title card with single minimal vector icon centered above bold hand-lettered uppercase date and name.",
        "borrow": "hand-drawn font lettering weight, uppercase minimalist text styling, centered icon placement",
        "directive": "Render the centered subject icon and clean historical date/name typography as described."
    },
    {
        "name": "Comparative Split-Screen (THEN vs NOW / YOU vs HIM)",
        "keywords": ["split screen", "contrast", "compared to", "you vs", "then vs", "versus", "chained vs free", "hours vs"],
        "tag": "@ref_comp_split_screen_dual",
        "extra_tags": ["@male_early_human", "@narrator_stickfigure"],
        "frame_sample": "frame_014_00m25s.jpg",
        "shot_style": "16:9 frame split down the middle by a clean vertical dashed black line. Left: toil/fatigue. Right: ease/nature.",
        "borrow": "dual split-screen composition, vertical dashed line divider, comparative negative space",
        "directive": "Render left and right comparative figures and environments with distinct contrasting color moods."
    },
    {
        "name": "Quantitative Time Audits & Chart Data",
        "keywords": ["15 hours", "40 hours", "hours a week", "data shows", "bar chart", "graph", "pie chart", "time audit", "percentage"],
        "tag": "@anchor_infographic_chart_card",
        "frame_sample": "frame_038_01m15s.jpg",
        "shot_style": "Clean hand-drawn comparison bar chart with bold black outlines, contrasting green (leisure) vs red (toil) bars, clear labels.",
        "borrow": "minimalist hand-drawn data card styling, ink outline axes, flat color fills, clean bold numbers",
        "directive": "Render the specific data comparisons, labels, and proportional bars as described."
    },
    {
        "name": "Female Subsistence: Foraging & Gathering",
        "keywords": ["gather", "gathering", "women", "mongongo", "nuts", "tubers", "berries", "foraging", "harvesting wild"],
        "tag": "@female_early_human",
        "frame_sample": "frame_214_10m19s.jpg",
        "shot_style": "Sunlit outdoor gathering, female figure with wavy hair and bone hairpin carrying woven bag or collecting under tree.",
        "borrow": "female stick-figure traits, long wavy brown hair with bone hairpin, fur dress with cord waist belt, line weight",
        "directive": "Render the foraging action, plant environment, gathering bags, and companion interaction as described."
    },
    {
        "name": "Male Subsistence: Hunting & Tracking",
        "keywords": ["hunting", "hunt", "spear", "tracking footprints", "spoor", "antelope", "stalking prey", "carrying game"],
        "tag": "@male_early_human",
        "extra_tags": ["@ref_prop_flint_spear"],
        "frame_sample": "frame_086_03m36s.jpg",
        "shot_style": "Dynamic or calm tracking in golden sand, holding spear at low steady angle, footprints receding into horizon.",
        "borrow": "hunter stick-figure anatomy, shaggy hair mane, one-shoulder pelt tunic, spear line weight",
        "directive": "Render the tracking gait, desert sand dunes, and animal interaction as described."
    },
    {
        "name": "Agricultural Toil & Repetitive Labor",
        "keywords": ["farming", "farmer", "hoe", "furrows", "weeding", "grinding stone", "quern", "wheat harvest", "monotonous toil"],
        "tag": "@early_farmer_stickfigure",
        "frame_sample": "frame_055_01m58s.jpg",
        "shot_style": "Sunken-eyed hunched farmer with primitive wooden hoe, gridded muddy furrows, harsh daylight, repetitive physical strain.",
        "borrow": "exhausted worker stick-figure posture, simple linen tunic, primitive tool proportions",
        "directive": "Render the field/workshop terrain, repetitive tools, and physical labor posture as described."
    },
    {
        "name": "Ancient Freedom & Sunrise Awakening",
        "keywords": ["no alarm", "no schedule", "free to choose", "dawn light", "sunrise light", "waking up without", "peaceful morning", "what should i do today"],
        "tag": "@male_early_human",
        "extra_tags": ["@fire_reference", "@ref_env_savannah_wide"],
        "frame_sample": "frame_009_00m15s.jpg",
        "shot_style": "Full-bleed wide shot of expansive golden terrain, straw bedding, crackling river stone campfire, soft morning light.",
        "borrow": "physical stick-figure traits, circular head structure, shaggy brown hair, one-shoulder animal fur tunic, line weight",
        "directive": "Render the serene dawn landscape, natural ground textures, and relaxed stretching posture as described."
    },
    {
        "name": "Modern Grind & Time Pressure",
        "keywords": ["alarm clock", "machine screamed", "deadline", "hours belong to", "office desk", "commute", "sprint with briefcase", "trapped by clock"],
        "tag": "@narrator_stickfigure",
        "frame_sample": "frame_001_00m00s.jpg",
        "shot_style": "High-contrast close-up or frantic wide shot, bold radiating black soundwave lines, stark white/cream background.",
        "borrow": "anxious/tired stick-figure anatomy, simple facial dots, uniform line weight",
        "directive": "Render the modern environment, props, and actions exactly as described in prompt."
    },
    {
        "name": "Challenging Misconceptions & Skeptical Commentary",
        "keywords": ["brutal", "short", "desperate", "myth", "official story", "brain fighting", "rethink", "everyone believes", "common misconception"],
        "tag": "@expression_stick_figure",
        "frame_sample": "frame_023_00m44s.jpg",
        "shot_style": "Minimalist center-stage host with knowing smirk, cocked eyebrow, index finger raised in gesture, clean white background.",
        "borrow": "facial smirk, cocked eyebrow, clean circular head, and witty demonstrative gestures",
        "directive": "Render the expressive presentation stance and accompanying floating thought/question symbols as described."
    }
]

def match_script_to_visual(script_line, frame_number=1):
    text = script_line.lower()
    
    best_trope = None
    best_score = -1
    
    for trope in TROPES:
        score = 0
        for kw in trope['keywords']:
            if kw in text:
                score += len(kw) * 2 # longer specific keyword hits
        if score > best_score:
            best_score = score
            best_trope = trope
            
    if best_score <= 0 or not best_trope:
        best_trope = TROPES[-1] # Misconceptions & Commentary

    char_refs = [best_trope['tag']]
    if 'extra_tags' in best_trope:
        for t in best_trope['extra_tags']:
            if t not in char_refs:
                char_refs.append(t)

    prompt = (
        f"Minimalist black ink line art illustration with flat color fills, edge-to-edge full-bleed composition, zero gradients. "
        f"{script_line.strip().capitalize()}. "
        f"Clean bold vector outlines, high contrast, warm cream background (#FAF7EE), full-bleed 16:9 wide shot, no borders, no padding."
    )

    instructions = [
        f"Visual Archetype: Matched to '{best_trope['name']}' based on reference video.",
        f"Style / Anatomy Borrowing: Use {best_trope['tag']} strictly for {best_trope['borrow']}.",
        f"Rendering Directive: {best_trope['directive']}"
    ]
    formatted_guidance = "### Reference Guidance:\n" + "\n".join(f"- {i}" for i in instructions)

    spec_object = {
        "id": f"frame_{frame_number:03d}",
        "frame_number": frame_number,
        "matched_trope": best_trope['name'],
        "reference_video_sample_frame": best_trope['frame_sample'],
        "prompt": prompt,
        "negative": "photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph, 3D models",
        "character_references": char_refs,
        "frame_reference": None,
        "continuity": "anchor",
        "target_filename": f"frame_{frame_number:03d}.png"
    }
    return spec_object

if __name__ == '__main__':
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = "A man wakes up in the morning light with no alarm, no schedule, and nowhere he has to be."

    result = match_script_to_visual(input_text, frame_number=1)
    print(json.dumps(result, indent=2))
