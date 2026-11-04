import { h, uid } from '../utils/dom.js';
import { STATUS_LABELS, TYPE_LABELS } from '../utils/format.js';
import { icon } from './icons.js';
import { TYPE_BADGES } from './meta.js';

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

// ---------- Dialog (bottom sheet) ----------

/**
 * actions = [{ label, value, class }]. onAction(value) boleh async; kembalikan false agar dialog tetap terbuka.
 * Resolve dengan value tombol yang menutup dialog (null jika Esc).
 */
export function openDialog({ title, body, actions = [], onAction, initialFocus }) {
  return new Promise((resolve) => {
    const titleId = uid('dlg');
    let result = null;
    const buttons = actions.map((a) =>
      h('button', {
        type: 'button',
        class: ['btn', a.class || 'btn-outline'],
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
      h('div', { class: 'dialog-grip', 'aria-hidden': 'true' }),
      h('div', { class: 'dialog-body' }, h('h2', { id: titleId }, title), body),
      h('div', { class: 'dialog-actions' }, buttons),
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const primary = dialog.querySelector('.dialog-actions .btn-primary, .dialog-actions .btn-danger-solid');
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
      { label: cancelText, value: false, class: 'btn-outline' },
      { label: okText, value: true, class: danger ? 'btn-danger-solid' : 'btn-primary' },
    ],
    initialFocus: '.dialog-actions .btn',
  });
  return res === true;
}

// ---------- Tampilan umum ----------

export function loadingView(text = 'Memuat…') {
  return h('div', { class: 'state', role: 'status' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'c-2' }, text));
}

export function emptyState({ iconName = 'receipt_long', title, text, action }) {
  return h('div', { class: 'card state' },
    h('div', { class: 'tile-icon lg round' }, icon(iconName, 26)),
    h('h2', { class: 't-h3' }, title),
    text && h('p', { class: 'c-2 mt-4' }, text),
    action && h('div', { class: 'mt-16' }, action),
  );
}

export function errorState(err, onRetry) {
  return h('div', { class: 'card state', role: 'alert' },
    h('div', { class: 'tile-icon lg round tone-late' }, icon('error', 26)),
    h('h2', { class: 't-h3' }, 'Gagal memuat'),
    h('p', { class: 'c-2 mt-4' }, err && err.message ? err.message : 'Terjadi kesalahan.'),
    onRetry && h('div', { class: 'mt-16' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: onRetry }, 'Coba lagi')),
  );
}

/** Judul halaman: pageHead('Riwayat', { subtitle, actions: [btn] }) */
export function pageHead(title, { subtitle, actions = [] } = {}) {
  return h('div', { class: 'page-head' },
    h('div', { class: 'stack' },
      h('h1', { tabindex: '-1' }, title),
      subtitle && h('p', { class: 'page-sub' }, subtitle),
    ),
    actions.filter(Boolean).length ? h('div', { class: 'row' }, actions) : null,
  );
}

/** Judul seksi dengan tautan di kanan. */
export function sectionHead(title, { href, linkText, extra, bar = false } = {}) {
  return h('div', { class: 'section-head' },
    h('h2', null, bar && h('span', { class: 'section-bar', 'aria-hidden': 'true' }), title, extra),
    href && h('a', { class: 'section-link', href }, linkText),
  );
}

/** Tombol ikon + teks. */
export function iconButton(iconName, label, attrs = {}) {
  return h(attrs.href ? 'a' : 'button', { type: attrs.href ? null : 'button', ...attrs, class: ['btn', attrs.class] }, icon(iconName, 20), h('span', null, label));
}

// ---------- Badge ----------

const STATUS_CLASS = { OK: 'badge-ok', SEGERA: 'badge-soon', TERLAMBAT: 'badge-late' };

export function statusBadge(status) {
  return h('span', { class: ['badge', STATUS_CLASS[status], status === 'TERLAMBAT' && 'badge-dot'] }, STATUS_LABELS[status] || status);
}

export function typeBadge(type) {
  return h('span', { class: ['badge', TYPE_BADGES[type]] }, TYPE_LABELS[type] || type);
}

// ---------- Form ----------

/**
 * Field berlabel. name = key error ('odometer', 'items.0.name').
 * label boleh string atau node; aside = teks kecil di kanan label.
 */
export function field({ label, input, hint, hintTone, name, className, required, aside, control }) {
  if (!input.id) input.id = uid('in');
  const errId = `${input.id}-err`;
  const hintId = hint ? `${input.id}-hint` : null;
  if (hintId) input.setAttribute('aria-describedby', hintId);
  return h('div', { class: ['field', className], dataset: { field: name || '' } },
    h('label', { for: input.id }, h('span', null, label, required && h('span', { class: 'req' }, ' *')), aside && h('span', { class: 'label-aside' }, aside)),
    control || input,
    hint && h('div', { class: ['hint', hintTone && `hint-${hintTone}`], id: hintId }, hint),
    h('div', { class: 'field-error', id: errId, hidden: true }),
  );
}

/** Tampilkan error { key: pesan } di field dengan data-field cocok. Mengembalikan error yang tidak punya field. */
export function showFieldErrors(form, errors = {}) {
  form.querySelectorAll('.field').forEach((f) => {
    const errEl = f.querySelector(':scope > .field-error');
    const input = f.querySelector('input, select, textarea');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (input) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-errormessage'); }
  });
  const unmatched = {};
  let first = null;
  Object.entries(errors || {}).forEach(([key, msg]) => {
    const f = form.querySelector(`.field[data-field="${CSS.escape(key)}"]`);
    if (!f) { unmatched[key] = msg; return; }
    const errEl = f.querySelector(':scope > .field-error');
    const input = f.querySelector('input:not([type="radio"]), select, textarea');
    errEl.textContent = msg;
    errEl.hidden = false;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-errormessage', errEl.id);
      if (!first) first = input;
    }
    if (!first) first = f;
  });
  if (first) {
    if (first.focus && first.tagName !== 'DIV') first.focus();
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return unmatched;
}

/** Tombol ke status loading. Mengembalikan fungsi pemulih. */
export function busy(button, text = 'Menyimpan…') {
  const original = Array.from(button.childNodes);
  button.disabled = true;
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), text);
  return () => {
    button.disabled = false;
    button.replaceChildren(...original);
  };
}

/** Input angka berformat ribuan (Indonesia) saat blur. */
export function numberInput({ value = null, integer = true, placeholder = '', required = false, className } = {}) {
  const input = h('input', {
    type: 'text',
    inputmode: integer ? 'numeric' : 'decimal',
    autocomplete: 'off',
    placeholder,
    required,
    class: className,
  });
  const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: integer ? 0 : 2 });
  const setVal = (v) => { input.value = v === null || v === undefined || v === '' ? '' : fmt.format(v); };
  setVal(value);
  input.addEventListener('focus', () => {
    const n = parseLoose(input.value, integer);
    if (n !== null && !Number.isNaN(n)) {
      const raw = integer ? String(n) : String(n).replace('.', ',');
      if (raw !== input.value) {
        input.value = raw;
        input.select();
      }
    }
  });
  input.addEventListener('blur', () => {
    const n = parseLoose(input.value, integer);
    if (n !== null && !Number.isNaN(n)) setVal(n);
  });
  input.dataset.integer = integer ? '1' : '0';
  input.setNumber = (n) => setVal(n);
  return input;
}

function parseLoose(text, integer) {
  const s = String(text).replace(/\s/g, '');
  if (!s) return null;
  const norm = integer ? s.replace(/\./g, '') : (s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return /^-?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

/** Nilai input numberInput(). Kosong → null, tidak valid → NaN. */
export function readNumber(input) {
  return parseLoose(input.value, input.dataset.integer !== '0');
}

/** Bungkus input dengan prefix/suffix, contoh affix(input, 'Rp'). */
export function affix(input, text, { suffix = false } = {}) {
  return h('div', { class: ['input-affix', suffix && 'suffix'] }, input, h('span', { class: 'affix', 'aria-hidden': 'true' }, text));
}

/** Toggle switch. Mengembalikan { el, input }. */
export function toggleSwitch({ checked = false, label }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, 'aria-label': label });
  return { el: h('span', { class: 'toggle' }, input, h('span', { 'aria-hidden': 'true' })), input };
}

/** Segmented / chip radio group. options = [{ value, label, iconName }]. */
export function radioGroup({ name, options, value, className = 'segmented', label }) {
  const inputs = {};
  const el = h('div', { class: className, role: 'radiogroup', 'aria-label': label },
    options.map((o) => {
      const id = uid('r');
      inputs[o.value] = h('input', { type: 'radio', name, id, value: o.value, checked: o.value === value });
      return className.includes('chips')
        ? h('span', { class: 'chip-radio' }, inputs[o.value], h('label', { for: id }, o.iconName && icon(o.iconName, 18), o.label))
        : [inputs[o.value], h('label', { for: id }, o.iconName && icon(o.iconName, 18), o.label)];
    }),
  );
  return {
    el,
    inputs,
    get value() { const c = Object.values(inputs).find((i) => i.checked); return c ? c.value : ''; },
    set value(v) { Object.values(inputs).forEach((i) => { i.checked = i.value === v; }); },
  };
}

/** Unduh teks sebagai file (CSV/JSON). */
export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
