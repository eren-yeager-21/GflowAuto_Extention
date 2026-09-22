const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Verify project_dir parsing and folder assignment behavior
function mockParseSpec(raw) {
  const projectDir = String(
    raw.project_dir || 
    raw.project_directory || 
    raw.output_folder || 
    raw.output_dir || 
    raw.project_name || 
    "ancient_humans_scenes"
  ).trim();

  return {
    project_name: raw.project_name || raw.project || "Google Flow Production",
    project_dir: projectDir,
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

// Test 1: project_dir provided in spec JSON
const specWithProjectDir = mockParseSpec({
  project_name: "Ancient Humans Pleasure",
  project_dir: "custom_pleasure_frames",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specWithProjectDir.project_dir, "custom_pleasure_frames");
assert.equal(specWithProjectDir.output_folder, "custom_pleasure_frames");

const payload1 = mockGeneratePayload(specWithProjectDir, specWithProjectDir.visuals[0]);
assert.equal(payload1.folderName, "custom_pleasure_frames");
assert.equal(mockDownloadPath(specWithProjectDir, specWithProjectDir.visuals[0]), "custom_pleasure_frames/frame_001.png");

// Test 2: Fallback when only output_folder is provided
const specLegacy = mockParseSpec({
  project_name: "Legacy Project",
  output_folder: "legacy_scenes",
  visuals: [{ id: "frame_001", target_filename: "frame_001.png" }]
});
assert.equal(specLegacy.project_dir, "legacy_scenes");
assert.equal(specLegacy.output_folder, "legacy_scenes");
assert.equal(mockDownloadPath(specLegacy, specLegacy.visuals[0]), "legacy_scenes/frame_001.png");

console.log('project-dir session tests passed');
