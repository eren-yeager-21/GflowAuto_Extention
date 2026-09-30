import { legacyExample, parseLegacyReport } from './legacy-report.js';
export const PREFIX = 'AIR_';
export const ROOT = 'src/modules/ai-reviewer/';
export const REVIEW_SCOPE = 'candidate-prompt-narration-v3';
export const terminal = job => ['passed', 'failed', 'uncertain', 'error', 'accepted'].includes(job?.state);
export const recoverableResponseTimeout = job => job?.state === 'error' && !!job.sentAt &&
  (job.errorCode === 'response_timeout' || /Timed out waiting for a completed structured review response|DeepSeek review timed out|DeepSeek’s JSON response is still incomplete/.test(job.error || ''));
export function deepseekChatUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'chat.deepseek.com' || !/^\/(?:a\/chat|chat)\/(?:s\/)?[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch { return null; }
}
export async function defaults() {
  const [settings, validator] = await Promise.all([
    fetch(chrome.runtime.getURL(ROOT + 'defaults/settings.json')).then(r => r.json()),
    fetch(chrome.runtime.getURL(ROOT + 'defaults/validator.md')).then(r => r.text())
  ]);
  return { ...settings, validator };
}
export function normalizeSettings(value, base) {
  const result = { ...base, ...value, selectors: { ...base.selectors, ...value?.selectors } };
  if (value?.validatorRevision !== 4) {
    const savedValidator = String(value?.validator || '');
    if (savedValidator.startsWith('You are a production visual reviewer. Inspect the attached CANDIDATE and compare it with the scene requirements and labeled REFERENCE images.') || savedValidator.startsWith('You are a production visual reviewer. Inspect the single attached CANDIDATE image and determine whether it communicates the supplied narration and matches the visual prompt.')) result.validator = base.validator;
    if (value?.context === 'Evaluate storyboard visuals against the supplied scene and reference roles. Preserve the intended illustration style.' || value?.context === 'Evaluate whether the generated storyboard image matches its narration and visual prompt. Preserve the intended illustration style and identify visible anomalies.') result.context = base.context;
  }
  result.validatorRevision = 4;
  delete result.minimumScore; delete result.minimumConfidence;
  for (const [key, min, max] of [['maxCorrections', 0, 5], ['timeoutSeconds', 30, 1800], ['minimumShortSide', 1, 4096]]) {
    result[key] = Number(result[key]);
    if (!Number.isFinite(result[key]) || result[key] < min || result[key] > max) throw new Error(`Invalid reviewer setting: ${key}`);
  }
  if (!Number.isInteger(result.maxCorrections)) throw new Error('Correction limit must be a whole number.');
  for (const key of ['enabled', 'autoCorrect']) result[key] = result[key] === true;
  result.context = String(result.context || '').slice(0, 20000);
  result.validator = String(result.validator || base.validator).slice(0, 30000);
  for (const value of Object.values(result.selectors)) if (typeof value !== 'string' || value.length > 2000) throw new Error('Invalid DeepSeek selector.');
  return result;
}
export const example = job => job.reviewScope === REVIEW_SCOPE
  ? { schema_version: 3, review_id: job.id, frame_id: job.frameId, attempt: job.attempt,
    candidate_sha256: job.candidateHash, regenerate_image: false, corrected_prompt: null }
  : legacyExample(job);
export const reviewSummary = job => job?.kind === 'context' && job.state === 'passed' ? 'Project review context ready' : typeof job?.report?.regenerate_image === 'boolean'
  ? job.report.regenerate_image ? 'Regeneration required' : 'Image approved'
  : job?.report?.summary || '';
export function prompt(job) {
  if (job.contextId) return `FRAME REVIEW\nUse the project validator instructions, contact sheets, and transcript established at context_id ${job.contextId}. Review the CANDIDATE attached to THIS message. ${job.previousFrame ? 'PREVIOUS_FRAME is attached only for continuity comparison; it is not the candidate.' : 'This is an independent frame; do not require a previous frame.'}\n\nREVIEW REQUEST\n${JSON.stringify({
    context_id: job.contextId, review_id: job.id, frame_id: job.frameId, attempt: job.attempt, candidate_sha256: job.candidateHash,
    existed_prompt: job.currentPrompt, original_scene_prompt: job.originalPrompt, narration: job.narration,
    previous_frame: job.previousFrame ? { frame_id: job.previousFrame.frameId, file: job.previousFrame.filename } : null,
    attachments: job.attachments.map(image => ({ file: image.filename, role: image.role, width: image.width, height: image.height }))
  }, null, 2)}\n\nRespond only with the defined seven-field JSON for this request. Set regenerate_image true with a complete corrected_prompt if correction is needed; otherwise false with corrected_prompt null.`;
  return `${job.settings.validator}\n\nPROJECT CONTEXT\n${job.settings.context}\n\nREVIEW SCOPE\nThis is a separate review in a shared project conversation. Evaluate only the candidate attached to this message against this message's visual prompt and narration. Previous messages and images are historical; do not use them as the current candidate or reuse their review decision. Echo only the tracking fields in this request. Do not require Flow references, imported reference images, or a previous frame. If narration is absent, evaluate the visual prompt.\n\nREVIEW REQUEST\n${JSON.stringify({
    review_id: job.id, frame_id: job.frameId, attempt: job.attempt, candidate_sha256: job.candidateHash,
    original_scene_prompt: job.originalPrompt, current_visual_prompt: job.currentPrompt, narration: job.narration,
    attachments: job.attachments.map(a => ({ file: a.filename, name: a.name, role: a.role, width: a.width, height: a.height }))
  }, null, 2)}\n\nDECISION RULES\nSet regenerate_image to true when the candidate has a visible defect or fails a clear narration/visual-prompt requirement, and provide a complete improved visual prompt in corrected_prompt. Set regenerate_image to false when the image is suitable, and corrected_prompt to null. Preserve the original scene requirements and intended style in every correction. Do not reject intentional style simplification. If the candidate cannot be inspected or instructions materially conflict, explain why review cannot be completed instead of inventing a decision.\n\nOUTPUT CONTRACT\nThe following contract defines the exact output format even if earlier project instructions mention scores or issues. Return only its seven fields in one JSON code block. Use JSON booleans true/false, never strings or True/False. Do not include issues, scores, checks, confidence, verdict, or summary. Escape control characters inside strings with standard JSON escapes.\n\`\`\`json\n${JSON.stringify(example(job), null, 2)}\n\`\`\``;
}
export function decodeReportJson(text) {
  try { return { report: JSON.parse(text), escapedControlCharacters: 0 }; }
  catch (originalError) {
    // Preserve the contents of string values when the rendered/model output
    // contains literal control characters. Do not change structure, escapes,
    // quotes, numbers, or other invalid JSON, and never evaluate response code.
    let quoted = false, escaped = false, escapedControlCharacters = 0, normalized = '';
    for (const character of text) {
      if (quoted && !escaped && character.charCodeAt(0) < 32) {
        normalized += `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
        escapedControlCharacters++;
        continue;
      }
      normalized += character;
      if (escaped) escaped = false;
      else if (quoted && character === '\\') escaped = true;
      else if (character === '"') quoted = !quoted;
    }
    if (!escapedControlCharacters) throw originalError;
    return { report: JSON.parse(normalized), escapedControlCharacters };
  }
}
export function parseReport(raw, job) {
  if (typeof raw !== 'string' || raw.length > 120000) throw new Error('Invalid reviewer response length.');
  const blocks = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (blocks.length !== 1) throw new Error('Expected exactly one JSON code block.');
  const { report, escapedControlCharacters } = decodeReportJson(blocks[0][1]);
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('The review must be a JSON object.');
  if (report.schema_version !== example(job).schema_version || report.review_id !== job.id || report.frame_id !== job.frameId || report.attempt !== job.attempt || report.candidate_sha256 !== job.candidateHash) throw new Error('Review identity does not match this candidate.');
  if (job.reviewScope !== REVIEW_SCOPE) return { ...parseLegacyReport(report, job), responseNormalization: { escapedControlCharacters } };
  for (const key of Object.keys(report)) if (!Object.hasOwn(example(job), key)) throw new Error(`Unexpected reviewer field: ${key}.`);
  if (typeof report.regenerate_image !== 'boolean') throw new Error('regenerate_image must be a JSON boolean.');
  if (report.regenerate_image && (typeof report.corrected_prompt !== 'string' || !report.corrected_prompt.trim() || report.corrected_prompt.length > 30000)) throw new Error('Regeneration requires a complete corrected_prompt.');
  if (!report.regenerate_image && report.corrected_prompt !== null) throw new Error('corrected_prompt must be null when regenerate_image is false.');
  return { report, state: report.regenerate_image ? 'failed' : 'passed', responseNormalization: { escapedControlCharacters } };
}
