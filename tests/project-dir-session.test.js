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
      target_filename: v.target_filename || `frame_${String(i + 1).padStart(3, '0')}.png`
    }))
  };
}

function mockGeneratePayload(spec, frame) {
  return {
    folderName: (spec.project_dir || spec.output_folder || 'ancient_humans_scenes').trim(),
    targetFilename: frame.target_filename
  };
}

function mockDownloadPath(spec, frame) {
  const targetFolder = (spec.project_dir || spec.output_folder || 'ancient_humans_scenes').trim();
  return `${targetFolder}/${frame.target_filename}`;
}

// Test 1: Absolute Windows path provided in project_dir
const specWindows = mockParseSpec({
  project_name: "Sapiens vs Neanderthals",
  project_dir: "E:\\Stick_Figure_videos\\sapiens_vs_neanderthals",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specWindows.project_dir, "sapiens_vs_neanderthals");
assert.equal(specWindows.output_folder, "sapiens_vs_neanderthals");
assert.equal(mockGeneratePayload(specWindows, specWindows.visuals[0]).folderName, "sapiens_vs_neanderthals");
assert.equal(mockDownloadPath(specWindows, specWindows.visuals[0]), "sapiens_vs_neanderthals/frame_001.png");

// Test 2: Simple folder name in project_dir
const specRelative = mockParseSpec({
  project_name: "Sapiens vs Neanderthals",
  project_dir: "sapiens_vs_neanderthals",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specRelative.project_dir, "sapiens_vs_neanderthals");
assert.equal(mockDownloadPath(specRelative, specRelative.visuals[0]), "sapiens_vs_neanderthals/frame_001.png");

// Test 3: Fallback when only output_folder is provided
const specLegacy = mockParseSpec({
  project_name: "Legacy Project",
  output_folder: "legacy_scenes",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specLegacy.project_dir, "legacy_scenes");
assert.equal(mockDownloadPath(specLegacy, specLegacy.visuals[0]), "legacy_scenes/frame_001.png");

// Test 4: Default fallback
const specDefault = mockParseSpec({});
assert.equal(specDefault.project_dir, "ancient_humans_scenes");

// Test 5: Nested in global_settings
const specGlobal = mockParseSpec({
  project_name: "Global Settings Project",
  global_settings: {
    project_dir: "E:\\Stick_Figure_videos\\sapiens_vs_neanderthals"
  },
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specGlobal.project_dir, "sapiens_vs_neanderthals");
assert.equal(mockDownloadPath(specGlobal, specGlobal.visuals[0]), "sapiens_vs_neanderthals/frame_001.png");

console.log('project-dir session tests passed');
