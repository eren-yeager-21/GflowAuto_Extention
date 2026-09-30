import { getSpecLogContext } from './pipeline-generation.js';

const normalize = value => String(value || '').replace(/\s+/g, ' ').replace(/(?:…|\.{2,})$/, '').trim().toLowerCase();
const mediaIdentity = value => String(value || '').replace(/=(?:s|w|h)\d+[^?]*(?:\?.*)?$/, '');
const unmatchedAttempts = new Map();

function attachmentFailure(stage, details = {}) {
  try {
    chrome.runtime.sendMessage({ type: 'ACTION_LOG', data: {
      source: 'spec-pipeline', level: 'error', timestamp: Date.now(),
      ...getSpecLogContext(), message: `Flow reference attachment stopped: ${stage}.`,
      details
    } }).catch(() => {});
  } catch { /* Diagnostic logging must not alter reference selection. */ }
  return false;
}

// Edited references require a real Flow attachment. Prefer the selected asset's
// identity over its caption; duplicate captions cannot identify an image.
export function findStrictReferenceOption(popover, name, asset) {
  let items = Array.from(popover.querySelectorAll('flow-add-menu-asset-list button[role="option"]'));
  if (!items.length) items = Array.from(popover.querySelectorAll(
    'flow-add-menu-asset-list div.cdk-virtual-scroll-content-wrapper > div:has(img), flow-character-tile, button:has(img)'));
  const assetKind = item => {
    if (item.matches('flow-character-tile')) return 'character';
    const labels = [item.getAttribute('data-asset-type'), item.getAttribute('data-type'),
      item.querySelector('.type-subtitle, .subtitle, .asset-type, [class*="asset-type"]')?.textContent,
      ...(item.innerText || '').split('\n'),
      ...(item.textContent || '').split('\n'),
      ...Array.from(item.querySelectorAll('small, span, div')).filter(node => !node.children.length).map(node => node.textContent)];
    const kinds = labels.map(value => String(value || '').trim().toLowerCase());
    if (kinds.includes('character')) return 'character';
    if (kinds.includes('image')) return 'image';
    if (kinds.some(value => /^(?:videos?|avatars?|voices?|audios?)$/.test(value)) || item.querySelector('video')) return 'other';
    return 'unknown';
  };
  // All displays both a Character and an Image when they share a title.
  // Only the Image represents the ordinary Flow image requested by the spec.
  const imageItems = items.filter(item => assetKind(item) === 'image');
  items = imageItems.length ? imageItems : items.filter(item => assetKind(item) === 'unknown');
  const id = asset?.tileId || asset?.tile_id;
  const preview = mediaIdentity(asset?.previewUrl || asset?.preview_url);
  const target = normalize(name);
  const labels = item => [
    item.getAttribute('title'), item.getAttribute('aria-label'),
    item.querySelector('.asset-title, .asset-name, .footer-title, [class*="name"]')?.textContent,
    item.querySelector('img')?.getAttribute('alt'), item.innerText?.split('\n')[0],
    item.textContent?.split('\n')[0]
  ].filter(Boolean);
  const exactTitleMatches = () => items.filter(item => labels(item).some(value => normalize(value) === target));
  const query = popover.querySelector('input.search-input, input[placeholder*="Search" i]')?.value;
  const uniqueSearchedImage = () => items.length === 1 && normalize(query) === target && labels(items[0]).some(value => {
    const clipped = normalize(value);
    return clipped.length >= 12 && target.startsWith(clipped);
  });
  const matched = item => { unmatchedAttempts.delete(target); return item; };
  const noMatch = reason => {
    const previous = unmatchedAttempts.get(target);
    const count = previous && Date.now() - previous.started < 30000 ? previous.count + 1 : 1;
    unmatchedAttempts.set(target, { count, started: previous && count > 1 ? previous.started : Date.now() });
    if (count === 20) attachmentFailure('no unique Image result matched', {
      reason, query: popover.querySelector('input.search-input, input[placeholder*="Search" i]')?.value || '',
      expectedTitle: name, hasTileId: !!id, hasPreviewUrl: !!preview,
      results: items.map(item => ({ kind: assetKind(item), labels: labels(item).map(value => String(value).slice(0, 100)) }))
    });
    return null;
  };
  if (id || preview) {
    const named = exactTitleMatches();
    const matches = items.filter(item => {
      const native = item.getAttribute('data-tile-id') || item.querySelector('[data-media-id]')?.getAttribute('data-media-id');
      return (id && native === id) || (preview && Array.from(item.querySelectorAll('img')).some(img => mediaIdentity(img.src) === preview));
    });
    if (matches.length === 1 && (!named.length || named.includes(matches[0]))) return matched(matches[0]);
    // Flow can change a generated image's tile ID and media URL after editing,
    // or serve different URL variants in its grid and reference picker. A name
    // fallback is safe only when a full project scan verified this tag unique.
    // Grid URLs and tile IDs can change after editing. A single Image result
    // for the exact typed query is a safe fallback even with a stale identity.
    if (named.length === 1 && (asset?.uniqueTitleVerified || uniqueSearchedImage())) return matched(named[0]);
    if (!named.length && uniqueSearchedImage()) return matched(items[0]);
    return noMatch('saved image identity was not found');
  }
  const matches = exactTitleMatches();
  if (matches.length === 1) return matched(matches[0]);
  // Flow can shorten a result title in the DOM, with or without an ellipsis.
  // Accept a substantial prefix only for one Image result and the exact query.
  if (matches.length || items.length !== 1 || normalize(query) !== target) return noMatch('title or Image result count did not match');
  return uniqueSearchedImage() ? matched(items[0]) : noMatch('truncated title did not match search query');
}

export async function attachFlowReferenceOption(item, pressKey, requireImage = false) {
  const popover = item.closest('flow-add-menu-popover-content');
  const options = () => Array.from(popover?.querySelectorAll('flow-add-menu-asset-list button[role="option"]') || []);
  const targetIndex = options().indexOf(item);
  const search = popover?.querySelector('input.search-input, input[placeholder*="Search" i], input[type="search"]');
  if (targetIndex < 0 || !search) return attachmentFailure('result row or search field missing', { targetIndex, hasSearch: !!search });
  // Current Flow places image attachments in the ingredient bar, outside the
  // rich-text editor. Older variants used an inline ProseMirror mention.
  const imageIngredients = () => Array.from(document.querySelectorAll(
    'flow-ingredient-bar flow-image-ingredient-chip button.chip-container'));
  const allIngredients = () => Array.from(document.querySelectorAll(
    'flow-ingredient-bar flow-ingredient-chip button.chip-container'));
  const imageIngredientsBefore = imageIngredients().length;
  const allIngredientsBefore = allIngredients().length;
  const mentions = () => Array.from(document.querySelectorAll('flow-rich-text-editor .mention-chip'));
  const mentionsBefore = mentions().length;
  const attachmentState = () => {
    const addedImages = imageIngredients().slice(imageIngredientsBefore);
    if (addedImages.length) return addedImages.every(chip => chip.getAttribute('aria-busy') !== 'true') ? true : null;
    if (!requireImage && allIngredients().length > allIngredientsBefore) return true;
    const chips = mentions();
    if (chips.length <= mentionsBefore) return null;
    const kind = chips.at(-1)?.getAttribute('data-reference-type');
    return !requireImage || kind === 'media';
  };
  const waitForAttachment = async timeoutMs => {
    const deadline = Date.now() + timeoutMs;
    do {
      const state = attachmentState();
      if (state !== null) return state;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return attachmentState();
  };
  search.focus();

  // Flow uses the active row, which can differ from the clicked row when a
  // Character and Image share a name. Select the exact row with trusted keys.
  for (let step = 0; step <= options().length; step++) {
    const rows = options();
    const activeIndex = rows.findIndex(row => row.classList.contains('asset-item-active'));
    if (activeIndex === targetIndex) break;
    const down = activeIndex < targetIndex;
    if (!await pressKey(down ? 'ArrowDown' : 'ArrowUp', down ? 'ArrowDown' : 'ArrowUp', down ? 40 : 38))
      return attachmentFailure('could not move picker selection', { targetIndex, activeIndex });
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  if (!options()[targetIndex]?.classList.contains('asset-item-active'))
    return attachmentFailure('matching result did not become active', { targetIndex });
  if (!await pressKey('Enter', 'Enter', 13)) return attachmentFailure('could not open selected result');
  const afterSelection = await waitForAttachment(500);
  if (afterSelection !== null) return afterSelection;

  // The All picker can treat Enter as "preview this result". In that state
  // the selected asset is shown beside an explicit Add to prompt button.
  const visibleAddButton = () => Array.from(document.querySelectorAll('button, [role="button"]')).find(button => {
    if (!/^add to prompt$/i.test((button.textContent || '').replace(/\s+/g, ' ').trim()) ||
        button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 &&
      rect.left < innerWidth && rect.right > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  let addButton = visibleAddButton();
  for (let attempt = 0; !addButton && attempt < 80; attempt++) {
    const state = attachmentState();
    if (state !== null) return state;
    await new Promise(resolve => setTimeout(resolve, 100));
    addButton = visibleAddButton();
  }
  if (!addButton) return attachmentFailure('Add to prompt button never became available', {
    visibleButtons: Array.from(document.querySelectorAll('button')).filter(button =>
      /add to prompt/i.test(button.textContent || '')).map(button => ({ disabled: !!button.disabled,
        ariaDisabled: button.getAttribute('aria-disabled') }))
  });
  // Flow may recreate the result row when it opens the preview, so the old
  // row node is not a reliable identity check here.
  // Enter on the focused Add button is the same path verified in Flow's UI.
  // It commits once; a delayed response is observed, never submitted again.
  addButton.focus();
  if (document.activeElement !== addButton) return attachmentFailure('could not focus Add to prompt button');
  if (!await pressKey('Enter', 'Enter', 13)) return attachmentFailure('Add to prompt key press failed');
  const attached = await waitForAttachment(12000);
  return attached === true || attachmentFailure('no image chip appeared in prompt box after Add', {
    imageIngredientsBefore, imageIngredientsAfter: imageIngredients().length,
    editorMentionsBefore: mentionsBefore, editorMentionsAfter: mentions().length,
    latestEditorMentionType: mentions().at(-1)?.getAttribute('data-reference-type') || null
  });
}
