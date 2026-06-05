// Reusable focusable tile for Streann VOD/channel items.
import { CONFIG } from '../config.js';

function pickImage(item) {
  if (!item) return null;
  if (typeof item.image === 'string' && item.image) return item.image;
  if (Array.isArray(item.imagesInfos) && item.imagesInfos.length) {
    const en = item.imagesInfos.find(i => i && i.languageCode === 'en')
            || item.imagesInfos[0];
    if (en && (en.landscapeImage || en.image || en.url)) {
      return en.landscapeImage || en.image || en.url;
    }
  }
  if (typeof item.backgroundImage === 'string' && item.backgroundImage) return item.backgroundImage;
  if (typeof item.posterImg === 'string' && item.posterImg) return item.posterImg;
  if (Array.isArray(item.images) && item.images.length) {
    const f = item.images.find(x => x && x.url) || item.images[0];
    if (f && f.url) return f.url;
  }
  if (item.imageId) {
    return `https://img.streann.com/streann-img/${CONFIG.resellerId}/image/${item.imageId}`;
  }
  return null;
}

// Streann's image hosts (img.streann.com / img.streann.tech) accept URL
// transform params: ?quality=80&width=W&auto=webp&fit=bounds&optimize=high.
// Adding this can shrink images 3-5× and speed up decode considerably.
function optimizeImageUrl(url, width) {
  if (!url || typeof url !== 'string') return url;
  if (!/img\.streann\.(com|tech)/.test(url)) return url;
  // Don't double-apply
  if (/[?&]auto=webp/.test(url)) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return `${url}${sep}quality=80&width=${width}&auto=webp&fit=bounds&optimize=high`;
}

function pickTitle(item) {
  if (!item) return '';
  // Prefer series name when this item is part of a series — matches bethel.online's
  // tile UX (rows of series, drill in for episodes).
  if (item.seriesId) {
    if (Array.isArray(item.seriesInfos) && item.seriesInfos.length) {
      const en = item.seriesInfos.find(i => i && i.languageCode === 'en') || item.seriesInfos[0];
      if (en && en.name) return en.name;
    }
    if (item.seriesName) return item.seriesName;
  }
  if (Array.isArray(item.infos) && item.infos.length) {
    const en = item.infos.find(i => i && i.languageCode === 'en') || item.infos[0];
    if (en && en.name) return en.name;
  }
  if (Array.isArray(item.names) && item.names.length) {
    const en = item.names.find(n => n && (n.languageCode === 'en' || n.langCode === 'en'))
            || item.names[0];
    if (en && en.name) return en.name;
  }
  if (Array.isArray(item.categoryInfos) && item.categoryInfos.length) {
    const en = item.categoryInfos.find(i => i && i.languageCode === 'en') || item.categoryInfos[0];
    if (en && en.name) return en.name;
  }
  return item.name || item.title || item.label || '';
}

function formatDate(epochMs) {
  if (!epochMs || epochMs < 1e12) return '';
  try {
    const d = new Date(Number(epochMs));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function formatDuration(seconds) {
  if (!seconds || seconds < 30) return ''; // skip placeholders
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Returns "Date · Duration" if either is meaningful — used on episode-style tiles.
function pickMeta(item) {
  if (!item) return '';
  const parts = [];
  if (!item.hideTheDate) {
    const d = formatDate(item.date) || (item.releasedYear && item.releasedYear > 0 ? String(item.releasedYear) : '');
    if (d) parts.push(d);
  }
  const dur = formatDuration(item.duration);
  if (dur) parts.push(dur);
  return parts.join(' · ');
}

export function isChannel(item) {
  if (!item) return false;
  if (item.type && /channel/i.test(String(item.type))) return true;
  if (item.contentType && /channel/i.test(String(item.contentType))) return true;
  if (item.channelId && !item.vodId && !item.id) return true;
  return false;
}

// `opts.variant` can be 'episode' to force per-item title (no series fallback)
// and to show date+duration meta below the title.
export function createTile(item, onActivate, opts = {}) {
  const variant = opts.variant || 'tile';
  const el = document.createElement('button');
  el.className = 'tile' + (variant === 'episode' ? ' tile-episode' : '');
  el.type = 'button';
  el.tabIndex = -1;
  el.setAttribute('data-focusable', '');
  el.setAttribute('data-id', item.id || item.vodId || item.channelId || '');

  const rawImg = pickImage(item);
  const img    = optimizeImageUrl(rawImg, 400);
  const live   = isChannel(item);
  // Episode tiles always use the per-episode name, never the series name.
  const title = (variant === 'episode')
    ? (
        (Array.isArray(item.infos) && (item.infos.find(i => i && i.languageCode === 'en') || item.infos[0] || {}).name)
        || item.name || ''
      )
    : pickTitle(item);
  const meta  = (variant === 'episode') ? pickMeta(item) : '';

  el.innerHTML = `
    <div class="tile-art">
      ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="400" height="225">` : `<div class="tile-art-fallback"></div>`}
      ${live ? `<span class="tile-live-badge">LIVE</span>` : ''}
    </div>
    <div class="tile-title" title="${title.replace(/"/g, '&quot;')}">${title}</div>
    ${meta ? `<div class="tile-meta">${meta}</div>` : ''}
  `;

  // Smooth fade-in once each image has actually finished decoding
  const imgEl = el.querySelector('img');
  if (imgEl) {
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      imgEl.classList.add('is-loaded');
    } else {
      imgEl.addEventListener('load', () => imgEl.classList.add('is-loaded'), { once: true });
      imgEl.addEventListener('error', () => imgEl.remove(), { once: true });
    }
  }

  el.addEventListener('rc:activate', () => onActivate && onActivate(item, el));
  el.addEventListener('click',       () => onActivate && onActivate(item, el));

  return el;
}
