import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { field, busy, showFieldErrors } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { getToken, setToken, getStoredApiUrl, setStoredApiUrl, getDefaultApiUrl, resetCache } from '../state.js';
import { navigate } from '../router.js';

export async function render({ mount }) {
  const tokenInput = h('input', { type: 'password', name: 'token', autocomplete: 'current-password', required: true, value: getToken(), spellcheck: 'false', placeholder: 'Tempel kode akses di sini' });
  const eyeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tampilkan kode', 'aria-pressed': 'false', style: { position: 'absolute', right: '0', width: '44px', height: '44px' } }, icon('visibility', 20));
  eyeBtn.addEventListener('click', () => {
    const show = tokenInput.type === 'password';
    tokenInput.type = show ? 'text' : 'password';
    eyeBtn.setAttribute('aria-pressed', String(show));
    eyeBtn.setAttribute('aria-label', show ? 'Sembunyikan kode' : 'Tampilkan kode');
    eyeBtn.replaceChildren(icon(show ? 'visibility_off' : 'visibility', 20));
  });
  tokenInput.style.paddingLeft = '40px';
  tokenInput.style.paddingRight = '48px';
  const tokenControl = h('div', { class: 'input-affix' }, tokenInput, h('span', { class: 'affix', 'aria-hidden': 'true' }, icon('key', 20)), eyeBtn);

  const defaultUrl = getDefaultApiUrl();
  const urlInput = h('input', { type: 'url', name: 'apiUrl', value: getStoredApiUrl(), placeholder: defaultUrl || 'https://script.google.com/macros/s/…/exec', spellcheck: 'false' });
  const errorBox = h('div', { class: 'note', role: 'alert', hidden: true, style: { background: 'var(--late-soft)', color: 'var(--late)' } });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-lg' }, icon('lock', 20), 'Masuk');

  const form = h('form', { class: 'card card-pad-lg', novalidate: true },
    h('h2', { class: 't-h3' }, 'Masukkan kode akses'),
    h('p', { class: 't-sm c-2 mt-4', style: { marginBottom: '16px' } }, 'Kode akses (API token) dibuat saat menjalankan setup() di Apps Script. Kode hanya disimpan di perangkat ini.'),
    field({ label: 'Kode akses', input: tokenInput, name: 'token', control: tokenControl }),
    h('details', { class: 'mt-16', open: !defaultUrl && !getStoredApiUrl() },
      h('summary', { class: 't-label c-primary', style: { cursor: 'pointer', minHeight: '40px', display: 'flex', alignItems: 'center' } }, 'Pengaturan lanjutan'),
      field({
        label: 'API URL (Apps Script /exec)',
        input: urlInput,
        name: 'apiUrl',
        hint: defaultUrl ? 'Kosongkan untuk memakai URL bawaan.' : 'Wajib diisi karena URL bawaan belum diatur.',
      }),
    ),
    h('div', { class: 'mt-16' }, errorBox),
    h('div', { class: 'mt-16' }, submit),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorBox.hidden = true;
    const token = tokenInput.value.trim();
    const url = urlInput.value.trim();
    const errors = {};
    if (!token) errors.token = 'Wajib diisi';
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) errors.apiUrl = 'Harus URL https://script.google.com/…/exec';
    if (!url && !defaultUrl) errors.apiUrl = 'Wajib diisi';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    showFieldErrors(form, {});

    const previousUrl = getStoredApiUrl();
    setStoredApiUrl(url);
    const restore = busy(submit, 'Memeriksa…');
    try {
      await call('auth.check', {}, { token });
      setToken(token);
      resetCache();
      navigate('/', { replace: true });
    } catch (err) {
      setStoredApiUrl(previousUrl);
      errorBox.replaceChildren(icon('error', 20), h('span', null, err.code === 'UNAUTHORIZED' ? 'Kode akses salah.' : err.message));
      errorBox.hidden = false;
      tokenInput.focus();
    } finally {
      restore();
    }
  });

  mount(h('div', { class: 'login' },
    h('img', { class: 'login-logo', src: 'assets/logo-full.png', alt: 'MotoCare', width: '240', height: '116' }),
    h('h1', { class: 'visually-hidden', tabindex: '-1' }, 'Masuk ke MotoCare'),
    h('p', { class: 'login-tag' }, 'Catatan servis, ganti oli & belanja part motor'),
    form,
  ));
}
