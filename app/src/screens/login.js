// Login screen — email + password using webOS native virtual keyboard.
import { login } from '../auth.js';
import { navigate } from '../router.js';
import { onRemote } from '../remote.js';

export function createLoginScreen() {
  const cleanup = [];

  return {
    async mount(root) {
      root.innerHTML = `
        <div class="login-wrap">
          <div class="login-card">
            <img class="login-logo" src="icons/largeIcon.png" alt="Bethel ONLINE">
            <h1 class="login-title">Sign in to Bethel ONLINE</h1>
            <p class="login-sub">Enter the email and password from your bethel.online account.</p>

            <form class="login-form" autocomplete="on">
              <label class="login-label">
                <span>Email</span>
                <input type="email" id="email" autocomplete="username" inputmode="email" autofocus>
              </label>
              <label class="login-label">
                <span>Password</span>
                <input type="password" id="password" autocomplete="current-password">
              </label>
              <p class="login-error hidden" id="error"></p>
              <button type="submit" class="login-button" id="submit">Sign in</button>
            </form>
          </div>
        </div>
      `;

      const form     = root.querySelector('.login-form');
      const emailEl  = root.querySelector('#email');
      const passEl   = root.querySelector('#password');
      const errorEl  = root.querySelector('#error');
      const submitEl = root.querySelector('#submit');

      function setBusy(busy) {
        submitEl.disabled = busy;
        submitEl.textContent = busy ? 'Signing in…' : 'Sign in';
      }
      function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = emailEl.value.trim();
        const password = passEl.value;
        if (!username || !password) {
          showError('Please enter your email and password.');
          return;
        }
        errorEl.classList.add('hidden');
        setBusy(true);
        try {
          await login(username, password);
          await navigate('home');
        } catch (err) {
          setBusy(false);
          const msg = (err && err.message) || 'Sign-in failed.';
          showError(msg.includes('Bad credentials')
            ? 'Email or password is incorrect.'
            : msg);
        }
      });

      // BACK on login = exit (handled by main.js global handler).
      // Map ENTER on focused input to submit (in case webOS keyboard doesn't).
      cleanup.push(onRemote('enter', (e) => {
        const ae = document.activeElement;
        if (!ae) return;
        if (ae === emailEl) {
          passEl.focus();
          e.detail.originalEvent.preventDefault();
        } else if (ae === passEl) {
          form.requestSubmit();
          e.detail.originalEvent.preventDefault();
        } else if (ae === submitEl) {
          form.requestSubmit();
          e.detail.originalEvent.preventDefault();
        }
      }));

      // D-pad UP/DOWN switches between fields and the submit button,
      // independent of whatever the on-screen keyboard does.
      cleanup.push(onRemote('down', (e) => {
        const ae = document.activeElement;
        if (ae === emailEl) { passEl.focus();   e.detail.originalEvent.preventDefault(); }
        else if (ae === passEl) { submitEl.focus(); e.detail.originalEvent.preventDefault(); }
      }));
      cleanup.push(onRemote('up', (e) => {
        const ae = document.activeElement;
        if (ae === passEl) { emailEl.focus();   e.detail.originalEvent.preventDefault(); }
        else if (ae === submitEl) { passEl.focus(); e.detail.originalEvent.preventDefault(); }
      }));

      // Make sure first field has focus so the on-screen keyboard appears.
      setTimeout(() => emailEl.focus(), 50);
    },

    unmount() {
      cleanup.forEach(fn => fn && fn());
      cleanup.length = 0;
    },
  };
}
