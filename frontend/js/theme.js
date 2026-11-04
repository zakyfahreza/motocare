const KEY = 'motocare_theme';

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1220' : '#faf8ff');
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* abaikan */ }
  applyTheme(theme);
}
