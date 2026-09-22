(function (root) {
  function getGlobalSettings(raw) {
    return raw && typeof raw.global_settings === 'object' && raw.global_settings !== null
      ? raw.global_settings
      : {};
  }

  function normalizeHeader(raw = {}) {
    const globalSettings = getGlobalSettings(raw);
    const projectName = raw.project_name || raw.project || raw.title || 'Google Flow Production';

    return {
      project_name: projectName,
      title: raw.title || projectName,
      format: raw.format || null,
      description: raw.description || '',
      collection_url: raw.collection_url || raw.flow_collection_url || raw.collection?.url || '',
      collection_tab_id: Number.isInteger(raw.collection_tab_id) ? raw.collection_tab_id : null,
      global_settings: { ...globalSettings },
      default_model: raw.default_model || raw.image_model || raw.model || 'Nano Banana 2',
      default_aspect_ratio: raw.default_aspect_ratio || raw.aspect_ratio || globalSettings.aspect_ratio || '16:9',
      default_negative_prompt: raw.default_negative_prompt || raw.negative_prompt || globalSettings.negative_prompt || '',
      default_style: raw.default_style || raw.style || globalSettings.style || '',
      max_retries: raw.max_retries || globalSettings.max_retries || 3,
      output_folder: raw.output_folder || raw.project || raw.project_name || 'flow_pipeline',
      reference_folder: raw.reference_folder || 'Branded_references'
    };
  }

  function normalizeCharacter(character = {}, index = 0, objectKey = '') {
    const name = character.name || objectKey || 'Character ' + (index + 1);
    const prompt = character.character_prompt || character.prompt || character.description || '';

    return {
      id: character.id || objectKey || 'char_' + (index + 1),
      name,
      flow_tag: character.flow_tag || '@' + name.replace(/\s+/g, '_'),
      image_url: character.image_url || null,
      reference_image: character.reference_image || null,
      character_prompt: prompt,
      prompt,
      description: prompt,
      status: character.status || 'checking'
    };
  }

  root.SpecInput = {
    normalizeHeader,
    normalizeCharacter
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);