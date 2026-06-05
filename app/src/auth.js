// OAuth2 password grant + refresh against Streann.
import { CONFIG } from './config.js';
import { getState, setState } from './store.js';

const STORAGE_KEY = 'bethel_auth';

function persist() {
  const { accessToken, refreshToken, expiresAt } = getState();
  if (accessToken) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken, expiresAt }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.accessToken) return false;
    setState({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt || 0,
    });
    return true;
  } catch { return false; }
}

function authHeaders() {
  return {
    'Authorization': `Basic ${CONFIG.loginAuthorization}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'x-app-name': CONFIG.appName,
    'x-app-platform': CONFIG.appPlatform,
    'x-app-version': CONFIG.appVersion,
  };
}

async function tokenRequest(body) {
  const res = await fetch(`${CONFIG.apiUrl}/web/oauth/token?r=${CONFIG.resellerId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.message || `HTTP ${res.status}`);
  return json;
}

export async function login(username, password) {
  const body = new URLSearchParams();
  body.set('grant_type', 'password');
  body.set('username', String(username).toLowerCase().trim());
  body.set('password', password);
  body.set('scope', 'services');
  body.set('client_id', '66b741944939701227b45b6081d7e09d81ab17d4d88d4c228036800601a6');
  body.set('reseller_id', CONFIG.resellerId);
  const t = await tokenRequest(body);
  setState({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
  });
  persist();
  return t;
}

export async function refresh() {
  const { refreshToken } = getState();
  if (!refreshToken) throw new Error('No refresh token');
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);
  body.set('scope', 'services');
  body.set('client_id', '66b741944939701227b45b6081d7e09d81ab17d4d88d4c228036800601a6');
  body.set('reseller_id', CONFIG.resellerId);
  const t = await tokenRequest(body);
  setState({
    accessToken: t.access_token,
    refreshToken: t.refresh_token || refreshToken,
    expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
  });
  persist();
  return t;
}

export function logout() {
  setState({ accessToken: null, refreshToken: null, expiresAt: 0, user: null, tabLayout: null });
  persist();
}

export function isLoggedIn() {
  return !!getState().accessToken;
}

// Return true if the access token has fewer than `bufferMs` of validity left.
export function isExpired(bufferMs = 60_000) {
  const { expiresAt } = getState();
  return !expiresAt || Date.now() + bufferMs >= expiresAt;
}
