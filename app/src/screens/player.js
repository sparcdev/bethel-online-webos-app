// Native HLS player with TV-remote controls and local Continue Watching.
//
// Note on webOS: the platform's video handler clears the <video> src
// attribute on every remote-key press. We don't try to fight it — verified
// experimentally that no JS-level workaround prevents the reset reliably.
// Basic playback works fine; pausing via the OK button is unreliable as a
// result, which is a known platform limitation for custom HTML5 players.
import { CONFIG, getDeviceId } from '../config.js';
import { pop } from '../router.js';
import { onRemote } from '../remote.js';
import { getState } from '../store.js';
import { setRoot as setNavRoot } from '../nav.js';

const SKIP_SECONDS = 30;
const OVERLAY_HIDE_MS = 3000;
const SYNC_EVERY_MS = 15000;
const RESUME_SAVE_MIN_SEC = 5;
const RESUME_SAVE_FROM_END_SEC = 30;

function cwKey(id) { return 'cw_' + id; }

function buildLoadbalancerUrl(vodId, accessToken, isChannel) {
  const params = new URLSearchParams({
    'access_token': accessToken,
    'device-id':   getDeviceId(),
    'device-type': 'web',
    'device-name': 'web',
    'withCredentials': 'false',
    'doNotUseRedirect': 'true',
    'country_code': '',
  });
  const kind = isChannel ? 'channels' : 'vods';
  return `${CONFIG.apiUrl.replace(/^https?:/, 'https:')}/loadbalancer/services/v1/${kind}-secure/${encodeURIComponent(vodId)}/playlist.m3u8?${params.toString()}`;
}

async function resolveHlsUrl(vodId, accessToken, isChannel) {
  const lbUrl = buildLoadbalancerUrl(vodId, accessToken, isChannel);
  const res = await fetch(lbUrl);
  if (!res.ok) throw new Error('HLS lookup HTTP ' + res.status);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = await res.json();
    if (body && body.url) return body.url;
    throw new Error('HLS lookup: no url in response');
  }
  return res.url || lbUrl;
}

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s}`;
  return `${m}:${s}`;
}

function isChannelItem(item) {
  if (!item) return false;
  if (item.type && /channel/i.test(String(item.type))) return true;
  if (item.channelId && !item.vodId) return true;
  return false;
}

export function createPlayerScreen() {
  const cleanup = [];
  let video = null;
  let overlay = null;
  let hideTimer = 0;
  let syncTimer = 0;
  let item = null;
  let pendingResume = 0;
  let didInitialResume = false;

  return {
    async mount(root, params = {}) {
      item = params.item || {};
      const vodId = item.id || item.vodId || item.channelId;
      const isChannel = isChannelItem(item);
      const isLive = isChannel;
      const token = getState().accessToken;
      if (!vodId || !token) {
        root.innerHTML = `<div class="player-error">No video to play.</div>`;
        cleanup.push(onRemote('back', async (e) => {
          e.detail.originalEvent.preventDefault();
          await pop();
        }));
        return;
      }

      const title = (Array.isArray(item.infos) && (item.infos.find(i => i.languageCode === 'en') || item.infos[0] || {}).name)
                  || item.name || item.seriesName || '';

      root.innerHTML = `
        <div class="player" id="player-root">
          <video id="player-video" preload="auto" playsinline autoplay></video>

          <div class="player-overlay" id="player-overlay">
            <div class="player-top">
              <div class="player-title">${escapeHtml(title)}</div>
              ${isLive ? `<div class="player-live"><span class="player-live-dot"></span>LIVE</div>` : ''}
            </div>

            <div class="player-bottom">
              ${isLive ? `
                <p class="player-hint">OK pause · BACK exit</p>
              ` : `
                <div class="player-times">
                  <span id="cur-time">0:00</span>
                  <span id="dur-time">0:00</span>
                </div>
                <div class="player-progress">
                  <div class="player-progress-bar" id="prog-bar"></div>
                  <div class="player-progress-buffer" id="prog-buf"></div>
                </div>
                <p class="player-hint">OK pause · ←/→ 30s · BACK exit</p>
              `}
            </div>
          </div>

          <div class="player-center" id="player-center" aria-hidden="true">
            <div class="player-center-circle">▶</div>
          </div>

          <div class="player-loading" id="loading">Loading…</div>
          <div class="player-error hidden" id="error"></div>
        </div>
      `;

      video    = root.querySelector('#player-video');
      overlay  = root.querySelector('#player-overlay');

      // Reset spatial nav so OK presses don't dispatch on detached tiles
      // from the previous screen.
      setNavRoot(null);
      const curT = root.querySelector('#cur-time');
      const durT = root.querySelector('#dur-time');
      const bar  = root.querySelector('#prog-bar');
      const buf  = root.querySelector('#prog-buf');
      const loadingEl = root.querySelector('#loading');
      const errorEl   = root.querySelector('#error');

      let url;
      try {
        url = await resolveHlsUrl(vodId, token, isChannel);
      } catch (err) {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Could not resolve stream: ' + err.message;
        return;
      }
      video.src = url;

      const localCW = parseFloat(localStorage.getItem(cwKey(vodId)) || '0');
      const backendCW = Number(item.lastWatchedIndex) || 0;
      pendingResume = Math.max(localCW, backendCW);

      const onLoaded = () => {
        loadingEl.classList.add('hidden');
        if (!isLive) {
          durT.textContent = fmt(video.duration);
          if (!didInitialResume && pendingResume > RESUME_SAVE_MIN_SEC && pendingResume < (video.duration - RESUME_SAVE_FROM_END_SEC)) {
            try { video.currentTime = pendingResume; } catch {}
            didInitialResume = true;
          }
        }
        video.play().catch(() => {});
      };
      const onTime = () => {
        if (isLive) return;
        curT.textContent = fmt(video.currentTime);
        if (video.duration > 0) bar.style.width = (100 * video.currentTime / video.duration) + '%';
      };
      const onProgress = () => {
        if (isLive) return;
        if (video.buffered && video.buffered.length && video.duration > 0) {
          const end = video.buffered.end(video.buffered.length - 1);
          buf.style.width = (100 * end / video.duration) + '%';
        }
      };
      const centerOverlay = root.querySelector('#player-center');
      // Show big centered ▶ while paused; hide during playback.
      const onPlay  = () => { if (centerOverlay) centerOverlay.classList.remove('visible'); };
      const onPause = () => { if (centerOverlay) centerOverlay.classList.add('visible'); };
      const onError = () => {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Playback error: ' + (video.error && video.error.message || 'unknown');
      };
      const onEnded = () => {
        try { localStorage.removeItem(cwKey(vodId)); } catch {}
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('timeupdate',     onTime);
      video.addEventListener('progress',       onProgress);
      video.addEventListener('play',           onPlay);
      video.addEventListener('pause',          onPause);
      video.addEventListener('error',          onError);
      video.addEventListener('ended',          onEnded);

      if (!isLive) {
        syncTimer = setInterval(() => {
          if (video && video.currentTime > RESUME_SAVE_MIN_SEC && video.duration > 0
              && (video.duration - video.currentTime) > RESUME_SAVE_FROM_END_SEC) {
            try { localStorage.setItem(cwKey(vodId), String(video.currentTime)); } catch {}
          }
        }, SYNC_EVERY_MS);
      }

      function showOverlay() {
        overlay.classList.add('visible');
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => overlay.classList.remove('visible'), OVERLAY_HIDE_MS);
      }
      showOverlay();

      function skip(deltaSec) {
        if (isLive) return;
        if (!isFinite(video.duration)) return;
        const t = Math.max(0, Math.min(video.duration - 0.5, video.currentTime + deltaSec));
        video.currentTime = t;
        showOverlay();
      }

      let lastToggleAt = 0;
      function togglePlayPause() {
        const now = Date.now();
        if (now - lastToggleAt < 350) return;
        lastToggleAt = now;
        if (video.paused) video.play().catch(() => {});
        else              video.pause();
        showOverlay();
      }

      cleanup.push(onRemote('enter',       (e) => { e.detail.originalEvent.preventDefault(); togglePlayPause(); }));
      cleanup.push(onRemote('play',        (e) => { e.detail.originalEvent.preventDefault(); video.play().catch(()=>{}); showOverlay(); }));
      cleanup.push(onRemote('pause',       (e) => { e.detail.originalEvent.preventDefault(); video.pause(); showOverlay(); }));
      cleanup.push(onRemote('playpause',   (e) => { e.detail.originalEvent.preventDefault(); togglePlayPause(); }));
      cleanup.push(onRemote('left',        (e) => { e.detail.originalEvent.preventDefault(); skip(-SKIP_SECONDS); }));
      cleanup.push(onRemote('right',       (e) => { e.detail.originalEvent.preventDefault(); skip(+SKIP_SECONDS); }));
      cleanup.push(onRemote('rewind',      (e) => { e.detail.originalEvent.preventDefault(); skip(-SKIP_SECONDS); }));
      cleanup.push(onRemote('fastforward', (e) => { e.detail.originalEvent.preventDefault(); skip(+SKIP_SECONDS); }));
      cleanup.push(onRemote('up',          (e) => { e.detail.originalEvent.preventDefault(); showOverlay(); }));
      cleanup.push(onRemote('down',        (e) => { e.detail.originalEvent.preventDefault(); showOverlay(); }));
      cleanup.push(onRemote('back', async (e) => {
        e.detail.originalEvent.preventDefault();
        savePosition();
        await pop();
      }));
    },

    unmount() {
      savePosition();
      if (hideTimer) clearTimeout(hideTimer);
      if (syncTimer) clearInterval(syncTimer);
      if (video) {
        try { video.pause(); } catch {}
        try { video.removeAttribute('src'); video.load(); } catch {}
      }
      cleanup.forEach(fn => fn && fn());
      cleanup.length = 0;
      video = overlay = null;
    },
  };

  function savePosition() {
    if (!video || !item) return;
    const id = item.id || item.vodId || item.channelId;
    if (!id) return;
    try {
      if (video.currentTime > RESUME_SAVE_MIN_SEC && video.duration > 0
          && (video.duration - video.currentTime) > RESUME_SAVE_FROM_END_SEC) {
        localStorage.setItem(cwKey(id), String(video.currentTime));
      } else if (video.duration > 0 && (video.duration - video.currentTime) <= RESUME_SAVE_FROM_END_SEC) {
        localStorage.removeItem(cwKey(id));
      }
    } catch {}
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
}
