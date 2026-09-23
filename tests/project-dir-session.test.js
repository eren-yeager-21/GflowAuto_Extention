const assert = require('node:assert/strict');

function sanitizeProjectDir(rawDir) {
  if (!rawDir) return '';
  let dir = String(rawDir).trim().replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(dir) || dir.startsWith('/')) {
    const segments = dir.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  }
  return dir.replace(/^\/+|\/+$/g, '');
}

function getProjectFramesFolder(spec) {
  const base = (spec.project_dir || spec.output_folder || 'ancient_humans_scenes')
    .trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (base.endsWith('/frames')) {
    return base;
  }
  return `${base}/frames`;
}

function getProjectRootFolder(spec) {
  const base = (spec.project_dir || spec.output_folder || 'ancient_humans_scenes')
    .trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (base.endsWith('/frames')) {
    return base.slice(0, -'/frames'.length) || base;
  }
  return base;
}

function mockParseSpec(raw) {
  const rawDir = String(
    raw.project_dir || 
    (raw.global_settings && raw.global_settings.project_dir) ||
    raw.project_directory || 
    raw.output_folder || 
    (raw.global_settings && raw.global_settings.output_folder) ||
    raw.output_dir || 
    raw.project_name || 
    "ancient_humans_scenes"
  ).trim();
  const projectDir = sanitizeProjectDir(rawDir) || "ancient_humans_scenes";

  return {
    project_name: raw.project_name || raw.project || "Google Flow Production",
    project_dir: projectDir,
    raw_project_dir: rawDir,
    output_folder: projectDir,
    visuals: (raw.visuals || []).map((v, i) => ({
      id: v.id || `frame_${String(i + 1).padStart(3, '0')}`,
      frame_number: v.frame_number || i + 1,
      timestamp_start: v.timestamp_start || v.start_time || null,
      timestamp_end: v.timestamp_end || v.end_time || null,
      verbatim_script: v.verbatim_script || v.script || v.narration || null,
      target_filename: v.target_filename || `frame_${String(i + 1).padStart(3, '0')}.png`
    }))
  };
}

function mockGeneratePayload(spec, frame) {
  return {
    folderName: getProjectFramesFolder(spec),
    targetFilename: frame.target_filename
  };
}

function mockDownloadPath(spec, frame) {
  const framesFolder = getProjectFramesFolder(spec);
  return `${framesFolder}/${frame.target_filename}`;
}

function mockMappingPath(spec) {
  const rootFolder = getProjectRootFolder(spec);
  return `${rootFolder}/pipeline_mapping.json`;
}

// Test 1: Absolute Windows path provided in project_dir
const specWindows = mockParseSpec({
  project_name: "Sapiens vs Neanderthals",
  project_dir: "E:\\Stick_Figure_videos\\sapiens_vs_neanderthals",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specWindows.project_dir, "sapiens_vs_neanderthals");
assert.equal(specWindows.output_folder, "sapiens_vs_neanderthals");
assert.equal(mockGeneratePayload(specWindows, specWindows.visuals[0]).folderName, "sapiens_vs_neanderthals/frames");
assert.equal(mockDownloadPath(specWindows, specWindows.visuals[0]), "sapiens_vs_neanderthals/frames/frame_001.png");
assert.equal(mockMappingPath(specWindows), "sapiens_vs_neanderthals/pipeline_mapping.json");

// Test 2: Simple folder name in project_dir
const specRelative = mockParseSpec({
  project_name: "Sapiens vs Neanderthals",
  project_dir: "sapiens_vs_neanderthals",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specRelative.project_dir, "sapiens_vs_neanderthals");
assert.equal(mockDownloadPath(specRelative, specRelative.visuals[0]), "sapiens_vs_neanderthals/frames/frame_001.png");
assert.equal(mockMappingPath(specRelative), "sapiens_vs_neanderthals/pipeline_mapping.json");

// Test 3: If project_dir already specifies frames subfolder, avoid frames/frames duplicate
const specExplicitFrames = mockParseSpec({
  project_name: "Sapiens vs Neanderthals",
  project_dir: "sapiens_vs_neanderthals/frames",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(mockDownloadPath(specExplicitFrames, specExplicitFrames.visuals[0]), "sapiens_vs_neanderthals/frames/frame_001.png");
assert.equal(mockMappingPath(specExplicitFrames), "sapiens_vs_neanderthals/pipeline_mapping.json");

// Test 4: Default fallback
const specDefault = mockParseSpec({
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specDefault.project_dir, "ancient_humans_scenes");
assert.equal(mockDownloadPath(specDefault, specDefault.visuals[0]), "ancient_humans_scenes/frames/frame_001.png");
assert.equal(mockMappingPath(specDefault), "ancient_humans_scenes/pipeline_mapping.json");

// Test 5: Nested in global_settings
const specGlobal = mockParseSpec({
  project_name: "Global Settings Project",
  global_settings: {
    project_dir: "E:\\Stick_Figure_videos\\sapiens_vs_neanderthals"
  },
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specGlobal.project_dir, "sapiens_vs_neanderthals");
assert.equal(mockDownloadPath(specGlobal, specGlobal.visuals[0]), "sapiens_vs_neanderthals/frames/frame_001.png");

// Test 6: Verbatim script & timestamp display fields
const specWithScript = mockParseSpec({
  project_name: "How Humans Learned to Have Fun",
  project_dir: "E:\\Stick_Figure_videos\\how_humans_learned_to_have_fun",
  visuals: [{
    id: "frame_001",
    frame_number: 1,
    timestamp_start: "00:00",
    timestamp_end: "00:01",
    verbatim_script: "The last time you were bored,",
    target_filename: "frame_001.png"
  }]
});
assert.equal(specWithScript.visuals[0].timestamp_start, "00:00");
assert.equal(specWithScript.visuals[0].timestamp_end, "00:01");
assert.equal(specWithScript.visuals[0].verbatim_script, "The last time you were bored,");

console.log('project-dir session tests passed (frames subfolder verified)');
