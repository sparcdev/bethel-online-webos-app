// Search screen — debounced query against Streann's search/content endpoint.
import { searchContent } from '../api.js';
import { push, pop } from '../router.js';
import { onRemote } from '../remote.js';
import { initNav, setRoot, focus, refresh as refreshNav } from '../nav.js';
import { createTile, isChannel } from '../components/tile.js';

// Streann's content-search returns hits like { contentId, contentType, contentName, contentDesc, ... }.
// Normalise so the existing tile component can pick them up.
function normalizeHit(h) {
  if (!h || typeof h !== 'object') return null;
  return {
    id:          h.contentId   || h.id || h.vodId || h.channelId,
    type:        h.contentType || h.type,
    name:        h.contentName || h.name || h.title,
    image:       h.image       || h.imageUrl || h.thumbnail,
    backgroundImage: h.backgroundImage,
    seriesId:    h.seriesId,
    seriesName:  h.seriesName,
    duration:    h.duration,
    date:        h.date,
    releasedYear: h.releasedYear,
    infos: Array.isArray(h.infos) ? h.infos : (h.contentName ? [{ languageCode: 'en', name: h.contentName, description: h.contentDesc }] : null),
  };
}

function flattenResults(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp.map(normalizeHit).filter(Boolean);
  const out = [];
  ['vods', 'series', 'channels', 'content', 'items', 'results']
    .forEach(k => { if (Array.isArray(resp[k])) out.push(...resp[k]); });
  return out.map(normalizeHit).filter(Boolean);
}

export function createSearchScreen() {
  const cleanup = [];
  let debounceTimer = 0;
  let lastQuery = '';

  return {
    async mount(root) {
      root.innerHTML = `
        <div class="search">
          <div class="search-header">
            <span class="search-back-hint">BACK</span>
            <input type="search" id="search-input" placeholder="Search…" autocomplete="off" autocorrect="off" autocapitalize="off">
          </div>
          <div class="search-results" id="results">
            <div class="search-empty">Type to search Bethel content.</div>
          </div>
        </div>
      `;

      const input   = root.querySelector('#search-input');
      const results = root.querySelector('#results');

      initNav();
      setRoot(results);

      // BACK from search → home
      cleanup.push(onRemote('back', async (e) => {
        e.detail.originalEvent.preventDefault();
        await pop();
      }));

      // UP/DOWN: move between input and results
      cleanup.push(onRemote('down', (e) => {
        if (document.activeElement === input) {
          const first = results.querySelector('[data-focusable]');
          if (first) {
            input.blur();
            focus(first);
            e.detail.originalEvent.preventDefault();
          }
        }
      }));
      cleanup.push(onRemote('up', (e) => {
        if (document.activeElement !== input) {
          // If focus is on a tile in the topmost row, send back to input.
          const focused = root.querySelector('.is-focused');
          const grid = results.querySelector('.search-grid');
          if (focused && grid && grid.contains(focused)) {
            const cells = Array.from(grid.querySelectorAll('[data-focusable]'));
            const idx = cells.indexOf(focused);
            const cols = Math.max(1, Math.floor(grid.clientWidth / 296)); // ~tile width + gap
            if (idx < cols) {
              focused.classList.remove('is-focused');
              input.focus();
              e.detail.originalEvent.preventDefault();
            }
          }
        }
      }));

      // Debounced search
      input.addEventListener('input', () => {
        const q = input.value.trim();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (!q) {
          results.innerHTML = `<div class="search-empty">Type to search Bethel content.</div>`;
          return;
        }
        debounceTimer = setTimeout(() => doSearch(q), 250);
      });

      // Focus the input on mount so the on-screen keyboard appears.
      setTimeout(() => input.focus(), 50);

      async function doSearch(q) {
        if (q === lastQuery) return;
        lastQuery = q;
        results.innerHTML = `<div class="search-loading">Searching…</div>`;
        let resp;
        try {
          resp = await searchContent(q);
        } catch (err) {
          results.innerHTML = `<div class="search-error">Search failed: ${escapeHtml(err.message)}</div>`;
          return;
        }
        if (q !== input.value.trim()) return; // stale

        const items = flattenResults(resp).filter(it => it && it.id);
        if (!items.length) {
          results.innerHTML = `<div class="search-empty">No results for "${escapeHtml(q)}".</div>`;
          return;
        }

        results.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'search-grid';
        items.forEach(it => {
          const tile = createTile(it, () => {
            if (isChannel(it)) push('player', { item: it });
            else               push('detail', { item: it });
          });
          grid.appendChild(tile);
        });
        results.appendChild(grid);
        refreshNav();
      }
    },

    unmount() {
      if (debounceTimer) clearTimeout(debounceTimer);
      cleanup.forEach(fn => fn && fn());
      cleanup.length = 0;
    },
  };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
}
