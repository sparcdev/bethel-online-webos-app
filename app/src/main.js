// Bootstrap: load tokens, init remote handlers, route to login or home.
import { initRemote, onRemote } from './remote.js';
import { setRoot, registerScreen, navigate, getCurrentScreen } from './router.js';
import { loadFromStorage, isLoggedIn, isExpired } from './auth.js';
import { refresh } from './auth.js';
import { createLoginScreen } from './screens/login.js';
import { createHomeScreen } from './screens/home.js';
import { createDetailScreen } from './screens/detail.js';
import { createPlayerScreen } from './screens/player.js';
import { createSearchScreen } from './screens/search.js';

registerScreen('login',  createLoginScreen);
registerScreen('home',   createHomeScreen);
registerScreen('detail', createDetailScreen);
registerScreen('player', createPlayerScreen);
registerScreen('search', createSearchScreen);

function platformExit() {
  try {
    if (window.webOS && window.webOS.platformBack) window.webOS.platformBack();
    else window.close();
  } catch { window.close(); }
}

function showExitDialog() {
  // Reuse the same simple dialog pattern from v1.
  if (document.getElementById('exit-dialog')) return;

  // Blur whatever has focus underneath so its :focus ring disappears.
  const previouslyFocused = document.activeElement;
  if (previouslyFocused && previouslyFocused.blur) previouslyFocused.blur();

  const dlg = document.createElement('div');
  dlg.id = 'exit-dialog';
  dlg.innerHTML = `
    <div class="dialog-card">
      <p class="dialog-title">Exit Bethel ONLINE?</p>
      <div class="dialog-buttons">
        <button id="exit-yes" class="dialog-btn" tabindex="-1">Exit</button>
        <button id="exit-no" class="dialog-btn focus" tabindex="-1">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  const yes = dlg.querySelector('#exit-yes');
  const no  = dlg.querySelector('#exit-no');
  let onYes = false;

  function close() { dlg.remove(); }
  function paint() {
    yes.classList.toggle('focus', onYes);
    no.classList.toggle('focus', !onYes);
  }

  const handler = (e) => {
    const k = e.keyCode;
    if (k === 37 || k === 39) { onYes = !onYes; paint(); e.preventDefault(); }
    else if (k === 13) { (onYes ? platformExit : close)(); e.preventDefault(); }
    else if (k === 461 || k === 10009) { close(); e.preventDefault(); }
    else { return; }
    e.stopPropagation();
  };
  document.addEventListener('keydown', handler, true);
  dlg.addEventListener('remove', () => document.removeEventListener('keydown', handler, true));

  // Replace remove() to also fire the cleanup event.
  const origRemove = dlg.remove.bind(dlg);
  dlg.remove = () => { document.removeEventListener('keydown', handler, true); origRemove(); };

  yes.addEventListener('click', platformExit);
  no.addEventListener('click', () => dlg.remove());

  // Restore focus to the previously-focused element when the dialog closes.
  const restoreFocus = () => {
    if (previouslyFocused && previouslyFocused.focus) {
      try { previouslyFocused.focus(); } catch {}
    }
  };
  const origRemove2 = dlg.remove;
  dlg.remove = () => { origRemove2(); restoreFocus(); };
}

async function bootstrap() {
  const root = document.getElementById('app');
  setRoot(root);
  initRemote();

  // Global BACK handler: on root screens, show exit dialog.
  onRemote('back', () => {
    const screen = getCurrentScreen();
    if (screen === 'home' || screen === 'login') showExitDialog();
  });

  // Hide the HTML splash now that the JS shell is alive.
  const splash = document.getElementById('splash');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('hidden');
      setTimeout(() => splash.remove(), 400);
    }, 200);
  }

  loadFromStorage();
  if (isLoggedIn()) {
    if (isExpired()) {
      try { await refresh(); }
      catch { await navigate('login'); return; }
    }
    await navigate('home');
  } else {
    await navigate('login');
  }
}

document.addEventListener('webOSRelaunch', () => {
  // Always return to home on relaunch (per spec).
  if (isLoggedIn()) navigate('home');
});

bootstrap();
