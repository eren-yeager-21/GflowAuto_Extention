(function (root) {
  function tileKey(tile) {
    if (!tile || !tile.imgSrc) return '';
    return `${String(tile.imgSrc).trim()}|${String(tile.title || '').trim()}`;
  }

  function chooseNewTile(beforeTiles, afterTiles) {
    const before = Array.isArray(beforeTiles) ? beforeTiles : [];
    const after = Array.isArray(afterTiles) ? afterTiles : [];
    const beforeUrls = new Set(before.map(tile => String(tile?.imgSrc || '').trim()).filter(Boolean));
    const beforeKeys = new Set(before.map(tileKey).filter(Boolean));

    return after.find(tile => {
      const url = String(tile?.imgSrc || '').trim();
      return url && !beforeUrls.has(url) && !beforeKeys.has(tileKey(tile));
    }) || null;
  }

  root.RerollTileFallback = { chooseNewTile, tileKey };
})(typeof globalThis !== 'undefined' ? globalThis : this);