// Bethel / Streann constants — extracted from bethel.online's web bundle.
// These are de-facto public (visible in their JS bundle); reusing them in this
// personal-use TV app carries the same risk profile as a regular browser session.
export const CONFIG = Object.freeze({
  apiUrl: 'https://cf.streann.tech',
  resellerId: '611fd870e4b03ec37aae6e5e',
  appName: 'bethelmedia',
  appPlatform: 'web',
  appVersion: '1.5',
  loginAuthorization:
    'NjZiNzQxOTQ0OTM5NzAxMjI3YjQ1YjYwODFkN2UwOWQ4MWFiMTdkNGQ4OGQ0YzIyODAzNjgwMDYwMWE2OjI0ODY2YTcwYzUyNjY4ZmYxODE5Zjk5YjA3MGFkNWU2NmIyNjAzNzY5OTM4NmQ4Y2FjMmFmOTYwNjA2NQ==',
  defaultLang: 'en',
  origin: 'https://www.bethel.online',
});

// Generate a stable per-device id (used in HLS URL params, CW sync, etc.)
export function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = 'webos-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('device_id', id);
  }
  return id;
}
