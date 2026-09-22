(function (root) {
  function normalizeTileUrl(url) {
    return String(url || '').trim().split(/[?#]/)[0];
  }

  function tileKey(tile) {
    const url = normalizeTileUrl(tile?.imgSrc);
    if (!url) return '';
    return `${url}|${String(tile?.title || '').trim()}`;
  }

  function chooseNewTile(beforeTiles, afterTiles) {
    const before = Array.isArray(beforeTiles) ? beforeTiles : [];
    const after = Array.isArray(afterTiles) ? afterTiles : [];
    const beforeUrls = new Set(before.map(tile => normalizeTileUrl(tile?.imgSrc)).filter(Boolean));
    const beforeKeys = new Set(before.map(tileKey).filter(Boolean));

    return after.find(tile => {
      const url = normalizeTileUrl(tile?.imgSrc);
      return url && !beforeUrls.has(url) && !beforeKeys.has(tileKey(tile));
    }) || null;
  }

  root.RerollTileFallback = { chooseNewTile, normalizeTileUrl, tileKey };
})(typeof globalThis !== 'undefined' ? globalThis : this);
