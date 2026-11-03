/**
 * Hash router sederhana. Pola route: '/records/:id/edit'.
 * Hash: '#/records/abc/edit?x=1' → { path: '/records/abc/edit', params: { id: 'abc' }, query: URLSearchParams }
 */
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = '/' + pathPart.split('/').filter(Boolean).join('/');
  return { path, query: new URLSearchParams(queryPart) };
}

export function matchRoute(routes, path) {
  const segs = path.split('/').filter(Boolean);
  for (const route of routes) {
    const pSegs = route.path.split('/').filter(Boolean);
    if (pSegs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pSegs.length; i++) {
      if (pSegs[i].startsWith(':')) params[pSegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (pSegs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

/** Pindah halaman. replace = true tidak menambah riwayat (tombol back). */
export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : '#' + to;
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function buildHash(path, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') q.set(k, v);
  });
  const qs = q.toString();
  return '#' + path + (qs ? '?' + qs : '');
}

export function startRouter(onChange) {
  window.addEventListener('hashchange', () => onChange(parseHash()));
  onChange(parseHash());
}
