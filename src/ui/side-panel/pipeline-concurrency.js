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

  // Only the submitter touches the shared prompt editor. Completion watchers
  // overlap and free their slot as soon as that particular image finishes.
  async function runIndependentBatch(items, options) {
    const active = new Set();
    const results = [];
    let failed = false;
    const stopped = () => failed || options.isCancelled?.();
    const record = (item, success, value, error) => {
      const result = { item, success, value, error };
      results.push(result);
      if (!success) failed = true;
      options.onResult?.(result);
    };
    for (const item of items) {
      while (active.size >= normalizeMaxParallel(options.maxParallel) && !stopped()) {
        await Promise.race(active);
      }
      if (stopped()) break;
      let submission;
      try {
        submission = await options.submit(item);
      } catch (error) {
        record(item, false, null, error);
        break;
      }
      const completion = Promise.resolve().then(() => options.complete(item, submission))
        .then(value => record(item, true, value), error => record(item, false, null, error))
        .finally(() => active.delete(completion));
      active.add(completion);
    }
    await Promise.all(active);
    return results;
  }

  root.PipelineConcurrency = {
    DEFAULT_MAX_PARALLEL,
    normalizeMaxParallel,
    isDependentFrame,
    buildExecutionPlan,
    runIndependentBatch
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
