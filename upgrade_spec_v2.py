import json
import re

spec_path = r'E:\Gflow_MCP\ancient_humans_free_time_spec_v2.json'
with open(spec_path, 'r', encoding='utf-8') as f:
    spec = json.load(f)

# Update characters
spec['characters'] = [
    {
        "id": "CHAR_PALEO_MALE",
        "name": "male_early_human",
        "flow_tag": "@male_early_human",
        "reference_image": "male_early_human.png",
        "character_prompt": "Minimalist black ink line art stick figure paleolithic hunter-gatherer with shaggy brown hair mane, single-shoulder animal fur tunic, bare feet, holding chipped flint spear. Clean bold outlines, flat color fills, zero gradients, pure white background."
    },
    {
        "id": "CHAR_PALEO_FEMALE",
        "name": "female_early_human",
        "flow_tag": "@female_early_human",
        "reference_image": "female_early_human.png",
        "character_prompt": "Minimalist black ink line art stick figure female hunter-gatherer with long wavy shaggy brown hair, small bone hair ornament, animal fur dress with cord waist belt, friendly expression. Clean bold outlines, flat color fills, zero gradients, pure white background."
    },
    {
        "id": "CHAR_ARCHAEOLOGIST",
        "name": "archieologiest_stick_figure",
        "flow_tag": "@archieologiest_stick_figure",
        "reference_image": "archieologiest_stick_figure.png",
        "character_prompt": "Minimalist black ink line art stick figure field archaeologist wearing tan brimmed safari pith helmet, shoulder strap satchel utility bag, holding field notebook and pencil. Clean bold outlines, flat color fills, zero gradients, pure white background."
    },
    {
        "id": "CHAR_EXPRESSION",
        "name": "expression_stick_figure",
        "flow_tag": "@expression_stick_figure",
        "reference_image": "expression_stick_figure.png",
        "character_prompt": "Minimalist black ink line art stick figure host avatar with circular pale cream head (#FFFDD0), knowing smirk expression, cocked eyebrow, index finger raised in gesture. Clean bold outlines, flat color fills, zero gradients, pure white background."
    },
    {
        "id": "CHAR_NARRATOR",
        "name": "narrator_stickfigure",
        "flow_tag": "@narrator_stickfigure",
        "reference_image": "narrator_stickfigure.png",
        "character_prompt": "Minimalist black ink line art stick figure narrator avatar with clean round circular head, looking up and right with contemplative open gesturing arm. Clean bold outlines, flat color fills, zero gradients, pure white background."
    },
    {
        "id": "ANCHOR_MAP_WORLD",
        "name": "maps_reference",
        "flow_tag": "@maps_reference",
        "reference_image": "maps_reference.png",
        "character_prompt": "Historical and global geographic world map anchor with solid flat pastel colored continents (cyan Americas, yellow Europe, orange Asia, green Africa, tan Australia), clean black continental outlines, and red teardrop map pins with city/site labels, 16:9."
    },
    {
        "id": "ANCHOR_MAP_COUNTRY",
        "name": "maps_country_reference",
        "flow_tag": "@maps_country_reference",
        "reference_image": "maps_country_reference.png",
        "character_prompt": "Regional territory and boundary map anchor with bold hand-drawn country borders, flat pastel color fills, hand-lettered bold country labels, red location pin, and vector landmark icon, 16:9."
    },
    {
        "id": "ANCHOR_FIRE",
        "name": "fire_reference",
        "flow_tag": "@fire_reference",
        "reference_image": "fire_reference.png",
        "character_prompt": "Campfire prop visual anchor with circular grey river stones, orange and yellow flame tongues, thin smoke wisps, and bold hand-lettered title text."
    },
    {
        "id": "ANCHOR_TITLE",
        "name": "title_reference",
        "flow_tag": "@title_reference",
        "reference_image": "title_reference.png",
        "character_prompt": "Historical date and researcher introduction title card anchor with clean hand-lettered text and minimal icon centered above, 16:9."
    },
    {
        "id": "ANCHOR_SAVANNAH",
        "name": "savannah_environment_anchor",
        "flow_tag": "@ref_env_savannah_wide",
        "reference_image": "ref_env_savannah_wide.png",
        "character_prompt": "Expansive prehistoric savannah grassland background visual anchor, warm sand tones (#F3E8D2), distant green hills, clear sky, zero gradients, 16:9."
    },
    {
        "id": "ANCHOR_SPLIT_SCREEN",
        "name": "split_screen_anchor",
        "flow_tag": "@ref_comp_split_screen_dual",
        "reference_image": "ref_comp_split_screen_dual.png",
        "character_prompt": "Comparative split-screen layout anchor with a crisp vertical dashed black line dividing left and right scenes, clean negative space, 16:9."
    }
]

# Map old tags to new tags
tag_map = {
    "@richard_lee_stickfigure": "@archieologiest_stick_figure",
    "@archieologiest_stick_fig": "@archieologiest_stick_figure",
    "@Early_man_stickfigure": "@male_early_human",
    "@Early_women_stickfigure": "@female_early_human",
    "@ref_archaeologist": "@archieologiest_stick_figure",
    "@ref_stick_figure_narrator": "@expression_stick_figure",
    "@ref_world_map": "@maps_reference",
    "@ref_prehistoric_campfire": "@fire_reference",
    "@ref_prehistoric_human": "@male_early_human"
}

for v in spec['visuals']:
    prompt = v.get('prompt', '')
    # Strip any accidental reference guidance inside prompt
    clean_prompt = re.split(r'###\s*Reference Guidance|##\s*use the provided', prompt, flags=re.IGNORECASE)[0].strip()
    v['prompt'] = clean_prompt

    # Update character references
    new_char_refs = []
    old_char_refs = v.get('character_references', [])
    for cr in old_char_refs:
        mapped = tag_map.get(cr, cr)
        if mapped == "@modern_you_stickfigure":
            # Decide if expression or narrator
            if any(w in clean_prompt.lower() for w in ['smug', 'skeptic', 'smirk', 'wonder', 'question', 'perplexed', 'bored']):
                mapped = "@expression_stick_figure"
            else:
                mapped = "@narrator_stickfigure"
        if mapped not in new_char_refs:
            new_char_refs.append(mapped)

    # Detect if map scene
    prompt_lower = clean_prompt.lower()
    if 'map' in prompt_lower or 'middle east' in prompt_lower or 'kalahari' in prompt_lower:
        if 'world' in prompt_lower or 'continents' in prompt_lower:
            if '@maps_reference' not in new_char_refs:
                new_char_refs.append('@maps_reference')
        else:
            if '@maps_country_reference' not in new_char_refs and '@maps_reference' not in new_char_refs:
                new_char_refs.append('@maps_country_reference')

    # Detect if fire scene
    if 'campfire' in prompt_lower or 'fire light' in prompt_lower or 'crackling fire' in prompt_lower:
        if '@fire_reference' not in new_char_refs:
            new_char_refs.append('@fire_reference')

    # Detect if title card scene
    if 'title card' in prompt_lower or '1963' in prompt_lower or '2014' in prompt_lower:
        if '@title_reference' not in new_char_refs:
            new_char_refs.append('@title_reference')

    # Detect if female scene
    if any(w in prompt_lower for w in ['female', 'woman', 'women', 'mother', 'gatherer woman', 'gathering mongongo']):
        if '@female_early_human' not in new_char_refs:
            new_char_refs.append('@female_early_human')

    v['character_references'] = new_char_refs

    # Build reference_instructions array
    instructions = []
    for cr in new_char_refs:
        if cr == '@male_early_human':
            instructions.append("Character Anatomy: Use @male_early_human strictly for physical stick-figure traits, circular head structure, shaggy brown hair, one-shoulder animal fur tunic, and line weight.")
        elif cr == '@female_early_human':
    if 'formatted_reference_guidance' in v:
        del v['formatted_reference_guidance']
    if 'reference_instructions' in v:
        del v['reference_instructions']

# Save updated spec
with open(spec_path, 'w', encoding='utf-8') as f:
    json.dump(spec, f, indent=2)

# Also update the primary spec ancient_humans_free_time_spec.json to match
primary_spec_path = r'E:\Gflow_MCP\ancient_humans_free_time_spec.json'
with open(primary_spec_path, 'w', encoding='utf-8') as f:
    json.dump(spec, f, indent=2)

print(f"Successfully upgraded {spec_path} and {primary_spec_path} with {len(spec['visuals'])} decoupled visuals and standardized character references.")
