// Detail screen with two modes:
//   - LAYOUT mode: when the clicked tile's seriesName matches a hidden top-level
//     layout (e.g. "Sermons", "Worship"), render that layout's sub-categories
//     as rows of tiles. Mirrors bethel.online's /en/vods/<slug> archive page.
//   - VOD mode: regular series detail with seasons + episodes.
import { getVodDetails, getSeasonEpisodes } from '../api.js';
import { push, pop } from '../router.js';
import { onRemote } from '../remote.js';
import { initNav, setRoot, focus, refresh as refreshNav, getFocused } from '../nav.js';
import { getState, setState } from '../store.js';
import { createTile } from '../components/tile.js';
import { createRow } from '../components/row.js';

function localizedDesc(infos) {
  if (!Array.isArray(infos) || !infos.length) return '';
  const en = infos.find(i => i && i.languageCode === 'en') || infos[0];
  return (en && en.description) || '';
}
function localizedName(infos, fallback) {
  if (!Array.isArray(infos) || !infos.length) return fallback || '';
  const en = infos.find(i => i && i.languageCode === 'en') || infos[0];
  return (en && en.name) || fallback || '';
}
function pickHero(vodOrItem) {
  if (!vodOrItem) return null;
  return vodOrItem.backgroundImage || vodOrItem.posterImage || vodOrItem.image || null;
}
function formatDuration(s) {
  if (!s || isNaN(s)) return '';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Match the clicked tile's seriesName to a top-level layout.
function findLayoutForItem(item) {
  if (!item || !item.seriesName) return null;
  const layout = (getState().tabLayout && getState().tabLayout.layouts) || [];
  const target = String(item.seriesName).trim().toLowerCase();
  // Skip layouts[0] (Home) — it's the homepage itself.
  for (let i = 1; i < layout.length; i++) {
    const l = layout[i];
    if (!l) continue;
    const name = String(l.nameEn || l.name || '').trim().toLowerCase();
    if (name && name === target && Array.isArray(l.categories) && l.categories.length) {
      return l;
    }
  }
  return null;
}

export function createDetailScreen() {
  const cleanup = [];

  return {
    async mount(root, params = {}) {
      const originalItem = params.item || {};
      initNav();

      // Channels should never reach the detail screen, but if they do
      // (e.g. an unexpected entry in CW), forward to the player.
      const isChannel = originalItem.type === 'channel'
        || (originalItem.channelId && !originalItem.vodId && !originalItem.seriesId);
      if (isChannel) {
        await pop();
        push('player', { item: originalItem });
        return;
      }

      // Try LAYOUT mode first
      const layout = findLayoutForItem(originalItem);
      if (layout) {
        renderLayoutMode(root, originalItem, layout, cleanup);
      } else {
        await renderVodMode(root, originalItem, cleanup);
      }
    },

    unmount() {
      const f = getFocused();
      if (f && f.dataset && f.dataset.id) {
        const lf = getState().lastFocus || {};
        lf.detail = f.dataset.id;
        setState({ lastFocus: lf });
      }
      cleanup.forEach(fn => fn && fn());
      cleanup.length = 0;
    },
  };
}

/* ============================================================
 * LAYOUT MODE — bethel.online's /en/vods/<slug> equivalent
 * ============================================================
 * Shows layout title + each sub-category as a row of tiles.
 * Clicking a tile pushes a fresh detail screen for that item.
 */
function renderLayoutMode(root, originalItem, layout, cleanup) {
  const layoutName = layout.nameEn || layout.name || originalItem.seriesName || '';
  // For backdrop, use the originally clicked tile's image.
  const heroBg = pickHero(originalItem);

  root.innerHTML = `
    <div class="detail" id="detail-root">
      <div class="detail-backdrop" id="backdrop"></div>
      <div class="detail-fade"></div>
      <div class="detail-content">
        <h1 class="detail-title">${escapeHtml(layoutName)}</h1>
        <p class="detail-meta" id="d-meta"></p>
        <div class="layout-rows" id="layout-rows"></div>
      </div>
    </div>
  `;
  if (heroBg) root.querySelector('#backdrop').style.backgroundImage = `url("${heroBg}")`;

  const rowsEl = root.querySelector('#layout-rows');
  const metaEl = root.querySelector('#d-meta');

  // Total item count for meta line
  let total = 0;
  layout.categories.forEach(c => { total += (c.content || c.vods || []).length; });
  metaEl.textContent = `${layout.categories.length} ${layout.categories.length === 1 ? 'category' : 'categories'} · ${total} items`;

  layout.categories.forEach(cat => {
    const en = (cat.categoryInfos || []).find(i => i.languageCode === 'en') || (cat.categoryInfos || [])[0] || {};
    const name = en.name || cat.name || '';
    const items = cat.content || cat.vods || [];
    if (!items.length) return;
    rowsEl.appendChild(createRow(name, items, (it) => push('detail', { item: it })));
  });

  setRoot(root.querySelector('#detail-root'));
  const first = root.querySelector('[data-focusable]');
  if (first) focus(first);
  else refreshNav();

  cleanup.push(onRemote('back', async (e) => {
    e.detail.originalEvent.preventDefault();
    await pop();
  }));
}

/* ============================================================
 * VOD MODE — single VOD or small series with seasons
 * ============================================================ */
async function renderVodMode(root, originalItem, cleanup) {
  let activeSeasonIdx = 0;
  let seasons = [];

  root.innerHTML = `
    <div class="detail" id="detail-root">
      <div class="detail-backdrop" id="backdrop"></div>
      <div class="detail-fade"></div>
      <div class="detail-content">
        <h1 class="detail-title" id="d-title">Loading…</h1>
        <p class="detail-meta" id="d-meta"></p>
        <p class="detail-desc" id="d-desc"></p>
        <div class="detail-actions">
          <button class="btn-primary" id="play-btn" data-focusable tabindex="-1">▶ Play</button>
        </div>
        <div class="seasons" id="seasons" hidden>
          <h2 class="seasons-title">Seasons</h2>
          <div class="season-tabs" id="season-tabs"></div>
        </div>
        <div class="episodes" id="episodes"></div>
      </div>
    </div>
  `;

  const detailRoot = root.querySelector('#detail-root');
  const backdrop  = root.querySelector('#backdrop');
  const titleEl   = root.querySelector('#d-title');
  const metaEl    = root.querySelector('#d-meta');
  const descEl    = root.querySelector('#d-desc');
  const playBtn   = root.querySelector('#play-btn');
  const seasonsEl = root.querySelector('#seasons');
  const tabsEl    = root.querySelector('#season-tabs');
  const epsEl     = root.querySelector('#episodes');

  setRoot(detailRoot);
  focus(playBtn);

  cleanup.push(onRemote('back', async (e) => {
    e.detail.originalEvent.preventDefault();
    await pop();
  }));

  // Tentative title from the source tile
  const tentTitle =
    originalItem.seriesId
      ? (originalItem.seriesName || localizedName(originalItem.seriesInfos))
      : (originalItem.name || localizedName(originalItem.infos));
  titleEl.textContent = tentTitle || '';
  const tentBg = pickHero(originalItem);
  if (tentBg) backdrop.style.backgroundImage = `url("${tentBg}")`;

  const userId = (getState().user && (getState().user.id || getState().user._id)) || '';
  let detail;
  try {
    detail = await getVodDetails(originalItem.id, { seriesId: originalItem.seriesId, userId });
  } catch (err) {
    descEl.textContent = "Couldn't load details: " + err.message;
    return;
  }
  const vod = detail.vod || {};
  seasons = Array.isArray(detail.seasons) ? detail.seasons.slice() : [];

  const isSeries = !!originalItem.seriesId;
  const heroName = isSeries
    ? (localizedName(originalItem.seriesInfos, originalItem.seriesName) || tentTitle)
    : (localizedName(vod.infos, vod.name) || tentTitle);
  titleEl.textContent = heroName;

  const heroBg = pickHero(vod) || tentBg;
  if (heroBg) backdrop.style.backgroundImage = `url("${heroBg}")`;

  const metaParts = [];
  if (vod.releasedYear) metaParts.push(vod.releasedYear);
  else if (vod.year)    metaParts.push(vod.year);
  if (vod.duration)     metaParts.push(formatDuration(vod.duration));
  if (seasons.length > 1) metaParts.push(`${seasons.length} seasons`);
  metaEl.textContent = metaParts.join(' · ');

  const seriesDesc = localizedDesc(originalItem.seriesInfos);
  const vodDesc = localizedDesc(vod.infos);
  descEl.textContent = (isSeries && seriesDesc) ? seriesDesc : vodDesc;

  playBtn.addEventListener('rc:activate', () => push('player', { item: vod, original: originalItem }));
  playBtn.addEventListener('click',       () => push('player', { item: vod, original: originalItem }));

  if (seasons.length) {
    seasons.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (seasons.length > 1) {
      seasonsEl.hidden = false;
      seasons.forEach((s, idx) => {
        const tab = document.createElement('button');
        tab.className = 'season-tab';
        tab.tabIndex = -1;
        tab.setAttribute('data-focusable', '');
        const en = (s.categoryInfos || []).find(i => i.languageCode === 'en') || (s.categoryInfos || [])[0] || {};
        tab.textContent = en.name || s.name || `Season ${idx + 1}`;
        tab.addEventListener('rc:activate', () => selectSeason(idx));
        tab.addEventListener('click',       () => selectSeason(idx));
        tabsEl.appendChild(tab);
      });
    }
    await selectSeason(0);
  }
  refreshNav();

  function paintSeasonTabs() {
    tabsEl.querySelectorAll('.season-tab').forEach((t, i) =>
      t.classList.toggle('is-active', i === activeSeasonIdx)
    );
  }
  async function selectSeason(idx) {
    activeSeasonIdx = idx;
    paintSeasonTabs();
    const season = seasons[idx];
    epsEl.innerHTML = `<div class="episodes-loading">Loading episodes…</div>`;
    let items = [];
    try {
      const ep = await getSeasonEpisodes(season.id, originalItem.seriesId || season.seriesId, userId);
      if (Array.isArray(ep)) items = ep;
      else if (ep && typeof ep === 'object') items = ep.content || ep.vods || ep.items || [];
    } catch {
      items = season.content || season.vods || [];
    }
    if (!items.length) items = season.content || season.vods || [];

    // Sort newest → oldest by `date` (epoch ms). Falls back to releasedYear or order.
    items = items.slice().sort((a, b) => {
      const ad = Number(a && a.date) || 0;
      const bd = Number(b && b.date) || 0;
      if (bd !== ad) return bd - ad;
      const ay = Number(a && a.releasedYear) || 0;
      const by = Number(b && b.releasedYear) || 0;
      if (by !== ay) return by - ay;
      return (a && a.order || 0) - (b && b.order || 0);
    });

    epsEl.innerHTML = '';
    if (!items.length) {
      epsEl.innerHTML = `<div class="episodes-empty">No episodes</div>`;
      refreshNav();
      return;
    }
    const track = document.createElement('div');
    track.className = 'episodes-track';
    items.forEach(ep => {
      const tile = createTile(ep, () => push('player', { item: ep }), { variant: 'episode' });
      track.appendChild(tile);
    });
    epsEl.appendChild(track);
    refreshNav();
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
}
