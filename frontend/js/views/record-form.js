import { h, uid } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatKm, todayISO, TYPE_LABELS } from '../utils/format.js';
import { validateRecord } from '../utils/validate.js';
import {
  pageHead, field, numberInput, readNumber, showFieldErrors, busy, toast, toastError, confirmDialog,
} from '../ui/components.js';
import { loadCategories, getMotors, invalidateMotors, categoryLabel } from '../state.js';
import { navigate } from '../router.js';

const TYPES = ['GANTI_OLI', 'SERVIS', 'BELANJA_PART'];
const ITEM_KEYS = ['category', 'name', 'brand', 'qty', 'unitPrice'];

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

  const initialType = isEdit ? record.type : (TYPES.includes(query.get('type')) ? query.get('type') : 'GANTI_OLI');

  // ---------- field utama ----------
  const typeGroupName = uid('type');
  const typeRadios = {};
  const typeControl = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Jenis catatan' },
    TYPES.map((t) => {
      const id = uid('t');
      typeRadios[t] = h('input', { type: 'radio', name: typeGroupName, id, value: t, checked: t === initialType });
      return [typeRadios[t], h('label', { for: id }, TYPE_LABELS[t])];
    }),
  );

  const dateInput = h('input', { type: 'date', required: true, value: isEdit ? record.date : todayISO(), max: addDaysISO(todayISO(), 1) });
  const odoInput = numberInput({ value: isEdit ? record.odometer : recordMotor.odometerCurrent, required: true });
  const datalistId = uid('places');
  const placeInput = h('input', { type: 'text', maxlength: '100', list: datalistId, value: isEdit ? record.place : '', placeholder: 'Nama bengkel / toko', autocomplete: 'off' });
  const placeList = h('datalist', { id: datalistId }, places.map((p) => h('option', { value: p })));
  const feeInput = numberInput({ value: isEdit ? record.serviceFee : null, placeholder: '0' });
  const notesInput = h('textarea', { maxlength: '1000', rows: '3', placeholder: 'Keluhan, saran mekanik, dll.' });
  notesInput.value = isEdit ? record.notes : '';

  // ---------- item ----------
  const rows = [];
  const itemsWrap = h('div');
  const itemsError = h('div', { class: 'field', dataset: { field: 'items' } }, h('div', { class: 'field-error', id: uid('items-err'), role: 'alert', hidden: true }));

  const totalItemsEl = h('span');
  const totalFeeEl = h('span');
  const grandEl = h('span');

  function recalc() {
    let itemsTotal = 0;
    rows.forEach((r) => {
      const qty = readNumber(r.els.qty);
      const price = readNumber(r.els.unitPrice);
      const sub = qty > 0 && price >= 0 ? Math.round(qty * price) : 0;
      r.subtotalEl.textContent = `Subtotal ${formatRupiah(sub)}`;
      itemsTotal += sub;
    });
    const fee = readNumber(feeInput);
    const feeVal = fee > 0 ? fee : 0;
    totalItemsEl.textContent = formatRupiah(itemsTotal);
    totalFeeEl.textContent = formatRupiah(feeVal);
    grandEl.textContent = formatRupiah(itemsTotal + feeVal);
  }

  function renumber() {
    rows.forEach((r, i) => {
      r.title.textContent = `Item ${i + 1}`;
      r.removeBtn.setAttribute('aria-label', `Hapus item ${i + 1}`);
      ITEM_KEYS.forEach((k) => { r.wraps[k].dataset.field = `items.${i}.${k}`; });
    });
  }

  function categoryOptions(selected) {
    const opts = [h('option', { value: '' }, '— pilih —')];
    activeCategories.forEach((c) => opts.push(h('option', { value: c.code, selected: c.code === selected }, c.label)));
    if (selected && !activeCategories.some((c) => c.code === selected)) {
      opts.push(h('option', { value: selected, selected: true }, `${categoryLabel(selected)} (nonaktif)`));
    }
    return opts;
  }

  function addRow(item = {}, focus = false) {
    const els = {
      category: h('select', { required: true }, categoryOptions(item.category || '')),
      name: h('input', { type: 'text', maxlength: '100', required: true, value: item.name || '', placeholder: 'contoh: Yamalube Matic 0.8L' }),
      brand: h('input', { type: 'text', maxlength: '50', value: item.brand || '' }),
      qty: numberInput({ value: item.qty ?? 1, integer: false, required: true }),
      unitPrice: numberInput({ value: item.unitPrice ?? null, required: true, placeholder: '0' }),
    };
    const wraps = {
      category: field({ label: 'Kategori', input: els.category, className: 'span-2' }),
      name: field({ label: 'Nama item', input: els.name, className: 'span-2' }),
      brand: field({ label: 'Merk', input: els.brand, className: 'span-2' }),
      qty: field({ label: 'Qty', input: els.qty }),
      unitPrice: field({ label: 'Harga satuan (Rp)', input: els.unitPrice }),
    };
    const title = h('span');
    const removeBtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, '✕ Hapus');
    const subtotalEl = h('div', { class: 'item-subtotal' });
    const row = h('div', { class: 'item-row' },
      h('div', { class: 'item-row-head' }, title, removeBtn),
      h('div', { class: 'item-grid' }, ITEM_KEYS.map((k) => wraps[k])),
      subtotalEl,
    );
    const entry = { row, els, wraps, title, removeBtn, subtotalEl };
    removeBtn.addEventListener('click', () => {
      const idx = rows.indexOf(entry);
      rows.splice(idx, 1);
      row.remove();
      renumber();
      recalc();
      addBtn.focus();
    });
    els.qty.addEventListener('input', recalc);
    els.unitPrice.addEventListener('input', recalc);
    els.qty.addEventListener('blur', recalc);
    els.unitPrice.addEventListener('blur', recalc);
    rows.push(entry);
    itemsWrap.appendChild(row);
    renumber();
    recalc();
    if (focus) els.category.focus();
    return entry;
  }

  const addBtn = h('button', { type: 'button', class: 'btn btn-block', onclick: () => addRow({}, true) }, '＋ Tambah item');
  feeInput.addEventListener('input', recalc);
  feeInput.addEventListener('blur', recalc);

  function presetForType(type) {
    if (rows.length) return;
    if (type === 'GANTI_OLI') addRow({ category: 'OLI_MESIN' });
    else if (type === 'BELANJA_PART') addRow({});
  }

  if (isEdit) record.items.forEach((it) => addRow(it));
  else presetForType(initialType);

  Object.values(typeRadios).forEach((r) => r.addEventListener('change', () => presetForType(currentType())));
  const currentType = () => TYPES.find((t) => typeRadios[t].checked);

  // ---------- form ----------
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'Simpan perubahan' : 'Simpan');
  const cancelHref = isEdit ? `#/records/${encodeURIComponent(record.id)}` : '#/records';

  const form = h('form', { novalidate: true },
    h('div', { class: 'card' },
      h('div', { class: 'field', dataset: { field: 'type' } }, h('span', { class: 'label' }, 'Jenis'), typeControl, h('div', { class: 'field-error', hidden: true })),
      h('div', { class: 'field-row' },
        field({ label: 'Tanggal *', input: dateInput, name: 'date' }),
        field({ label: 'Odometer (km) *', input: odoInput, name: 'odometer', hint: `Terkini ${formatKm(recordMotor.odometerCurrent)}` }),
      ),
      field({ label: 'Tempat', input: placeInput, name: 'place' }),
      placeList,
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Part / oli')),
      itemsWrap,
      itemsError,
      addBtn,
    ),
    h('div', { class: 'card' },
      field({ label: 'Biaya jasa (Rp)', input: feeInput, name: 'serviceFee' }),
      field({ label: 'Catatan', input: notesInput, name: 'notes' }),
      h('div', { class: 'totals', 'aria-live': 'polite' },
        h('div', null, h('span', null, 'Total part'), totalItemsEl),
        h('div', null, h('span', null, 'Biaya jasa'), totalFeeEl),
        h('div', { class: 'grand' }, h('span', null, 'Total'), grandEl),
      ),
    ),
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn', href: cancelHref }, 'Batal'),
      submitBtn,
    ),
  );

  function collect() {
    const fee = readNumber(feeInput);
    return {
      type: currentType(),
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

  function showErrors(errors) {
    const rest = showFieldErrors(form, errors);
    if (errors.items) itemsError.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return rest;
  }

  let submitting = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    const data = collect();
    const errors = validateRecord(data);
    if (Object.keys(errors).length) { showErrors(errors); return; }
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
        const rest = showErrors(err.fields);
        if (Object.keys(rest).length) toastError(err);
      } else {
        toastError(err);
      }
    } finally {
      submitting = false;
      restore();
    }
  });

  mount(pageHead(isEdit ? 'Edit catatan' : 'Catatan baru'), form);
}
