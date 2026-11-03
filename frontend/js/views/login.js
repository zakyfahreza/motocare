import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { field, busy, showFieldErrors } from '../ui/components.js';
import { getToken, setToken, getStoredApiUrl, setStoredApiUrl, getDefaultApiUrl, resetCache } from '../state.js';
import { navigate } from '../router.js';

export async function render({ mount }) {
  const tokenInput = h('input', { type: 'password', name: 'token', autocomplete: 'current-password', required: true, value: getToken(), spellcheck: 'false' });
  const showToggle = h('input', { type: 'checkbox', id: 'show-token' });
  showToggle.addEventListener('change', () => { tokenInput.type = showToggle.checked ? 'text' : 'password'; });

  const defaultUrl = getDefaultApiUrl();
  const urlInput = h('input', { type: 'url', name: 'apiUrl', value: getStoredApiUrl(), placeholder: defaultUrl || 'https://script.google.com/macros/s/…/exec', spellcheck: 'false' });
  const errorBox = h('div', { class: 'field-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Masuk');

  const form = h('form', { class: 'card', novalidate: true },
    h('h2', null, 'Masukkan kode akses'),
    h('p', { class: 'muted small' }, 'Kode akses (API token) dibuat saat menjalankan setup() di Apps Script. Kode disimpan di perangkat ini saja.'),
    field({ label: 'Kode akses', input: tokenInput, name: 'token' }),
    h('label', { class: 'check', for: 'show-token' }, showToggle, 'Tampilkan kode'),
    h('details', { class: 'filters', open: !defaultUrl && !getStoredApiUrl() },
      h('summary', null, 'Pengaturan lanjutan'),
      field({
        label: 'API URL (Apps Script /exec)',
        input: urlInput,
        name: 'apiUrl',
        hint: defaultUrl ? 'Kosongkan untuk memakai URL bawaan.' : 'Wajib diisi karena URL bawaan belum diatur.',
      }),
    ),
    errorBox,
    submit,
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
      errorBox.textContent = err.code === 'UNAUTHORIZED' ? 'Kode akses salah.' : err.message;
      errorBox.hidden = false;
      tokenInput.focus();
    } finally {
      restore();
    }
  });

  mount(h('div', { class: 'login' },
    h('div', { class: 'login-brand' },
      h('img', { src: 'assets/icon.svg', alt: '' }),
      h('div', null, h('h1', { tabindex: '-1', class: 'mb-0' }, 'MotoCare'), h('div', { class: 'muted small' }, 'Catatan servis & part motor')),
    ),
    form,
  ));
}
