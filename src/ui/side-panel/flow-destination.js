(function (root) {
  const FLOW_HOST = 'flow.google.com';

  function normalizeFlowUrl(value) {
    const input = String(value || '').trim();
    if (!input) return '';

    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== FLOW_HOST) return '';
      if (url.pathname.length > 1) {
        url.pathname = url.pathname.replace(/\/+$/, '');
      }
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function isSameFlowUrl(actualUrl, expectedUrl) {
    const actual = normalizeFlowUrl(actualUrl);
    const expected = normalizeFlowUrl(expectedUrl);
    return Boolean(actual && expected && actual === expected);
  }

  function chooseFlowTab(tabs, expectedUrl) {
    const available = Array.isArray(tabs) ? tabs.filter(tab => normalizeFlowUrl(tab && tab.url)) : [];
    const expected = normalizeFlowUrl(expectedUrl);
    if (expected) {
      const exact = available.find(tab => isSameFlowUrl(tab.url, expected));
      if (exact) return exact;
    }

    return [...available].sort((a, b) => {
      const score = tab => (tab.active ? 4 : 0) + (String(tab.url || '').includes('/project/') ? 2 : 0);
      return score(b) - score(a);
    })[0] || null;
  }

  root.FlowDestination = {
    normalizeFlowUrl,
    isSameFlowUrl,
    chooseFlowTab
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
