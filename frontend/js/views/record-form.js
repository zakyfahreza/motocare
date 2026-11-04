import { h, uid } from '../utils/dom.js';
import { call, readMany } from '../api.js';
import { formatRupiah, formatNumber, formatLiters, todayISO, TYPE_LABELS, parseDetails } from '../utils/format.js';
import { validateRecord } from '../utils/validate.js';
import {
  field, numberInput, readNumber, showFieldErrors, busy, toast, toastError, confirmDialog, affix, radioGroup, toggleSwitch,
} from '../ui/components.js';
import { icon } from '../ui/icons.js';
import {
  RECORD_GROUPS, SERVICE_TAGS, serviceTypeFromTags, tagsFromType, groupOfType, FUEL_STATIONS, FUEL_TYPES,
  TIRE_ACTIONS, TIRE_POSITIONS, TIRE_BRANDS, TIRE_SHOPS,
} from '../ui/meta.js';
import { getMotors, categoryLabel } from '../state.js';
import { navigate } from '../router.js';
import { attachmentPicker, rememberPhotos, cachedPhoto } from '../photos.js';

const ITEM_KEYS = ['category', 'brand', 'name', 'qty', 'unitPrice'];

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Tombol chip. multi=false → pilihan tunggal. onChange(values). */
function chipGroup({ options, value = [], multi = false, label, onChange, className = '' }) {
  let selected = Array.isArray(value) ? value.slice() : value ? [value] : [];
  const buttons = new Map();
  const el = h('div', { class: ['chip-row', className], role: 'group', 'aria-label': label });
  options.forEach((o) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(selected.includes(o.value)) }, o.iconName ? icon(o.iconName, 16) : null, o.label);
    b.addEventListener('click', () => {
      const on = selected.includes(o.value);
      if (multi) selected = on ? selected.filter((v) => v !== o.value) : [...selected, o.value];
      else selected = on ? [] : [o.value];
      sync();
      if (onChange) onChange(selected.slice(), o.value, !on);
    });
    buttons.set(o.value, b);
    el.appendChild(b);
  });
  function sync() { buttons.forEach((b, v) => b.setAttribute('aria-pressed', String(selected.includes(v)))); }
  return {
    el,
    get values() { return selected.slice(); },
    set values(v) { selected = v.slice(); sync(); },
  };
}

/** Stepper angka dengan tombol − / +. */
function stepper(input, { step = 1, min = 0, label, onChange }) {
  const bump = (d) => {
    const v = readNumber(input);
    const cur = v === null || Number.isNaN(v) ? min : v;
    const next = Math.max(min, Math.round((cur + d) * 100) / 100);
    input.setNumber(next);
    if (onChange) onChange();
  };
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': `Kurangi ${label}`, onclick: () => bump(-step) }, icon('remove', 18)),
    input,
    h('button', { type: 'button', 'aria-label': `Tambah ${label}`, onclick: () => bump(step) }, icon('add', 18)),
  );
}

/** Konsumsi BBM (full-to-full), sama dengan Logic.fuelEconomy di backend. */
function previewEconomy(fills, candidate) {
  const all = [...fills, candidate].sort((a, b) => a.odometer - b.odometer);
  let lastFull = null;
  let acc = 0;
  let result = null;
  for (const f of all) {
    if (lastFull === null) { if (f.fullTank) { lastFull = f.odometer; acc = 0; } continue; }
    acc += Number(f.liters) || 0;
    if (f.fullTank) {
      if (f === candidate && f.odometer - lastFull > 0 && acc > 0) {
        result = { distance: f.odometer - lastFull, liters: acc, kmPerL: Math.round(((f.odometer - lastFull) / acc) * 10) / 10 };
      }
      lastFull = f.odometer;
      acc = 0;
    }
  }
  return result;
}

export async function render({ params, query, motor, mount }) {
  const isEdit = Boolean(params.id);
  const [settings, record] = await readMany([['settings.get'], ...(isEdit ? [['records.get', { id: params.id }]] : [])]);
  const recordMotor = isEdit ? getMotors().find((m) => m.id === record.motorId) || motor : motor;
  if (!recordMotor) throw new Error('Motor untuk catatan ini tidak ditemukan.');
  const [places, fuelHistoryAll] = await readMany([['records.places', { motorId: recordMotor.id }], ['records.fuelHistory', { motorId: recordMotor.id }]]).catch(() => [[], []]);
  const fuelHistory = fuelHistoryAll.filter((f) => !isEdit || f.id !== record.id);
  const activeCategories = settings.categories.filter((c) => c.active);
  const details = isEdit ? parseDetails(record.details) : {};

  // ---------- Nilai awal ----------
  const queryType = query.get('type');
  const presetCategory = !isEdit && activeCategories.some((c) => c.code === query.get('category')) ? query.get('category') : '';
  let group = isEdit ? groupOfType(record.type)
    : queryType === 'BENSIN' || queryType === 'BAN' ? queryType
      : presetCategory === 'BAN_DEPAN' || presetCategory === 'BAN_BELAKANG' ? 'BAN' : 'SERVIS';
  const initialTags = isEdit
    ? (record.tags ? record.tags.split(',') : tagsFromType(record.type))
    : queryType === 'GANTI_OLI' ? ['GANTI_OLI_MESIN']
      : queryType === 'BELANJA_PART' ? ['BELI_PART']
        : presetCategory && presetCategory.startsWith('OLI_') ? [presetCategory === 'OLI_GARDAN' ? 'GANTI_OLI_GARDAN' : 'GANTI_OLI_MESIN']
          : ['SERVIS_RUTIN'];

  // ---------- Motor ----------
  const thumb = cachedPhoto(recordMotor);
  const motorStrip = h('div', { class: 'motor-strip' },
    h('span', { class: ['tile-icon', thumb && 'has-photo'], style: { background: 'var(--card)' } }, thumb ? h('img', { class: 'photo', src: thumb, alt: '' }) : icon('two_wheeler', 24)),
    h('div', { class: 'stack grow' },
      h('span', { class: 't-label truncate' }, [recordMotor.brand, recordMotor.model].filter(Boolean).join(' ') || recordMotor.name),
      h('span', { class: 'row gap-4 t-sm c-2' }, h('span', { class: 'c-ok' }, '●'), [recordMotor.plate, `${formatNumber(recordMotor.odometerCurrent)} km`].filter(Boolean).join(' • ')),
    ),
    h('span', { class: 'badge badge-sky' }, 'Aktif'),
  );

  // ---------- Kategori catatan ----------
  const groupRadio = radioGroup({
    name: uid('group'), value: group, label: 'Kategori catatan',
    options: RECORD_GROUPS.map((g) => ({ value: g.key, label: g.label, iconName: g.iconName })),
  });
  if (isEdit) Object.values(groupRadio.inputs).forEach((i) => { if (i.value !== group) i.disabled = true; });

  // ---------- Field umum ----------
  const dateInput = h('input', { type: 'date', required: true, value: isEdit ? record.date : todayISO(), max: addDaysISO(todayISO(), 1) });
  const odoInput = numberInput({ value: isEdit ? record.odometer : recordMotor.odometerCurrent, required: true });
  const odoHint = h('span');
  const dateField = field({ label: 'Tanggal', required: true, input: dateInput, name: 'date' });
  const odoField = field({ label: 'Odometer (km)', required: true, input: odoInput, name: 'odometer', hint: [icon('check_circle', 14), odoHint], hintTone: 'ok' });
  const datalistId = uid('places');
  const placeInput = h('input', { type: 'text', maxlength: '100', list: datalistId, value: isEdit ? record.place : '', autocomplete: 'off' });
  const placeIcon = h('span', { style: { display: 'flex' } }, icon('storefront', 20));
  const placeField = field({ label: 'Tempat / Bengkel', input: placeInput, name: 'place', control: affix(placeInput, placeIcon) });
  const placeList = h('datalist', { id: datalistId }, places.map((p) => h('option', { value: p })));
  const notesInput = h('textarea', { maxlength: '1000', rows: '3' });
  notesInput.value = isEdit ? record.notes : '';
  const notesField = field({ label: 'Catatan', input: notesInput, name: 'notes' });

  const existingPhotos = isEdit ? String(record.photoIds || '').split(',').filter(Boolean).map((id) => ({ id })) : [];
  const attach = attachmentPicker({ existing: existingPhotos, max: 2 });
  const photoTitle = h('span');
  const photoAside = h('span', { class: 'row gap-4 t-sm c-ok', style: { fontWeight: '600' } }, icon('photo_camera', 14), 'Maks 2 foto');
  const photoHint = h('p', { class: 'hint mt-8' });
  const photoField = h('div', { class: 'field', dataset: { field: 'photos' } },
    h('span', { class: 'label' }, photoTitle, photoAside),
    attach.el,
    photoHint,
    h('div', { class: 'field-error', hidden: true }),
  );

  // =====================================================================
  // SERVIS
  // =====================================================================
  const rows = [];
  const itemsWrap = h('div', { class: 'stack gap-12' });
  const itemCountBadge = h('span', { class: 'badge badge-primary' });
  const itemsError = h('div', { class: 'field', dataset: { field: 'items' } }, h('div', { class: 'field-error', id: uid('items-err'), role: 'alert', hidden: true }));
  const feeInput = numberInput({ value: isEdit && groupOfType(record.type) === 'SERVIS' ? record.serviceFee : null, placeholder: '0' });
  const typeHint = h('p', { class: 'hint mt-8' });

  function categoryOptions(selected) {
    const opts = [h('option', { value: '' }, '— pilih kategori —')];
    activeCategories.forEach((c) => opts.push(h('option', { value: c.code, selected: c.code === selected }, c.label)));
    if (selected && !activeCategories.some((c) => c.code === selected)) {
      opts.push(h('option', { value: selected, selected: true }, `${categoryLabel(selected)} (nonaktif)`));
    }
    return opts;
  }

  function renumber() {
    rows.forEach((r, i) => {
      r.num.textContent = String(i + 1);
      r.title.textContent = `Item ${i + 1}`;
      r.removeBtn.setAttribute('aria-label', `Hapus item ${i + 1}`);
      ITEM_KEYS.forEach((k) => { r.wraps[k].dataset.field = `items.${i}.${k}`; });
    });
  }

  function addRow(item = {}, focus = false) {
    const qty = numberInput({ value: item.qty ?? 1, integer: false, required: true });
    qty.setAttribute('aria-label', 'Qty');
    const els = {
      category: h('select', { required: true }, categoryOptions(item.category || '')),
      brand: h('input', { type: 'text', maxlength: '50', value: item.brand || '', placeholder: 'Yamalube / Motul / Shell' }),
      name: h('input', { type: 'text', maxlength: '100', required: true, value: item.name || '', placeholder: 'cth: Yamalube Super Matic 10W-40 0.8L' }),
      qty,
      unitPrice: numberInput({ value: item.unitPrice ?? null, required: true, placeholder: '0' }),
    };
    const wraps = {
      category: field({ label: 'Kategori', input: els.category }),
      brand: field({ label: 'Merk', input: els.brand }),
      name: field({ label: 'Nama item', input: els.name }),
      qty: field({ label: 'Qty', input: qty, control: stepper(qty, { step: 1, min: 1, label: 'qty', onChange: recalc }) }),
      unitPrice: field({ label: 'Harga satuan (Rp)', input: els.unitPrice, control: affix(els.unitPrice, 'Rp') }),
    };
    const num = h('span', { class: 'item-num' });
    const title = h('span', { class: 't-label' });
    const removeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm c-late' }, icon('delete', 18), 'Hapus');
    const subtotalEl = h('strong', { class: 'c-primary num', style: { fontSize: '16px' } });
    const row = h('div', { class: 'card item-card' },
      h('div', { class: 'item-card-head' }, h('span', { class: 'row gap-8' }, num, title), removeBtn),
      h('div', { class: 'card-pad' },
        wraps.category, wraps.brand, wraps.name,
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
      addItemBtn.focus();
    });
    ['input', 'blur'].forEach((ev) => { qty.addEventListener(ev, recalc); els.unitPrice.addEventListener(ev, recalc); });
    rows.push(entry);
    itemsWrap.appendChild(row);
    renumber();
    recalc();
    if (focus) els.category.focus();
    return entry;
  }

  const addItemBtn = h('button', { type: 'button', class: 'btn btn-dashed', onclick: () => addRow({}, true) }, icon('add_circle', 22), 'Tambah Item Part / Oli');
  ['input', 'blur'].forEach((ev) => feeInput.addEventListener(ev, recalc));

  const tagChips = chipGroup({
    options: SERVICE_TAGS.map((t) => ({ value: t.code, label: t.label })),
    value: initialTags,
    multi: true,
    label: 'Jenis servis dilakukan',
    onChange: (values, changed, on) => {
      // "Beli Part Saja" tidak bisa digabung dengan jenis servis lain.
      if (on && changed === 'BELI_PART') tagChips.values = ['BELI_PART'];
      else if (on && values.includes('BELI_PART')) tagChips.values = values.filter((v) => v !== 'BELI_PART');
      // Ganti oli → otomatis tambah baris item oli bila belum ada.
      const tag = SERVICE_TAGS.find((t) => t.code === changed);
      if (on && tag && tag.category && !rows.some((r) => r.els.category.value === tag.category)) {
        const empty = rows.find((r) => !r.els.category.value && !r.els.name.value);
        if (empty) empty.els.category.value = tag.category;
        else addRow({ category: tag.category });
      }
      if (on && changed === 'BELI_PART' && !rows.length) addRow({});
      updateTypeHint();
    },
  });
  function updateTypeHint() {
    typeHint.replaceChildren(icon('info', 14), `Disimpan sebagai: ${TYPE_LABELS[serviceTypeFromTags(tagChips.values)]}`);
  }

  const servicePanel = h('div', { class: 'stack', style: { gap: '16px' } },
    h('div', { class: 'card card-pad' },
      h('div', { class: 'field', dataset: { field: 'tags' } }, h('span', { class: 'label' }, 'Jenis servis dilakukan'), tagChips.el, typeHint, h('div', { class: 'field-error', hidden: true })),
    ),
    h('section', { class: 'stack gap-12', 'aria-labelledby': 'items-h' },
      h('div', { class: 'row-between' },
        h('h2', { class: 'row gap-8 t-h3', id: 'items-h' }, 'Rincian Part & Oli', itemCountBadge),
        h('span', { class: 't-sm c-2' }, 'Suku cadang diganti'),
      ),
      itemsWrap,
      itemsError,
      addItemBtn,
    ),
    h('div', { class: 'card card-pad' },
      field({ label: 'Biaya jasa mekanik (Rp)', aside: 'Opsional', input: feeInput, name: 'serviceFee', control: affix(feeInput, 'Rp') }),
    ),
  );

  // =====================================================================
  // BENSIN
  // =====================================================================
  const fuel0 = details.fuel || {};
  let station = fuel0.station || '';
  const stationChips = chipGroup({
    options: FUEL_STATIONS.map((s) => ({ value: s, label: s })),
    value: station,
    label: 'Nama SPBU',
    onChange: (v) => {
      station = v[0] || '';
      const p = placeInput.value.trim();
      if (station && (!p || FUEL_STATIONS.some((s) => p === s))) placeInput.value = station;
    },
  });
  let fuelType = fuel0.fuelType || '';
  let lastSuggestedPrice = null;
  const fuelChips = chipGroup({
    options: FUEL_TYPES.map((f) => ({ value: f.name, label: f.name })),
    value: fuelType,
    label: 'Jenis bahan bakar',
    onChange: (v) => {
      fuelType = v[0] || '';
      const ft = FUEL_TYPES.find((f) => f.name === fuelType);
      const cur = readNumber(priceInput);
      if (ft && (cur === null || cur === lastSuggestedPrice)) { priceInput.setNumber(ft.price); lastSuggestedPrice = ft.price; }
      if (ft && !station) { stationChips.values = [ft.station]; station = ft.station; if (!placeInput.value.trim()) placeInput.value = ft.station; }
      recalc();
    },
  });
  const fuelOther = h('input', { type: 'text', maxlength: '40', placeholder: 'Jenis lain (cth: Dexlite)', 'aria-label': 'Jenis bahan bakar lain', value: fuel0.fuelType && !FUEL_TYPES.some((f) => f.name === fuel0.fuelType) ? fuel0.fuelType : '' });
  fuelOther.addEventListener('input', () => { if (fuelOther.value.trim()) { fuelChips.values = []; fuelType = ''; } });
  const fullTank = toggleSwitch({ checked: isEdit ? fuel0.fullTank === true : true, label: 'Isi penuh (full tank)' });
  const litersInput = numberInput({ value: fuel0.liters ?? null, integer: false, placeholder: '0,0' });
  litersInput.setAttribute('aria-label', 'Jumlah liter');
  const priceInput = numberInput({ value: fuel0.pricePerLiter ?? null, placeholder: '0' });
  const payInput = numberInput({ value: isEdit && fuel0.liters ? record.grandTotal : null, placeholder: '0' });
  const fuelSubtotal = h('strong', { class: 'c-primary num', style: { fontSize: '17px' } });
  const ecoValue = h('span', { class: 't-stat c-primary', style: { fontSize: '22px' } });
  const ecoSub = h('span', { class: 't-sm c-2' });
  const ecoDistance = h('strong', { class: 'num' });

  // Bayar (Rp) ↔ liter: isi salah satu, yang lain dihitung.
  payInput.addEventListener('input', () => {
    const pay = readNumber(payInput);
    const price = readNumber(priceInput);
    if (pay > 0 && price > 0) litersInput.setNumber(Math.round((pay / price) * 100) / 100);
    recalc(true);
  });
  ['input', 'blur'].forEach((ev) => { litersInput.addEventListener(ev, () => recalc()); priceInput.addEventListener(ev, () => recalc()); });
  odoInput.addEventListener('input', () => recalc(true));
  fullTank.input.addEventListener('change', () => recalc(true));

  const fuelPanel = h('div', { class: 'stack', style: { gap: '16px' } },
    h('div', { class: 'card card-pad' },
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Nama SPBU / lokasi'), stationChips.el),
      h('div', { class: 'mt-8', dataset: { slot: 'place-fuel' } }),
      h('div', { class: 'field mt-16', dataset: { field: 'fuel.fuelType' } }, h('span', { class: 'label' }, h('span', null, 'Jenis bahan bakar', h('span', { class: 'req' }, ' *'))), fuelChips.el, fuelOther, h('div', { class: 'field-error', hidden: true })),
      h('label', { class: 'option-card mt-16' },
        h('span', { class: 'tile-icon' }, icon('ev_station', 22)),
        h('span', { class: 'stack grow' },
          h('span', { class: 'row gap-8 t-title' }, 'Isi Penuh (Full Tank)', h('span', { class: 'badge badge-primary' }, 'Rekomendasi')),
          h('span', { class: 't-sm c-2' }, 'Aktifkan untuk kalkulasi akurat konsumsi km/liter'),
        ),
        fullTank.el,
      ),
    ),
    h('section', { class: 'calc-card', 'aria-labelledby': 'calc-h' },
      h('div', { class: 'row-between' },
        h('h2', { class: 'row gap-8 t-title c-primary', id: 'calc-h' }, icon('calculate', 20), 'Kalkulator Pembelian BBM'),
        h('span', { class: 't-sm c-2' }, 'Otomatis terhitung'),
      ),
      h('div', { class: 'field-grid mt-12' },
        field({ label: 'Jumlah liter (L)', input: litersInput, name: 'fuel.liters', control: stepper(litersInput, { step: 0.5, min: 0, label: 'liter', onChange: () => recalc() }) }),
        field({ label: 'Harga per liter', input: priceInput, name: 'fuel.pricePerLiter', control: affix(priceInput, 'Rp') }),
      ),
      field({ label: 'Atau isi nominal bayar', aside: 'Liter dihitung otomatis', input: payInput, control: affix(payInput, 'Rp') }),
      h('div', { class: 'row-between mt-12', style: { paddingTop: '12px', borderTop: '1px solid var(--divider)' } }, h('span', { class: 't-sm c-2' }, 'Subtotal pembelian'), fuelSubtotal),
    ),
    h('section', { class: 'eco-card', 'aria-live': 'polite' },
      h('div', { class: 'row-between' },
        h('span', { class: 'row gap-8 t-label' }, icon('speed', 20), 'Estimasi Konsumsi Bahan Bakar'),
        ecoValue,
      ),
      ecoSub,
      h('div', { class: 'row-between mt-8 t-sm c-2' }, h('span', { class: 'row gap-4' }, icon('route', 16), 'Jarak tempuh sejak isi terakhir'), ecoDistance),
    ),
  );

  // =====================================================================
  // BAN
  // =====================================================================
  const tire0 = details.tire || {};
  const actionRadio = radioGroup({
    name: uid('tact'), className: 'option-grid', label: 'Tipe perawatan ban', value: tire0.action || 'GANTI',
    options: TIRE_ACTIONS.map((a) => ({ value: a.code, label: a.label, iconName: a.iconName })),
  });
  // Tambahkan sub-judul ke setiap kartu pilihan.
  actionRadio.el.querySelectorAll('label').forEach((lab, i) => lab.appendChild(h('span', { class: 't-sm option-sub' }, TIRE_ACTIONS[i].sub)));
  const positionRadio = radioGroup({
    name: uid('tpos'), className: 'segmented light', label: 'Posisi ban', value: tire0.position || 'BELAKANG',
    options: TIRE_POSITIONS.map((p) => ({ value: p.code, label: p.label, iconName: p.iconName })),
  });
  const tireBrand = h('input', { type: 'text', maxlength: '60', value: tire0.brand || '', placeholder: 'Nama merk & seri (cth: Michelin Pilot Street 2)' });
  const brandChips = chipGroup({
    options: TIRE_BRANDS.map((b) => ({ value: b, label: b })),
    value: TIRE_BRANDS.find((b) => (tire0.brand || '').startsWith(b)) || '',
    label: 'Pilihan merk cepat',
    onChange: (v) => { if (v[0] && !tireBrand.value.startsWith(v[0])) { tireBrand.value = `${v[0]} `; tireBrand.focus(); } },
  });
  const tireSize = h('input', { type: 'text', maxlength: '30', value: tire0.size || '', placeholder: 'cth: 140/70-14' });
  const tireDot = h('input', { type: 'text', maxlength: '30', value: tire0.dot || '', placeholder: 'cth: 2424 (minggu 24/2024)' });
  const constructionRadio = radioGroup({
    name: uid('tcon'), className: 'segmented light', label: 'Konstruksi ban', value: tire0.construction || 'TL',
    options: [{ value: 'TL', label: 'Tubeless (TL)' }, { value: 'TT', label: 'Tube Type (TT)' }],
  });
  const psiFront = numberInput({ value: tire0.psiFront ?? null, placeholder: '29' });
  psiFront.setAttribute('aria-label', 'Tekanan ban depan (PSI)');
  const psiRear = numberInput({ value: tire0.psiRear ?? null, placeholder: '33' });
  psiRear.setAttribute('aria-label', 'Tekanan ban belakang (PSI)');
  const gasRadio = radioGroup({
    name: uid('tgas'), className: 'segmented light', label: 'Jenis gas pengisian', value: tire0.gas || 'N2',
    options: [{ value: 'N2', label: 'Nitrogen (N2)', iconName: 'eco' }, { value: 'ANGIN', label: 'Angin biasa', iconName: 'mode_fan' }],
  });
  const shopChips = chipGroup({
    options: TIRE_SHOPS.map((s) => ({ value: s, label: `+ ${s}` })),
    label: 'Toko ban cepat',
    onChange: (v) => { if (v[0]) placeInput.value = v[0]; },
  });
  const tirePrice = numberInput({ value: tire0.tirePrice || null, placeholder: '0' });
  const installFee = numberInput({ value: tire0.installFee || null, placeholder: '0' });
  const extraFee = numberInput({ value: tire0.extraFee || null, placeholder: '0' });
  const tirePriceLabel = h('span');
  const installLabel = h('span');
  const tireSubLabel = h('span', { class: 't-sm c-2' });
  ['input', 'blur'].forEach((ev) => [tirePrice, installFee, extraFee].forEach((i) => i.addEventListener(ev, () => recalc())));

  const specSection = h('section', { class: 'card card-pad' },
    h('div', { class: 'row gap-12', style: { marginBottom: '14px' } }, h('span', { class: 'tile-icon sm' }, icon('style', 18)),
      h('span', { class: 'stack' }, h('span', { class: 't-title' }, 'Spesifikasi & Merk Ban'), h('span', { class: 't-sm c-2' }, 'Detail ban baru yang dipasang'))),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Pilihan merk cepat'), brandChips.el),
    field({ label: 'Merk & seri ban', required: true, input: tireBrand, name: 'tire.brand' }),
    h('div', { class: 'field-grid' },
      field({ label: 'Ukuran ban', input: tireSize, name: 'tire.size' }),
      field({ label: 'Kode DOT / produksi', input: tireDot, name: 'tire.dot' }),
    ),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Konstruksi ban'), constructionRadio.el),
  );
  const tirePriceField = field({ label: tirePriceLabel, input: tirePrice, name: 'tire.tirePrice', control: affix(tirePrice, 'Rp'), hint: tireSubLabel });

  const tirePanel = h('div', { class: 'stack', style: { gap: '16px' } },
    h('section', { class: 'card card-pad' },
      h('div', { class: 'row-between', style: { marginBottom: '10px' } }, h('h2', { class: 't-h3' }, 'Tipe Perawatan Ban'), h('span', { class: 't-sm c-primary', style: { fontWeight: '700' } }, 'Wajib diisi')),
      h('div', { class: 'field', dataset: { field: 'tire.action' } }, actionRadio.el, h('div', { class: 'field-error', hidden: true })),
    ),
    h('section', { class: 'card card-pad' },
      h('h2', { class: 't-h3', style: { marginBottom: '10px' } }, 'Posisi Ban'),
      h('div', { class: 'field', dataset: { field: 'tire.position' } }, positionRadio.el, h('div', { class: 'field-error', hidden: true })),
    ),
    specSection,
    h('section', { class: 'card card-pad' },
      h('div', { class: 'row gap-12', style: { marginBottom: '14px' } }, h('span', { class: 'tile-icon sm' }, icon('compress', 18)),
        h('span', { class: 'stack' }, h('span', { class: 't-title' }, 'Tekanan Angin (PSI)'), h('span', { class: 't-sm c-2' }, 'Tekanan aktual setelah dikerjakan'))),
      h('div', { class: 'field-grid' },
        field({ label: 'Ban depan', aside: 'PSI', input: psiFront, name: 'tire.psiFront', control: stepper(psiFront, { step: 1, min: 0, label: 'PSI depan' }) }),
        field({ label: 'Ban belakang', aside: 'PSI', input: psiRear, name: 'tire.psiRear', control: stepper(psiRear, { step: 1, min: 0, label: 'PSI belakang' }) }),
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Jenis gas pengisian'), gasRadio.el),
    ),
    h('section', { class: 'card card-pad' },
      h('div', { class: 'row gap-12', style: { marginBottom: '14px' } }, h('span', { class: 'tile-icon sm' }, icon('store', 18)),
        h('span', { class: 'stack' }, h('span', { class: 't-title' }, 'Lokasi / Toko Ban'), h('span', { class: 't-sm c-2' }, 'Penyedia jasa pemasangan'))),
      shopChips.el,
      h('div', { class: 'mt-8', dataset: { slot: 'place-tire' } }),
    ),
    h('section', { class: 'card card-pad' },
      h('div', { class: 'row-between', style: { marginBottom: '14px' } },
        h('span', { class: 'row gap-12' }, h('span', { class: 'tile-icon sm' }, icon('receipt_long', 18)), h('span', { class: 't-title' }, 'Rincian Biaya')),
        h('span', { class: 't-sm c-2' }, 'IDR (Rupiah)')),
      tirePriceField,
      field({ label: installLabel, input: installFee, name: 'tire.installFee', control: affix(installFee, 'Rp') }),
      field({ label: 'Nitrogen / tambahan', input: extraFee, name: 'tire.extraFee', control: affix(extraFee, 'Rp'), hint: 'Pengisian nitrogen, pentil, dll.' }),
    ),
  );
  [actionRadio, positionRadio].forEach((g) => Object.values(g.inputs).forEach((i) => i.addEventListener('change', () => { syncTire(); recalc(); })));

  function syncTire() {
    const act = actionRadio.value;
    const isNew = act === 'GANTI';
    specSection.hidden = !isNew;
    tirePriceField.hidden = !isNew;
    const pair = positionRadio.value === 'SEPASANG';
    tirePriceLabel.textContent = pair ? 'Harga ban satuan (× 2 ban)' : 'Harga ban satuan';
    tireSubLabel.textContent = tireBrand.value.trim() || '';
    installLabel.textContent = act === 'TAMBAL' ? 'Biaya tambal' : act === 'ANGIN' ? 'Biaya isi angin' : act === 'BALIR' ? 'Biaya balir / cek' : 'Pasang + pentil';
  }
  tireBrand.addEventListener('input', syncTire);

  // =====================================================================
  // Ringkasan biaya & bagian bersama
  // =====================================================================
  const sumLine1Label = h('span', { class: 'c-2' });
  const sumLine1 = h('strong', { class: 'num' });
  const sumLine2Label = h('span', { class: 'c-2' });
  const sumLine2 = h('strong', { class: 'num' });
  const sumLine2Row = h('div', { class: 'row-between' }, sumLine2Label, sumLine2);
  const sumTitle = h('span', { class: 't-h3' });
  const sumSub = h('span', { class: 't-sm c-2' });
  const grandEl = h('span', { class: 't-stat c-primary', style: { fontSize: '28px', lineHeight: '34px', textAlign: 'right' } });
  const summary = h('div', { class: 'summary-card', 'aria-live': 'polite' },
    h('div', { class: 'row-between' }, sumLine1Label, sumLine1),
    sumLine2Row,
    h('div', { class: 'summary-total' }, h('div', { class: 'stack' }, sumTitle, sumSub), grandEl),
  );

  function fuelPreview() {
    const odo = readNumber(odoInput);
    const liters = readNumber(litersInput);
    const prev = fuelHistory.filter((f) => Number.isFinite(odo) && f.odometer < odo).sort((a, b) => b.odometer - a.odometer)[0];
    const distance = prev && Number.isFinite(odo) ? odo - prev.odometer : null;
    const eco = Number.isFinite(odo) && liters > 0
      ? previewEconomy(fuelHistory, { odometer: odo, liters, fullTank: fullTank.input.checked })
      : null;
    return { prev, distance, eco };
  }

  function recalc(fromPay = false) {
    const g = group;
    let total = 0;
    if (g === 'SERVIS') {
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
      itemCountBadge.textContent = `${rows.length} item`;
      sumLine1Label.textContent = 'Total part & bahan';
      sumLine1.textContent = formatRupiah(itemsTotal);
      sumLine2Row.hidden = false;
      sumLine2Label.textContent = 'Biaya jasa bengkel';
      sumLine2.textContent = formatRupiah(feeVal);
      total = itemsTotal + feeVal;
      sumSub.textContent = 'Otomatis masuk ke buku pengeluaran';
    } else if (g === 'BENSIN') {
      const liters = readNumber(litersInput);
      const price = readNumber(priceInput);
      total = liters > 0 && price >= 0 ? Math.round(liters * price) : 0;
      if (!fromPay && document.activeElement !== payInput) { if (total) payInput.setNumber(total); else payInput.value = ''; }
      fuelSubtotal.textContent = formatRupiah(total);
      sumLine1Label.textContent = `Pembelian bensin (${formatLiters(liters > 0 ? liters : 0)} × ${formatRupiah(price > 0 ? price : 0)})`;
      sumLine1.textContent = formatRupiah(total);
      sumLine2Row.hidden = true;
      sumSub.textContent = 'Otomatis masuk ke buku pengeluaran bensin';
      const p = fuelPreview();
      ecoDistance.textContent = p.distance !== null ? `${formatNumber(p.distance)} km` : '—';
      if (p.eco) {
        ecoValue.textContent = `${formatNumber(p.eco.kmPerL)} km/L`;
        ecoSub.textContent = `${formatNumber(p.eco.distance)} km ÷ ${formatLiters(p.eco.liters)} sejak isi penuh sebelumnya`;
      } else {
        ecoValue.textContent = '—';
        ecoSub.textContent = !fullTank.input.checked
          ? 'Aktifkan Isi Penuh agar konsumsi bisa dihitung.'
          : fuelHistory.some((f) => f.fullTank) ? 'Isi jumlah liter dan odometer untuk menghitung.' : 'Belum ada isi penuh sebelumnya. Konsumsi muncul mulai isi penuh berikutnya.';
      }
      odoHint.textContent = `Terkini: ${formatNumber(recordMotor.odometerCurrent)} km${p.distance !== null ? ` (+${formatNumber(p.distance)} km sejak isi terakhir)` : ''}`;
    } else {
      const act = actionRadio.value;
      const qty = positionRadio.value === 'SEPASANG' ? 2 : 1;
      const price = act === 'GANTI' ? Math.max(0, readNumber(tirePrice) || 0) : 0;
      const install = Math.max(0, readNumber(installFee) || 0);
      const extra = Math.max(0, readNumber(extraFee) || 0);
      sumLine1Label.textContent = act === 'GANTI' ? `Harga ban (${qty} × ${formatRupiah(price)})` : 'Harga ban';
      sumLine1.textContent = formatRupiah(price * qty);
      sumLine2Row.hidden = false;
      sumLine2Label.textContent = 'Jasa & tambahan';
      sumLine2.textContent = formatRupiah(install + extra);
      total = price * qty + install + extra;
      sumSub.textContent = 'Masuk ke rekap buku perawatan';
    }
    if (g !== 'BENSIN') odoHint.textContent = `Terkini: ${formatNumber(recordMotor.odometerCurrent)} km`;
    sumTitle.textContent = g === 'BENSIN' ? 'Total biaya bensin' : g === 'BAN' ? 'Total biaya ban' : 'Total biaya';
    grandEl.textContent = formatRupiah(total);
  }

  // ---------- Isi awal ----------
  if (isEdit && group === 'SERVIS') record.items.forEach((it) => addRow(it));
  else if (presetCategory && group === 'SERVIS') addRow({ category: presetCategory });
  else if (initialTags.includes('GANTI_OLI_MESIN')) addRow({ category: 'OLI_MESIN' });
  else if (initialTags.includes('BELI_PART')) addRow({});
  if (!isEdit) {
    // Isi bensin baru: pakai SPBU, jenis & harga dari isi terakhir agar lebih cepat.
    const last = fuelHistoryAll[fuelHistoryAll.length - 1];
    if (last && last.fuelType) {
      fuelType = FUEL_TYPES.some((f) => f.name === last.fuelType) ? last.fuelType : '';
      if (fuelType) fuelChips.values = [fuelType]; else fuelOther.value = last.fuelType;
      if (last.pricePerLiter) { priceInput.setNumber(last.pricePerLiter); lastSuggestedPrice = last.pricePerLiter; }
      if (last.station) { station = last.station; stationChips.values = [station]; }
    }
  }
  updateTypeHint();
  syncTire();

  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary' });
  const cancelHref = isEdit ? `#/records/${encodeURIComponent(record.id)}` : '#/';

  const commonCard = h('div', { class: 'card card-pad' },
    h('div', { class: 'field-grid' }, dateField, odoField),
    h('div', { dataset: { slot: 'place-service' } }),
    placeList,
  );
  const extraCard = h('div', { class: 'card card-pad' }, notesField, h('div', { class: 'mt-16' }, photoField));

  const SETTINGS = {
    SERVIS: {
      date: 'Tanggal', odo: 'Odometer (km)', place: 'Tempat / Bengkel', placeHolder: 'Contoh: AHASS / Yamaha Surya Motor / Langganan', placeIcon: 'storefront', slot: 'place-service',
      notes: 'Catatan & rekomendasi mekanik', notesPh: 'Keluhan, saran mekanik, kondisi part, dll.',
      photo: 'Foto nota fisik / part lama', photoHint: 'Foto nota bengkel atau part lama yang diganti.', save: 'Simpan Catatan', saveIcon: 'save',
    },
    BENSIN: {
      date: 'Tanggal isi', odo: 'Odometer saat isi', place: 'Lokasi SPBU', placeHolder: 'Contoh: Pertamina 31.124 MT Haryono', placeIcon: 'local_gas_station', slot: 'place-fuel',
      notes: 'Catatan tambahan', notesPh: 'Opsional: kondisi jalan, rute luar kota / macet harian…',
      photo: 'Foto struk / nota pom bensin', photoHint: 'Lampirkan struk untuk verifikasi liter & nomor pompa SPBU.', save: 'Simpan Catatan Bensin', saveIcon: 'local_gas_station',
    },
    BAN: {
      date: 'Tanggal tindakan', odo: 'Odometer (km)', place: 'Nama bengkel / toko ban', placeHolder: 'Ketik nama bengkel / toko…', placeIcon: 'location_on', slot: 'place-tire',
      notes: 'Catatan kondisi', notesPh: 'Contoh: ban belakang lama diganti karena indikator TWI sudah rata…',
      photo: 'Foto ban & struk nota', photoHint: 'Disarankan foto kode DOT / minggu produksi ban untuk klaim garansi.', save: 'Simpan Catatan Ban', saveIcon: 'tire_repair',
    },
  };

  function applyGroup() {
    const s = SETTINGS[group];
    servicePanel.hidden = group !== 'SERVIS';
    fuelPanel.hidden = group !== 'BENSIN';
    tirePanel.hidden = group !== 'BAN';
    dateField.querySelector('label > span').firstChild.textContent = s.date;
    odoField.querySelector('label > span').firstChild.textContent = s.odo;
    placeField.querySelector('label > span').firstChild.textContent = s.place;
    placeInput.placeholder = s.placeHolder;
    placeIcon.replaceChildren(icon(s.placeIcon, 20));
    const slot = form.querySelector(`[data-slot="${s.slot}"]`);
    if (slot && placeField.parentNode !== slot) slot.appendChild(placeField);
    notesField.querySelector('label > span').firstChild.textContent = s.notes;
    notesInput.placeholder = s.notesPh;
    photoTitle.textContent = s.photo;
    photoHint.textContent = s.photoHint;
    submitBtn.replaceChildren(icon(s.saveIcon, 20), isEdit ? 'Simpan Perubahan' : s.save);
    recalc();
  }

  const form = h('form', { novalidate: true, class: 'stack', style: { gap: '16px' } },
    motorStrip,
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Kategori catatan'), groupRadio.el),
    commonCard,
    servicePanel,
    fuelPanel,
    tirePanel,
    extraCard,
    summary,
    h('div', { class: 'action-bar' }, h('a', { class: 'btn btn-outline', href: cancelHref }, 'Batal'), submitBtn),
  );
  Object.values(groupRadio.inputs).forEach((i) => i.addEventListener('change', () => {
    group = groupRadio.value;
    applyGroup();
  }));
  applyGroup();

  // ---------- Simpan ----------
  function collect() {
    const base = {
      date: dateInput.value,
      odometer: readNumber(odoInput),
      place: placeInput.value.trim(),
      notes: notesInput.value.trim(),
      photos: attach.value(),
    };
    if (group === 'BENSIN') {
      return {
        ...base,
        type: 'BENSIN',
        fuel: {
          fuelType: fuelOther.value.trim() || fuelType,
          liters: readNumber(litersInput),
          pricePerLiter: readNumber(priceInput),
          fullTank: fullTank.input.checked,
          station,
        },
      };
    }
    if (group === 'BAN') {
      const n = (i) => { const v = readNumber(i); return v === null ? 0 : v; };
      const act = actionRadio.value;
      return {
        ...base,
        type: 'BAN',
        tire: {
          action: act,
          position: positionRadio.value,
          brand: act === 'GANTI' ? tireBrand.value.trim() : '',
          size: act === 'GANTI' ? tireSize.value.trim() : '',
          dot: act === 'GANTI' ? tireDot.value.trim() : '',
          construction: act === 'GANTI' ? constructionRadio.value : '',
          psiFront: readNumber(psiFront),
          psiRear: readNumber(psiRear),
          gas: gasRadio.value,
          tirePrice: act === 'GANTI' ? n(tirePrice) : 0,
          installFee: n(installFee),
          extraFee: n(extraFee),
        },
      };
    }
    const tags = tagChips.values;
    const fee = readNumber(feeInput);
    return {
      ...base,
      type: serviceTypeFromTags(tags),
      tags,
      serviceFee: fee === null ? 0 : fee,
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
    const hasNewPhotos = data.photos.some((p) => p.dataUrl);
    const restore = busy(submitBtn, hasNewPhotos ? 'Mengunggah foto…' : 'Menyimpan…');
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
      // Simpan foto baru ke cache perangkat dengan ID file Drive-nya.
      const ids = String(saved.photoIds || '').split(',').filter(Boolean);
      const map = {};
      data.photos.forEach((p, i) => { if (p.dataUrl && ids[i]) map[ids[i]] = p.dataUrl; });
      if (Object.keys(map).length) rememberPhotos(map);
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
