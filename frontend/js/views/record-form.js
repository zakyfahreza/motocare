import { h, uid } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatNumber, todayISO, TYPE_LABELS } from '../utils/format.js';
import { validateRecord } from '../utils/validate.js';
import {
  field, numberInput, readNumber, showFieldErrors, busy, toast, toastError, confirmDialog, affix, radioGroup,
} from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { TYPE_ICONS } from '../ui/meta.js';
import { loadCategories, getMotors, invalidateMotors, categoryLabel } from '../state.js';
import { navigate } from '../router.js';

const TYPES = ['GANTI_OLI', 'SERVIS', 'BELANJA_PART'];
const ITEM_KEYS = ['category', 'brand', 'name', 'qty', 'unitPrice'];

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export async function render({ params, query, motor, mount }) {
  const isEdit = Boolean(params.id);
  const [allCategories, record] = await Promise.all([
    loadCategories(),
    isEdit ? call('records.get', { id: params.id }) : Promise.resolve(null),
  ]);
  const recordMotor = isEdit ? getMotors().find((m) => m.id === record.motorId) || motor : motor;
  if (!recordMotor) throw new Error('Motor untuk catatan ini tidak ditemukan.');
  const places = await call('records.places', { motorId: recordMotor.id }).catch(() => []);
  const activeCategories = allCategories.filter((c) => c.active);

  const presetCategory = !isEdit && activeCategories.some((c) => c.code === query.get('category')) ? query.get('category') : '';
  const queryType = query.get('type');
  const initialType = isEdit
    ? record.type
    : TYPES.includes(queryType) ? queryType
      : presetCategory ? (presetCategory.startsWith('OLI_') ? 'GANTI_OLI' : 'SERVIS') : 'GANTI_OLI';

  // ---------- Motor ----------
  const motorStrip = h('div', { class: 'motor-strip' },
    h('span', { class: 'tile-icon', style: { background: 'var(--card)' } }, icon('two_wheeler', 24)),
    h('div', { class: 'stack grow' },
      h('span', { class: 't-label truncate' }, [recordMotor.brand, recordMotor.model].filter(Boolean).join(' ') || recordMotor.name),
      h('span', { class: 'row gap-4 t-sm c-2' }, h('span', { class: 'c-ok' }, '●'), [recordMotor.plate, `${formatNumber(recordMotor.odometerCurrent)} km`].filter(Boolean).join(' • ')),
    ),
    h('span', { class: 'badge badge-sky' }, 'Aktif'),
  );

  // ---------- Jenis ----------
  const typeGroup = radioGroup({
    name: uid('type'),
    value: initialType,
    label: 'Jenis perawatan',
    options: TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t], iconName: TYPE_ICONS[t] })),
  });

  // ---------- Field utama ----------
  const dateInput = h('input', { type: 'date', required: true, value: isEdit ? record.date : todayISO(), max: addDaysISO(todayISO(), 1) });
  const odoInput = numberInput({ value: isEdit ? record.odometer : recordMotor.odometerCurrent, required: true });
  const datalistId = uid('places');
  const placeInput = h('input', { type: 'text', maxlength: '100', list: datalistId, value: isEdit ? record.place : '', placeholder: 'Nama bengkel / toko (cth: AHASS Sudirman)', autocomplete: 'off' });
  const placeList = h('datalist', { id: datalistId }, places.map((p) => h('option', { value: p })));
  const feeInput = numberInput({ value: isEdit ? record.serviceFee : null, placeholder: '0' });
  const notesInput = h('textarea', { maxlength: '1000', rows: '3', placeholder: 'Keluhan, saran mekanik, kondisi part, dll.' });
  notesInput.value = isEdit ? record.notes : '';

  // ---------- Item ----------
  const rows = [];
  const itemsWrap = h('div', { class: 'stack gap-12' });
  const itemCountBadge = h('span', { class: 'badge badge-primary' });
  const itemsError = h('div', { class: 'field', dataset: { field: 'items' } }, h('div', { class: 'field-error', id: uid('items-err'), role: 'alert', hidden: true }));

  const totalItemsEl = h('strong', { class: 'num' });
  const totalFeeEl = h('strong', { class: 'num' });
  const grandEl = h('span', { class: 't-stat c-primary', style: { fontSize: '28px', lineHeight: '34px', textAlign: 'right' } });

  function recalc() {
    let itemsTotal = 0;
    rows.forEach((r) => {
      const qty = readNumber(r.els.qty);
      const price = readNumber(r.els.unitPrice);
      const sub = qty > 0 && price >= 0 ? Math.round(qty * price) : 0;
      r.subtotalEl.textContent = formatRupiah(sub);
      itemsTotal += sub;
    });
    const fee = readNumber(feeInput);
    const feeVal = fee > 0 ? fee : 0;
    totalItemsEl.textContent = formatRupiah(itemsTotal);
    totalFeeEl.textContent = formatRupiah(feeVal);
    grandEl.textContent = formatRupiah(itemsTotal + feeVal);
    itemCountBadge.textContent = `${rows.length} item`;
  }

  function renumber() {
    rows.forEach((r, i) => {
      r.num.textContent = String(i + 1);
      r.title.textContent = `Item ${i + 1}`;
      r.removeBtn.setAttribute('aria-label', `Hapus item ${i + 1}`);
      ITEM_KEYS.forEach((k) => { r.wraps[k].dataset.field = `items.${i}.${k}`; });
    });
  }

  function categoryOptions(selected) {
    const opts = [h('option', { value: '' }, '— pilih kategori —')];
    activeCategories.forEach((c) => opts.push(h('option', { value: c.code, selected: c.code === selected }, c.label)));
    if (selected && !activeCategories.some((c) => c.code === selected)) {
      opts.push(h('option', { value: selected, selected: true }, `${categoryLabel(selected)} (nonaktif)`));
    }
    return opts;
  }

  function addRow(item = {}, focus = false) {
    const qty = numberInput({ value: item.qty ?? 1, integer: false, required: true });
    qty.setAttribute('aria-label', 'Qty');
    const els = {
      category: h('select', { required: true }, categoryOptions(item.category || '')),
      brand: h('input', { type: 'text', maxlength: '50', value: item.brand || '', placeholder: 'cth: Yamalube' }),
      name: h('input', { type: 'text', maxlength: '100', required: true, value: item.name || '', placeholder: 'cth: Yamalube Super Matic 10W-40 0.8L' }),
      qty,
      unitPrice: numberInput({ value: item.unitPrice ?? null, required: true, placeholder: '0' }),
    };
    const step = (delta) => {
      const v = readNumber(qty);
      const cur = v > 0 ? v : 1;
      const next = cur + delta;
      if (next >= 1) qty.setNumber(Math.round(next * 100) / 100);
      recalc();
    };
    const stepper = h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Kurangi qty', onclick: () => step(-1) }, icon('remove', 18)),
      qty,
      h('button', { type: 'button', 'aria-label': 'Tambah qty', onclick: () => step(1) }, icon('add', 18)),
    );
    const wraps = {
      category: field({ label: 'Kategori', input: els.category }),
      brand: field({ label: 'Merk', input: els.brand }),
      name: field({ label: 'Nama item', input: els.name }),
      qty: field({ label: 'Qty', input: qty, control: stepper }),
      unitPrice: field({ label: 'Harga satuan (Rp)', input: els.unitPrice, control: affix(els.unitPrice, 'Rp') }),
    };
    const num = h('span', { class: 'item-num' });
    const title = h('span', { class: 't-label' });
    const removeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm c-late' }, icon('delete', 18), 'Hapus');
    const subtotalEl = h('strong', { class: 'c-primary num', style: { fontSize: '16px' } });
    const row = h('div', { class: 'card item-card' },
      h('div', { class: 'item-card-head' }, h('span', { class: 'row gap-8' }, num, title), removeBtn),
      h('div', { class: 'card-pad' },
        wraps.category,
        wraps.brand,
        wraps.name,
        h('div', { class: 'field-grid' }, wraps.qty, wraps.unitPrice),
        h('div', { class: 'row-between mt-16' }, h('span', { class: 't-sm c-2' }, 'Subtotal item'), subtotalEl),
      ),
    );
    const entry = { row, els, wraps, num, title, removeBtn, subtotalEl };
    removeBtn.addEventListener('click', () => {
      rows.splice(rows.indexOf(entry), 1);
      row.remove();
      renumber();
      recalc();
      addBtn.focus();
    });
    ['input', 'blur'].forEach((ev) => {
      qty.addEventListener(ev, recalc);
      els.unitPrice.addEventListener(ev, recalc);
    });
    rows.push(entry);
    itemsWrap.appendChild(row);
    renumber();
    recalc();
    if (focus) els.category.focus();
    return entry;
  }

  const addBtn = h('button', { type: 'button', class: 'btn btn-dashed', onclick: () => addRow({}, true) }, icon('add_circle', 22), 'Tambah Item Part / Oli');
  ['input', 'blur'].forEach((ev) => feeInput.addEventListener(ev, recalc));

  function presetForType(type) {
    if (rows.length) return;
    if (type === 'GANTI_OLI') addRow({ category: 'OLI_MESIN' });
    else if (type === 'BELANJA_PART') addRow({});
  }

  if (isEdit) record.items.forEach((it) => addRow(it));
  else if (presetCategory) addRow({ category: presetCategory });
  else presetForType(initialType);
  Object.values(typeGroup.inputs).forEach((r) => r.addEventListener('change', () => presetForType(typeGroup.value)));

  // ---------- Form ----------
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('save', 20), isEdit ? 'Simpan Perubahan' : 'Simpan Catatan');
  const cancelHref = isEdit ? `#/records/${encodeURIComponent(record.id)}` : '#/';

  const form = h('form', { novalidate: true, class: 'stack', style: { gap: '16px' } },
    motorStrip,
    h('div', { class: 'field', dataset: { field: 'type' } }, h('span', { class: 'label' }, 'Jenis perawatan'), typeGroup.el, h('div', { class: 'field-error', hidden: true })),
    h('div', { class: 'card card-pad' },
      h('div', { class: 'field-grid' },
        field({ label: 'Tanggal', required: true, input: dateInput, name: 'date' }),
        field({
          label: 'Odometer (km)', required: true, input: odoInput, name: 'odometer',
          hint: [icon('check_circle', 14), `Terkini: ${formatNumber(recordMotor.odometerCurrent)} km`], hintTone: 'ok',
        }),
      ),
      field({ label: 'Tempat bengkel / toko', input: placeInput, name: 'place', control: affix(placeInput, icon('storefront', 20)) }),
      placeList,
    ),
    h('section', { class: 'stack gap-12', 'aria-labelledby': 'items-h' },
      h('div', { class: 'row-between' },
        h('h2', { class: 'row gap-8 t-h3', id: 'items-h' }, 'Part & Oli', itemCountBadge),
        h('span', { class: 't-sm c-2' }, 'Rincian belanja suku cadang'),
      ),
      itemsWrap,
      itemsError,
      addBtn,
    ),
    h('div', { class: 'card card-pad' },
      field({ label: 'Biaya jasa mekanik (Rp)', aside: 'Opsional', input: feeInput, name: 'serviceFee', control: affix(feeInput, 'Rp') }),
      field({ label: 'Catatan perawatan', input: notesInput, name: 'notes' }),
    ),
    h('div', { class: 'summary-card', 'aria-live': 'polite' },
      h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, 'Total part & bahan'), totalItemsEl),
      h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, 'Biaya jasa bengkel'), totalFeeEl),
      h('div', { class: 'summary-total' },
        h('div', { class: 'stack' }, h('span', { class: 't-h3' }, 'Total biaya'), h('span', { class: 't-sm c-2' }, 'Otomatis masuk ke buku pengeluaran')),
        grandEl,
      ),
    ),
    h('div', { class: 'action-bar' },
      h('a', { class: 'btn btn-outline', href: cancelHref }, 'Batal'),
      submitBtn,
    ),
  );

  function collect() {
    const fee = readNumber(feeInput);
    return {
      type: typeGroup.value,
      date: dateInput.value,
      odometer: readNumber(odoInput),
      place: placeInput.value.trim(),
      serviceFee: fee === null ? 0 : fee,
      notes: notesInput.value.trim(),
      items: rows.map((r) => ({
        category: r.els.category.value,
        name: r.els.name.value.trim(),
        brand: r.els.brand.value.trim(),
        qty: readNumber(r.els.qty),
        unitPrice: readNumber(r.els.unitPrice),
      })),
    };
  }

  let submitting = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    const data = collect();
    const errors = validateRecord(data);
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    showFieldErrors(form, {});

    submitting = true;
    const restore = busy(submitBtn);
    const payload = isEdit ? { id: record.id, ...data } : { motorId: recordMotor.id, ...data };
    const action = isEdit ? 'records.update' : 'records.create';
    try {
      let saved;
      try {
        saved = await call(action, payload);
      } catch (err) {
        if (err.code !== 'ODOMETER_LOWER') throw err;
        const ok = await confirmDialog(err.message, { title: 'Odometer lebih kecil', okText: 'Tetap simpan' });
        if (!ok) { showFieldErrors(form, err.fields || {}); return; }
        saved = await call(action, { ...payload, confirmOdometer: true });
      }
      invalidateMotors();
      toast(isEdit ? 'Perubahan disimpan' : 'Catatan disimpan', 'success');
      navigate(`/records/${encodeURIComponent(saved.id)}`, { replace: true });
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && err.fields) {
        const rest = showFieldErrors(form, err.fields);
        if (Object.keys(rest).length) toastError(err);
      } else {
        toastError(err);
      }
    } finally {
      submitting = false;
      restore();
    }
  });

  mount(h('h1', { class: 'visually-hidden', tabindex: '-1' }, isEdit ? 'Edit catatan' : 'Tambah catatan'), form);
}
