import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { APP_VERSION } from '../version.js';
import {
  pageHead, openDialog, confirmDialog, field, numberInput, readNumber, showFieldErrors, toast, toastError,
} from '../ui/components.js';
import { loadSettings, invalidateCategories, getApiUrl, signOut } from '../state.js';
import { navigate } from '../router.js';

export async function render({ mount, refresh }) {
  const { categories, version } = await loadSettings();

  const addBtn = h('button', {
    type: 'button', class: 'btn btn-sm btn-primary',
    onclick: async () => { if (await openCategoryDialog(null)) { invalidateCategories(); toast('Kategori ditambahkan', 'success'); refresh(); } },
  }, '＋ Kategori');

  const catList = h('ul', { class: 'list' }, categories.map((c) => h('li', null,
    h('div', { class: 'list-item' },
      h('div', { class: 'list-main' },
        h('div', { class: 'list-title' }, c.label, ' ', !c.active && h('span', { class: 'badge' }, 'Nonaktif')),
        h('div', { class: 'list-sub' }, c.code),
      ),
      h('button', {
        type: 'button', class: 'btn btn-sm', 'aria-label': `Edit kategori ${c.label}`,
        onclick: async () => { if (await openCategoryDialog(c)) { invalidateCategories(); toast('Kategori diperbarui', 'success'); refresh(); } },
      }, 'Edit'),
    ),
  )));

  const logoutBtn = h('button', {
    type: 'button', class: 'btn btn-danger btn-block',
    onclick: async () => {
      if (!(await confirmDialog('Keluar dari perangkat ini? Kode akses akan dihapus dari perangkat.', { okText: 'Keluar', danger: true }))) return;
      signOut();
      navigate('/login', { replace: true });
    },
  }, 'Keluar');

  const apiUrl = getApiUrl();
  const maskedUrl = apiUrl ? apiUrl.replace(/(\/s\/)(.{6}).+(.{4}\/exec)$/, '$1$2…$3') : '—';

  mount(
    pageHead('Pengaturan'),
    h('section', { class: 'card', 'aria-labelledby': 'set-cat' },
      h('div', { class: 'card-head' }, h('h2', { id: 'set-cat' }, 'Kategori item'), addBtn),
      h('p', { class: 'muted small' }, 'Kategori nonaktif tidak muncul di form, tetapi riwayat lama tetap tersimpan.'),
      catList,
    ),
    h('section', { class: 'card', 'aria-labelledby': 'set-info' },
      h('h2', { id: 'set-info' }, 'Informasi'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Versi aplikasi'), h('dd', null, APP_VERSION),
        h('dt', null, 'Versi backend'), h('dd', null, version || '—'),
        h('dt', null, 'API URL'), h('dd', null, maskedUrl),
      ),
    ),
    h('section', { class: 'card', 'aria-labelledby': 'set-acc' },
      h('h2', { id: 'set-acc' }, 'Akses'),
      h('p', { class: 'muted small' }, 'Untuk mengganti kode akses, jalankan rotateToken() di editor Apps Script lalu masuk ulang.'),
      logoutBtn,
    ),
  );
}

async function openCategoryDialog(cat) {
  const isEdit = Boolean(cat);
  const codeInput = h('input', {
    type: 'text', maxlength: '30', required: true, value: cat ? cat.code : '', disabled: isEdit,
    placeholder: 'SHOCK_DEPAN', autocapitalize: 'characters', spellcheck: 'false',
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  });
  const labelInput = h('input', { type: 'text', maxlength: '50', required: true, value: cat ? cat.label : '', placeholder: 'Shock Depan' });
  const orderInput = numberInput({ value: cat ? cat.sortOrder : null, placeholder: 'otomatis' });
  const activeInput = h('input', { type: 'checkbox', id: 'cat-active', checked: cat ? cat.active : true });

  const form = h('form', { novalidate: true },
    field({ label: 'Kode', input: codeInput, name: 'code', hint: isEdit ? 'Kode tidak bisa diubah.' : 'Huruf besar, angka, garis bawah.' }),
    field({ label: 'Nama tampilan', input: labelInput, name: 'label' }),
    field({ label: 'Urutan', input: orderInput, name: 'sortOrder' }),
    h('label', { class: 'check', for: 'cat-active' }, activeInput, 'Aktif'),
  );

  let saved = null;
  await openDialog({
    title: isEdit ? 'Edit kategori' : 'Tambah kategori',
    body: form,
    actions: [{ label: 'Batal', value: 'cancel' }, { label: 'Simpan', value: 'save', class: 'btn-primary' }],
    onAction: async (value) => {
      if (value !== 'save') return true;
      const data = {
        code: codeInput.value.trim(),
        label: labelInput.value.trim(),
        sortOrder: readNumber(orderInput),
        active: activeInput.checked,
      };
      const errors = {};
      if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(data.code)) errors.code = 'Minimal 2 karakter, diawali huruf (A-Z, 0-9, _)';
      if (data.code === 'JASA') errors.code = 'Kode JASA dipakai sistem';
      if (!data.label) errors.label = 'Wajib diisi';
      if (Number.isNaN(data.sortOrder)) errors.sortOrder = 'Harus angka';
      if (Object.keys(errors).length) { showFieldErrors(form, errors); return false; }
      try {
        saved = await call('settings.saveCategory', data);
        return true;
      } catch (err) {
        const rest = showFieldErrors(form, err.fields || {});
        if (!err.fields || Object.keys(rest).length) toastError(err);
        return false;
      }
    },
  });
  return saved;
}
