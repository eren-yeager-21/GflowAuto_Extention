(function (root) {
  const DEFAULT_MAX_PARALLEL = 3;

  function normalizeMaxParallel(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_PARALLEL;
    return Math.max(1, parsed);
  }

  function isDependentFrame(frame) {
    if (!frame || typeof frame !== 'object') return false;
    return Boolean(frame.frame_reference || frame.frame_ref) || frame.continuity === 'continue';
  }

  function partitionFrameIndexes(visuals) {
    const independent = [];
    const dependent = [];
    (Array.isArray(visuals) ? visuals : []).forEach((frame, index) => {
      (isDependentFrame(frame) ? dependent : independent).push(index);
    });
    return { independent, dependent };
  }

  root.PipelineConcurrency = {
    DEFAULT_MAX_PARALLEL,
    normalizeMaxParallel,
    isDependentFrame,
    partitionFrameIndexes
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
