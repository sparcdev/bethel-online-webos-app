// webOS TV remote keycodes → semantic events on document.
// Screens listen via document.addEventListener('rc:back', ...).

const MAP = {
  13:    'enter',
  32:    'enter',     // spacebar (USB keyboards) — same as OK
  65376: 'enter',     // some webOS remotes
  37:    'left',
  38:    'up',
  39:    'right',
  40:    'down',
  461:   'back',
  10009: 'back',
  415:   'play',
  19:    'pause',
  10252: 'playpause',
  413:   'stop',
  412:   'rewind',
  417:   'fastforward',
  403:   'red',
  404:   'green',
  405:   'yellow',
  406:   'blue',
};

export function initRemote() {
  document.addEventListener('keydown', (e) => {
    const semantic = MAP[e.keyCode];
    if (!semantic) return;
    const evt = new CustomEvent('rc:' + semantic, {
      detail: { originalEvent: e, keyCode: e.keyCode },
      cancelable: true,
    });
    const handled = !document.dispatchEvent(evt);
    if (handled || semantic === 'back') {
      // Always prevent default for arrows + back to stop browser scroll/history.
      e.preventDefault();
    }
  });
}

// Convenience: subscribe to a remote event with auto-cleanup.
export function onRemote(event, handler) {
  document.addEventListener('rc:' + event, handler);
  return () => document.removeEventListener('rc:' + event, handler);
}
