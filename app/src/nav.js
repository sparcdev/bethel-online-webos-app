// Spatial navigation engine for D-pad TV remotes.
//
// Usage:
//   import { initNav, focus, refresh, setRoot } from './nav.js';
//   initNav();                          // global, once
//   setRoot(screenContainerEl);         // per screen
//   focus(someEl);                      // initial focus
//
// Any element with [data-focusable] participates. Add .is-focused via this
// engine (do not use CSS :focus — TV elements aren't real focus targets).
//
// On arrow keys: find the nearest focusable in that direction by bounding
// box. Manhattan-style distance with strong penalty for off-axis movement.

import { onRemote } from './remote.js';

let rootEl = null;
let currentEl = null;
const focusListeners = new Set();

export function setRoot(el) {
  rootEl = el;
  currentEl = null;
}

export function getFocused() { return currentEl; }

export function onFocusChange(fn) {
  focusListeners.add(fn);
  return () => focusListeners.delete(fn);
}

function focusables() {
  if (!rootEl) return [];
  return Array.from(rootEl.querySelectorAll('[data-focusable]'))
    .filter(el => !el.hidden && el.offsetParent !== null);
}

export function focus(el) {
  if (!el || el === currentEl) return;
  if (currentEl) currentEl.classList.remove('is-focused');
  currentEl = el;
  el.classList.add('is-focused');
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  focusListeners.forEach(fn => fn(el));
}

// Refresh after dynamic content changes — re-validates currentEl.
export function refresh() {
  if (currentEl && (!rootEl || !rootEl.contains(currentEl))) {
    currentEl = null;
  }
  if (!currentEl) {
    const list = focusables();
    if (list.length) focus(list[0]);
  }
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, ...r };
}

function bestInDirection(direction) {
  if (!currentEl) {
    const list = focusables();
    return list[0] || null;
  }
  const cur = rectOf(currentEl);
  let best = null;
  let bestScore = Infinity;
  for (const el of focusables()) {
    if (el === currentEl) continue;
    const r = rectOf(el);
    const dx = r.cx - cur.cx;
    const dy = r.cy - cur.cy;
    let primary, secondary;
    if (direction === 'left')  { if (dx >= -4) continue; primary = -dx; secondary = Math.abs(dy); }
    else if (direction === 'right') { if (dx <= 4) continue; primary =  dx; secondary = Math.abs(dy); }
    else if (direction === 'up')    { if (dy >= -4) continue; primary = -dy; secondary = Math.abs(dx); }
    else if (direction === 'down')  { if (dy <= 4) continue; primary =  dy; secondary = Math.abs(dx); }
    else continue;
    // Strongly penalise off-axis distance: keeps row-internal navigation tight.
    const score = primary + secondary * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

let inited = false;
export function initNav() {
  if (inited) return;
  inited = true;
  ['left', 'right', 'up', 'down'].forEach(dir => {
    onRemote(dir, (e) => {
      // Don't intercept arrows when typing in an input.
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      const next = bestInDirection(dir);
      if (next) {
        focus(next);
        e.detail.originalEvent.preventDefault();
      }
    });
  });
  onRemote('enter', (e) => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    // Skip when the current focus is a stale element no longer in the DOM
    // (e.g. screen has navigated away). Without this guard, OK on a player
    // screen would dispatch rc:activate on a detached tile from the previous
    // screen — causing an unwanted re-navigation / reload.
    if (currentEl && document.body.contains(currentEl)) {
      currentEl.dispatchEvent(new CustomEvent('rc:activate', { bubbles: true }));
      e.detail.originalEvent.preventDefault();
    }
  });
}
