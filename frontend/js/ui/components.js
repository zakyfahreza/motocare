import { h, uid } from '../utils/dom.js';
import { STATUS_LABELS, TYPE_LABELS } from '../utils/format.js';

// ---------- Toast ----------

export function toast(message, type = 'info', ms = 3500) {
  const root = document.getElementById('toasts');
  const el = h('div', { class: ['toast', type !== 'info' && `toast-${type}`] }, message);
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function toastError(err) {
  toast(err && err.message ? err.message : 'Terjadi kesalahan.', 'error', 5000);
}

// ---------- Dialog ----------

/**
 * Tampilkan dialog modal. `actions` = [{ label, value, class }].
 * onAction(value, close) boleh async; kembalikan false untuk menahan dialog tetap terbuka.
 * Resolve dengan value tombol yang menutup dialog (null jika Esc/batal).
 */
export function openDialog({ title, body, actions = [], onAction, initialFocus }) {
  return new Promise((resolve) => {
    const titleId = uid('dlg');
    let result = null;
    const buttons = actions.map((a) =>
      h('button', {
        type: 'button',
        class: ['btn', a.class],
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          if (onAction) {
            btn.disabled = true;
            try {
              const keep = await onAction(a.value, dialog);
              if (keep === false) return;
            } finally {
              btn.disabled = false;
            }
          }
          result = a.value;
          dialog.close();
        },
      }, a.label),
    );
    const dialog = h('dialog', { 'aria-labelledby': titleId },
      h('div', { class: 'dialog-body' }, h('h2', { id: titleId }, title), body),
      h('div', { class: 'dialog-actions' }, buttons),
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    // Enter di dalam form = klik tombol utama.
    dialog.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const primary = dialog.querySelector('.dialog-actions .btn-primary, .dialog-actions .btn-danger');
      if (primary && !primary.disabled) primary.click();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    const focusEl = initialFocus ? dialog.querySelector(initialFocus) : dialog.querySelector('input, select, textarea');
    if (focusEl) focusEl.focus();
  });
}

export async function confirmDialog(message, { title = 'Konfirmasi', okText = 'Ya', cancelText = 'Batal', danger = false } = {}) {
  const res = await openDialog({
    title,
    body: h('p', null, message),
    actions: [
      { label: cancelText, value: false },
      { label: okText, value: true, class: danger ? 'btn-danger' : 'btn-primary' },
    ],
    initialFocus: '.dialog-actions .btn',
  });
  return res === true;
}

// ---------- State tampilan ----------

export function loadingView(text = 'Memuat…') {
  return h('div', { class: 'state', role: 'status' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'muted' }, text));
}

export function emptyState({ icon = '🗒️', title, text, action }) {
  return h('div', { class: 'card state' },
    h('div', { class: 'state-icon', 'aria-hidden': 'true' }, icon),
    h('h2', null, title),
    text && h('p', { class: 'muted' }, text),
    action,
  );
}

export function errorState(err, onRetry) {
  return h('div', { class: 'card state', role: 'alert' },
    h('div', { class: 'state-icon', 'aria-hidden': 'true' }, '⚠️'),
    h('h2', null, 'Gagal memuat'),
    h('p', { class: 'muted' }, err && err.message ? err.message : 'Terjadi kesalahan.'),
    onRetry && h('button', { class: 'btn btn-primary', type: 'button', onclick: onRetry }, 'Coba lagi'),
  );
}

export function pageHead(title, ...actions) {
  return h('div', { class: 'page-head' }, h('h1', { tabindex: '-1' }, title), actions.length ? h('div', { class: 'btn-row' }, actions) : null);
}

// ---------- Badge ----------

const STATUS_CLASS = { OK: 'badge-ok', SEGERA: 'badge-soon', TERLAMBAT: 'badge-late' };

export function statusBadge(status) {
  return h('span', { class: ['badge', STATUS_CLASS[status]] }, STATUS_LABELS[status] || status);
}

export function typeBadge(type) {
  return h('span', { class: 'badge badge-type' }, TYPE_LABELS[type] || type);
}

// ---------- Form ----------

/**
 * Field dengan label, hint, dan slot error.
 * input harus elemen <input>/<select>/<textarea>; id dibuat otomatis jika belum ada.
 * name = key error (contoh 'odometer', 'items.0.name').
 */
export function field({ label, input, hint, name, className }) {
  if (!input.id) input.id = uid('in');
  const errId = `${input.id}-err`;
  const hintId = hint ? `${input.id}-hint` : null;
  if (hintId) input.setAttribute('aria-describedby', hintId);
  const wrap = h('div', { class: ['field', className], dataset: { field: name || '' } },
    h('label', { for: input.id }, label),
    input,
    hint && h('div', { class: 'hint', id: hintId }, hint),
    h('div', { class: 'field-error', id: errId, hidden: true }),
  );
  return wrap;
}

/** Tampilkan error { key: pesan } di field yang punya data-field cocok. Mengembalikan error tanpa field. */
export function showFieldErrors(form, errors = {}) {
  form.querySelectorAll('.field').forEach((f) => {
    const errEl = f.querySelector('.field-error');
    const input = f.querySelector('input, select, textarea');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (input) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-errormessage'); }
  });
  const unmatched = {};
  let first = null;
  Object.entries(errors || {}).forEach(([key, msg]) => {
    const f = form.querySelector(`.field[data-field="${CSS.escape(key)}"]`);
    if (!f) { unmatched[key] = msg; return; }
    const errEl = f.querySelector('.field-error');
    const input = f.querySelector('input, select, textarea');
    errEl.textContent = msg;
    errEl.hidden = false;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-errormessage', errEl.id);
      if (!first) first = input;
    }
  });
  if (first) first.focus();
  return unmatched;
}

/** Set tombol ke status loading (disable + spinner). Mengembalikan fungsi untuk memulihkan. */
export function busy(button, text = 'Menyimpan…') {
  const original = Array.from(button.childNodes);
  button.disabled = true;
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), text);
  return () => {
    button.disabled = false;
    button.replaceChildren(...original);
  };
}

/** Input angka dengan pemisah ribuan saat blur. */
export function numberInput({ value = null, integer = true, placeholder = '', required = false, min } = {}) {
  const input = h('input', {
    type: 'text',
    inputmode: integer ? 'numeric' : 'decimal',
    autocomplete: 'off',
    placeholder,
    required,
  });
  const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: integer ? 0 : 2 });
  const setVal = (v) => { input.value = v === null || v === undefined || v === '' ? '' : fmt.format(v); };
  setVal(value);
  if (min !== undefined) input.dataset.min = String(min);
  input.addEventListener('focus', () => {
    // Saat edit: tampilkan angka tanpa pemisah ribuan agar mudah diketik.
    const n = parseLoose(input.value, integer);
    if (n !== null && !Number.isNaN(n)) {
      const raw = integer ? String(n) : String(n).replace('.', ',');
      if (raw !== input.value) {
        input.value = raw;
        input.select(); // langsung bisa diketik ulang tanpa menghapus manual
      }
    }
  });
  input.addEventListener('blur', () => {
    const n = parseLoose(input.value, integer);
    if (n !== null && !Number.isNaN(n)) setVal(n);
  });
  input.dataset.integer = integer ? '1' : '0';
  return input;
}

function parseLoose(text, integer) {
  const s = String(text).replace(/\s/g, '');
  if (!s) return null;
  const norm = integer ? s.replace(/\./g, '') : (s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return /^-?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

/** Baca nilai input yang dibuat numberInput(). Kosong → null, tidak valid → NaN. */
export function readNumber(input) {
  return parseLoose(input.value, input.dataset.integer !== '0');
}
