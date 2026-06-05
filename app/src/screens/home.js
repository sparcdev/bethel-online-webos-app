// Real home screen — fetches tab-layout, renders rows from layouts[0].categories.
import { CONFIG } from '../config.js';
import { apiFetch, getUserProfile, withReseller } from '../api.js';
import { logout } from '../auth.js';
import { push } from '../router.js';
import { onRemote } from '../remote.js';
import { initNav, setRoot, focus, refresh as refreshNav } from '../nav.js';
import { getState, setState } from '../store.js';
import { createRow, createSkeletonRow } from '../components/row.js';

async function fetchTabLayout() {
  const params = withReseller({ dt: 'web', ln: CONFIG.defaultLang });
  try {
    return await apiFetch(`/web/services/v3/user/tab-layout?${params}`);
  } catch {
    return apiFetch(`/web/services/v3/external/tab-layout?${params}`);
  }
}

async function fetchContinueWatching(userId) {
  if (!userId) return null;
  try {
    return await apiFetch(
      `/web/services/v3/user/cw/${encodeURIComponent(userId)}/ct/vod?${withReseller()}`
    );
  } catch {
    return null;
  }
}

// The home tab is layouts[0]; its `categories[]` are the rows.
function extractRowsFromHome(layoutResp) {
  if (!layoutResp || !Array.isArray(layoutResp.layouts)) return [];
  const home = layoutResp.layouts[0];
  if (!home || !Array.isArray(home.categories)) return [];

  const rows = [];
  for (const cat of home.categories) {
    if (cat.type !== 'vod' && cat.type !== 'channel' && cat.type !== 'series') continue;
    const items = cat.content || [];
    if (!items.length) continue;
    const infos = cat.categoryInfos || [];
    const en = infos.find(i => i && i.languageCode === 'en') || infos[0] || {};
    rows.push({ name: en.name || cat.name || '', items });
  }
  return rows;
}

export function createHomeScreen() {
  const cleanup = [];

  return {
    async mount(root) {
      root.innerHTML = `
        <div class="home">
          <header class="home-header">
            <img class="home-brand" src="icons/largeIcon.png" alt="Bethel ONLINE">
            <button class="home-search-btn" id="search-btn" data-focusable tabindex="-1" aria-label="Search">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span>Search</span>
            </button>
            <div class="home-spacer"></div>
            <div class="home-user" id="user-badge">…</div>
          </header>
          <div class="home-rows" id="rows"></div>
          <p class="home-hint">RED = search · BLUE = sign out · BACK = exit</p>
        </div>
      `;
      const searchBtn = root.querySelector('#search-btn');
      searchBtn.addEventListener('rc:activate', () => push('search'));
      searchBtn.addEventListener('click',       () => push('search'));

      const rowsEl = root.querySelector('#rows');
      const userBadge = root.querySelector('#user-badge');

      // Skeletons while loading
      ['Continue Watching', 'Highlights', 'Online Gathering Replay', 'Events', 'Speakers']
        .forEach(name => rowsEl.appendChild(createSkeletonRow(name)));

      initNav();
      // Set root to the whole .home container so the search button is reachable.
      setRoot(root.querySelector('.home'));

      let user = getState().user;
      if (!user) {
        try { user = await getUserProfile(); setState({ user }); }
        catch { user = null; }
      }
      const u = user || {};
      const userId = u.id || u._id || u.userId;
      const userName = u.firstName || u.username || u.email || '';
      userBadge.textContent = userName ? `Signed in as ${userName}` : '';

      let layout = getState().tabLayout;
      let cw = null;
      try {
        const [layoutResp, cwResp] = await Promise.all([
          fetchTabLayout(),
          fetchContinueWatching(userId),
        ]);
        layout = layoutResp;
        cw = cwResp;
        setState({ tabLayout: layout });
      } catch (err) {
        rowsEl.innerHTML = `<div class="home-error">
          <p>Couldn't load content.</p>
          <p class="home-error-detail">${(err && err.message) || ''}</p>
        </div>`;
        return;
      }

      rowsEl.innerHTML = '';
      const onTile = (item) => {
        const isChannel = item && (item.type === 'channel' || (item.channelId && !item.vodId && !item.seriesId));
        if (isChannel) push('player', { item });
        else           push('detail', { item });
      };

      // CW row first if any items
      const cwItems = cw && (cw.vods || cw.content || cw.items || (Array.isArray(cw) ? cw : null));
      if (Array.isArray(cwItems) && cwItems.length) {
        rowsEl.appendChild(createRow('Continue Watching', cwItems, onTile));
      }

      const rows = extractRowsFromHome(layout);
      if (!rows.length) {
        rowsEl.appendChild(Object.assign(document.createElement('p'), {
          className: 'home-error',
          textContent: 'No content available.',
        }));
      } else {
        rows.forEach(({ name, items }) => {
          rowsEl.appendChild(createRow(name, items, onTile));
        });
      }

      // Restore focus to the previously-selected tile (when returning from detail)
      const lf = (getState().lastFocus || {}).detail;
      const restored = lf
        ? rowsEl.querySelector(`[data-focusable][data-id="${CSS.escape(lf)}"]`)
        : null;
      const first = restored || rowsEl.querySelector('[data-focusable]');
      if (first) focus(first);
      else refreshNav();

      cleanup.push(onRemote('blue', async () => {
        logout();
        // Top-level transition resets the nav stack.
        const { navigate } = await import('../router.js');
        await navigate('login');
      }));
      cleanup.push(onRemote('red', () => push('search')));
    },

    unmount() {
      cleanup.forEach(fn => fn && fn());
      cleanup.length = 0;
    },
  };
}
