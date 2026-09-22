const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'side-panel', 'spec-input.js'),
  'utf8'
);
const context = {};
vm.runInNewContext(source, context);

const raw = {
  title: 'How Humans Learned to Have Fun',
  project: 'how_humans_learned_to_have_fun',
  format: 'spec_v2',
  global_settings: {
    aspect_ratio: '16:9',
    model: 'veo-2.0-generate-001',
    max_retries: 3,
    style: '2D hand-drawn animated stick figure explainer style',
    negative_prompt: 'photorealistic, 3D render'
  }
};

const header = context.SpecInput.normalizeHeader(raw);
assert.equal(header.project_name, 'how_humans_learned_to_have_fun');
assert.equal(header.default_model, 'Nano Banana 2');
assert.equal(header.global_settings.model, 'veo-2.0-generate-001');
assert.equal(header.default_aspect_ratio, '16:9');
assert.equal(header.max_retries, 3);
assert.equal(header.default_style, raw.global_settings.style);
assert.equal(header.default_negative_prompt, raw.global_settings.negative_prompt);
assert.equal(header.output_folder, 'how_humans_learned_to_have_fun');

const character = context.SpecInput.normalizeCharacter({
  id: 'narrator_stickfigure',
  name: 'narrator_stickfigure',
  flow_tag: '@narrator_stickfigure',
  description: 'Minimalist narrator',
  image_url: 'references/clean/narrator_stickfigure.png'
});
assert.equal(character.flow_tag, '@narrator_stickfigure');
assert.equal(character.image_url, 'references/clean/narrator_stickfigure.png');
assert.equal(character.reference_image, null);
assert.equal(character.prompt, 'Minimalist narrator');

console.log('corrected spec schema tests passed');