(function (root) {
  function normalizeSnapshot(value) {
    if (!value || typeof value !== 'object' || !value.result_url) return null;
    return {
      result_url: value.result_url,
      flow_tile_title: value.flow_tile_title || null,
      completed_at: value.completed_at || null
    };
  }

  function snapshotFrame(frame) {
    if (!frame || !frame.result_url) return null;
    return normalizeSnapshot(frame);
  }

  function begin(frame) {
    if (!frame) return null;
    frame.reroll_pending_previous = snapshotFrame(frame);
    return frame.reroll_pending_previous;
  }

  function commit(frame) {
    if (!frame?.reroll_pending_previous) return false;
    frame.reroll_previous = normalizeSnapshot(frame.reroll_pending_previous);
    frame.reroll_pending_previous = null;
    return Boolean(frame.reroll_previous);
  }

  function cancel(frame) {
    if (frame) frame.reroll_pending_previous = null;
  }

  function restore(frame) {
    const previous = normalizeSnapshot(frame?.reroll_previous);
    if (!frame || !previous) return false;
    frame.result_url = previous.result_url;
    frame.flow_tile_title = previous.flow_tile_title;
    frame.completed_at = previous.completed_at || new Date().toISOString();
    frame.status = 'completed';
    frame.progress = 100;
    frame.error = null;
    frame.capture_conflict = null;
    frame.reroll_previous = null;
    frame.reroll_pending_previous = null;
    return true;
  }

  root.RerollHistory = {
    normalizeSnapshot,
    snapshotFrame,
    begin,
    commit,
    cancel,
    restore
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
