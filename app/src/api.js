// Authenticated fetch wrapper for Streann's REST API.
import { CONFIG } from './config.js';
import { getState } from './store.js';
import { refresh, isExpired, logout } from './auth.js';

function commonHeaders() {
  return {
    'x-app-name': CONFIG.appName,
    'x-app-platform': CONFIG.appPlatform,
    'x-app-version': CONFIG.appVersion,
  };
}

async function ensureFreshToken() {
  if (!getState().accessToken) return;
  if (isExpired()) {
    try { await refresh(); }
    catch { logout(); throw new Error('Session expired'); }
  }
}

export async function apiFetch(path, opts = {}) {
  await ensureFreshToken();
  const url = path.startsWith('http') ? path : `${CONFIG.apiUrl}${path}`;
  const doFetch = async () => {
    const headers = {
      ...commonHeaders(),
      ...(opts.headers || {}),
    };
    if (getState().accessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${getState().accessToken}`;
    }
    return fetch(url, { ...opts, headers });
  };

  let res = await doFetch();
  if (res.status === 401 && getState().refreshToken) {
    // Retry once with a refreshed token.
    try { await refresh(); res = await doFetch(); }
    catch { logout(); throw new Error('Session expired'); }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  // Some endpoints return empty body on success.
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

// Append the reseller param to query strings consistently.
export function withReseller(params = {}) {
  return new URLSearchParams({ r: CONFIG.resellerId, ...params }).toString();
}

// ----- High-level endpoints -----

export async function getUserProfile() {
  return apiFetch(`/web/services/user/profile?${withReseller()}`);
}

export async function getTabLayout(langCode = CONFIG.defaultLang) {
  return apiFetch(`/web/services/v3/external/tab-layout?${withReseller({ ln: langCode })}`);
}

export async function getCategoryVods(categoryId, langCode = CONFIG.defaultLang) {
  return apiFetch(
    `/web/services/external/vods/category/${categoryId}?${withReseller({ ln: langCode })}`
  );
}

export async function getContinueWatching(userId, contentType = 'vod') {
  return apiFetch(`/web/services/v3/user/cw/${userId}/ct/${contentType}?${withReseller()}`);
}

// Streann's newer search endpoint, used by bethel.online today.
// Accepts a JSON body and returns an array of normalized hits.
export async function searchContent(query, langCode = CONFIG.defaultLang) {
  const body = JSON.stringify({
    lang: langCode,
    query: String(query || ''),
    keywords: null,
    parentalControl: null,
  });
  return apiFetch('https://content-search.services.c1.streann.com/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

// Fetch full VOD detail including the seasons array (year-based for series).
export async function getVodDetails(vodId, opts = {}) {
  const { seriesId, userId } = opts;
  const params = new URLSearchParams({ web: 'true', isFromTabLayout: 'false', r: CONFIG.resellerId });
  if (seriesId) params.set('seriesId', seriesId);
  if (userId)   params.set('userId', userId);
  return apiFetch(
    `/web/services/v3/user/season/vod-details/${encodeURIComponent(vodId)}?${params.toString()}`
  );
}

// List episodes inside a given season of a series.
export async function getSeasonEpisodes(seasonId, seriesId, userId) {
  const path = `/web/services/v3/user/vods/season/${encodeURIComponent(seasonId)}/series/${encodeURIComponent(seriesId)}` +
    (userId ? `/${encodeURIComponent(userId)}` : '');
  return apiFetch(`${path}?web=true&${withReseller()}`);
}
