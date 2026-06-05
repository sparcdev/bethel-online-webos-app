// Tiny pub-sub state container. No framework, no magic.
const state = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,         // epoch ms
  user: null,           // populated after first authenticated call
  tabLayout: null,      // cached homepage rows
  lastFocus: {},        // per-screen focus memory: {screenName: focusableId}
};

const subs = new Set();

export function getState() { return state; }

export function setState(patch) {
  Object.assign(state, patch);
  subs.forEach(fn => fn(state));
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
