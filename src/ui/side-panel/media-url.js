(function (root) {
  function normalize(url) {
    return String(url || '').trim().split(/[?#]/)[0];
  }

  root.MediaUrlTools = { normalize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
