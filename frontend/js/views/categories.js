import { h } from '../utils/dom.js';
import { call } from '../api.js';
import {
  pageHead, openDialog, field, numberInput, readNumber, showFieldErrors, toast, toastError, toggleSwitch,
} from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { categoryIcon } from '../ui/meta.js';
import { loadSettings, invalidateCategories } from '../state.js';

export async function render({ mount, refresh }) {
  const { categories } = await loadSettings();

  const onSaved = (msg) => { invalidateCategories(); toast(msg, 'success'); refresh(); };
  const addBtn = h('button', {
    type: 'button', class: 'btn btn-primary btn-sm',
    onclick: async () => { if (await openCategoryDialog(null)) onSaved('Kategori ditambahkan'); },
  }, icon('add', 20), 'Kategori');

  mount(
    pageHead('Kategori Item', { subtitle: 'Dipakai untuk item part/oli dan pengingat', actions: [addBtn] }),
    h('div', { class: 'note' }, icon('info', 22), h('span', null, 'Kategori nonaktif tidak muncul di form, tetapi riwayat lama tetap tersimpan.')),
    h('div', { class: 'card list-divider' }, categories.map((c) => h('button', {
      type: 'button', class: 'list-row', 'aria-label': `Edit kategori ${c.label}`,
      onclick: async () => { if (await openCategoryDialog(c)) onSaved('Kategori diperbarui'); },
    },
    h('span', { class: ['tile-icon', !c.active && 'tone-none'] }, icon(categoryIcon(c.code), 20)),
    h('span', { class: 'stack grow' }, h('span', { class: 'list-title' }, c.label), h('span', { class: 'list-sub' }, c.code)),
    !c.active ? h('span', { class: 'badge' }, 'Nonaktif') : null,
    h('span', { class: 'chev' }, icon('edit', 20)),
    ))),
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
  const active = toggleSwitch({ checked: cat ? cat.active : true, label: 'Kategori aktif' });

  const form = h('form', { novalidate: true },
    field({ label: 'Kode', input: codeInput, name: 'code', hint: isEdit ? 'Kode tidak bisa diubah.' : 'Huruf besar, angka, garis bawah.' }),
    field({ label: 'Nama tampilan', input: labelInput, name: 'label' }),
    field({ label: 'Urutan', input: orderInput, name: 'sortOrder' }),
    h('label', { class: 'check-row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('span', { class: 't-title' }, 'Aktif'), active.el),
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
        active: active.input.checked,
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
