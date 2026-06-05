// Tiny screen router with a navigation stack.
// `navigate` is a top-level transition (resets stack — used for login/home).
// `push` records current screen and navigates forward.
// `pop` returns to the previous pushed screen, or home if the stack is empty.
let current = null;
let currentName = null;
let currentParams = null;
let root = null;
const stack = [];

const screens = {};

export function registerScreen(name, factory) {
  screens[name] = factory;
}

export function setRoot(el) { root = el; }

async function _mount(name, params = {}) {
  if (!root) throw new Error('Router root not set');
  const factory = screens[name];
  if (!factory) throw new Error('Unknown screen: ' + name);

  if (current && current.unmount) current.unmount();
  root.innerHTML = '';
  document.body.dataset.screen = name;

  const screen = factory();
  current = screen;
  currentName = name;
  currentParams = params;
  await screen.mount(root, params);
}

export async function navigate(name, params = {}) {
  stack.length = 0;
  await _mount(name, params);
}

export async function push(name, params = {}) {
  if (currentName) stack.push({ name: currentName, params: currentParams });
  await _mount(name, params);
}

export async function pop() {
  const prev = stack.pop();
  if (prev) await _mount(prev.name, prev.params);
  else      await _mount('home', {});
}

export function getCurrentScreen() { return currentName; }
export function stackDepth() { return stack.length; }
