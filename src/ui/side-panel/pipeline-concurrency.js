(function (root) {
  const DEFAULT_MAX_PARALLEL = 3;
  const MAX_PARALLEL = 10;

  function normalizeMaxParallel(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_PARALLEL;
    return Math.min(MAX_PARALLEL, Math.max(1, parsed));
  }

  function isDependentFrame(frame) {
    if (!frame || typeof frame !== 'object') return false;
    return Boolean(frame.frame_reference || frame.frame_ref) || frame.continuity === 'continue';
  }

  function buildExecutionPlan(visuals) {
    const plan = [];
    let independentIndexes = [];

    const flushIndependent = () => {
      if (independentIndexes.length === 0) return;
      plan.push({ type: 'independent', indexes: independentIndexes });
      independentIndexes = [];
    };

    (Array.isArray(visuals) ? visuals : []).forEach((frame, index) => {
      if (isDependentFrame(frame)) {
        flushIndependent();
        plan.push({ type: 'dependent', index });
      } else {
        independentIndexes.push(index);
      }
    });
    flushIndependent();
    return plan;
  }

  root.PipelineConcurrency = {
    DEFAULT_MAX_PARALLEL,
    MAX_PARALLEL,
    normalizeMaxParallel,
    isDependentFrame,
    buildExecutionPlan
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
