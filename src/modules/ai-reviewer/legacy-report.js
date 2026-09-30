// Only for reading reviews already submitted with the former scored contract.
export const LEGACY_SCOPE = 'candidate-prompt-narration-v2';
export const legacyExample = job => ({ schema_version: job.reviewScope === LEGACY_SCOPE ? 2 : 1,
  review_id: job.id, frame_id: job.frameId, attempt: job.attempt, candidate_sha256: job.candidateHash,
  verdict: 'uncertain', overall_score: 0, confidence: 0,
  checks: job.reviewScope === LEGACY_SCOPE
    ? { narration_alignment: null, scene_fidelity: null, anatomy_and_interactions: null, composition_and_finish: null, requested_text: null }
    : { scene_fidelity: null, reference_fidelity: null, continuity: null, anatomy_and_interactions: null, composition_and_finish: null, requested_text: null },
  issues: [], summary: 'Concise evidence-based assessment.', corrected_prompt: null });

export function parseLegacyReport(report, job) {
  if (!['pass', 'fail', 'uncertain'].includes(report.verdict)) throw new Error('Invalid review verdict.');
  for (const [key, max] of [['overall_score', 100], ['confidence', 1]]) if (typeof report[key] !== 'number' || !Number.isFinite(report[key]) || report[key] < 0 || report[key] > max) throw new Error(`Invalid ${key}.`);
  if (!report.checks || typeof report.checks !== 'object' || Array.isArray(report.checks)) throw new Error('Missing quality checks.');
  for (const key of Object.keys(legacyExample(job).checks)) {
    const value = report.checks[key];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)) throw new Error(`Invalid quality check: ${key}`);
  }
  if (!Array.isArray(report.issues) || report.issues.length > 50) throw new Error('Invalid issue list.');
  for (const issue of report.issues) {
    if (!issue || !['minor', 'major', 'critical'].includes(issue.severity)) throw new Error('Invalid issue severity.');
    for (const key of ['category', 'region', 'evidence', 'correction']) if (typeof issue[key] !== 'string' || !issue[key].trim() || issue[key].length > 5000) throw new Error(`Missing issue ${key}.`);
  }
  if (typeof report.summary !== 'string' || !report.summary.trim() || report.summary.length > 10000) throw new Error('Missing review summary.');
  if (report.verdict === 'fail' && (typeof report.corrected_prompt !== 'string' || !report.corrected_prompt.trim() || report.corrected_prompt.length > 30000)) throw new Error('A failed review needs a complete corrected prompt.');
  if (report.verdict !== 'fail' && report.corrected_prompt !== null) throw new Error('Corrected prompt must be null on pass/uncertain.');
  const major = report.issues.some(issue => ['major', 'critical'].includes(issue.severity));
  const needed = ['scene_fidelity', 'anatomy_and_interactions', 'composition_and_finish'];
  const hasNarration = job.reviewScope === LEGACY_SCOPE && !!String(job.narration || '').trim();
  if (hasNarration) needed.push('narration_alignment');
  if (job.reviewScope !== LEGACY_SCOPE) {
    if (job.attachments.some(a => !['candidate', 'continuity'].includes(a.role))) needed.push('reference_fidelity');
    if (job.attachments.some(a => a.role === 'continuity')) needed.push('continuity');
  }
  const minimumScore = job.settings.minimumScore ?? 85, minimumConfidence = job.settings.minimumConfidence ?? 0.8;
  const uncertain = report.verdict === 'uncertain' || report.confidence < minimumConfidence || needed.some(key => report.checks[key] === null);
  const qualifies = report.verdict === 'pass' && !major && report.overall_score >= minimumScore &&
    (job.reviewScope !== LEGACY_SCOPE || report.checks.scene_fidelity >= minimumScore) &&
    (!hasNarration || report.checks.narration_alignment >= minimumScore);
  return { report, state: uncertain ? 'uncertain' : qualifies ? 'passed' : report.verdict === 'fail' ? 'failed' : 'uncertain' };
}
