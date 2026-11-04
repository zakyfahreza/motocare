import { h, uid } from '../utils/dom.js';
import { call } from '../api.js';
import { validateMotor } from '../utils/validate.js';
import {
  field, numberInput, readNumber, showFieldErrors, busy, toast, toastError, radioGroup, affix,
} from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { BRANDS, TRANSMISSION_LABELS } from '../ui/meta.js';
import { getMotors, loadMotors, setActiveMotorId, getActiveMotorId, invalidateMotors } from '../state.js';
import { navigate } from '../router.js';

export async function render({ params, mount }) {
  const isEdit = Boolean(params.id);
  await loadMotors();
  const motor = isEdit ? getMotors().find((m) => m.id === params.id) : null;
  if (isEdit && !motor) throw new Error('Motor tidak ditemukan.');
  const v = (k, d = '') => (motor && motor[k] !== null && motor[k] !== undefined ? motor[k] : d);

  // ---------- Identitas ----------
  const nameInput = h('input', { type: 'text', maxlength: '50', required: true, value: v('name'), placeholder: 'cth: Vario Harian' });
  const brandValue = v('brand');
  const knownBrand = BRANDS.find((b) => b.toLowerCase() === String(brandValue).toLowerCase());
  const brandGroup = radioGroup({
    name: uid('brand'),
    className: 'chips',
    label: 'Pabrikan',
    value: knownBrand || (brandValue ? 'LAINNYA' : ''),
    options: [...BRANDS.map((b) => ({ value: b, label: b })), { value: 'LAINNYA', label: 'Lainnya' }],
  });
  const brandOther = h('input', { type: 'text', maxlength: '30', placeholder: 'Tulis merk motor', value: knownBrand ? '' : brandValue, 'aria-label': 'Merk lainnya' });
  const brandOtherWrap = h('div', { class: 'mt-8', hidden: brandGroup.value !== 'LAINNYA' }, brandOther);
  Object.values(brandGroup.inputs).forEach((i) => i.addEventListener('change', () => {
    brandOtherWrap.hidden = brandGroup.value !== 'LAINNYA';
    if (!brandOtherWrap.hidden) brandOther.focus();
  }));

  const modelInput = h('input', { type: 'text', maxlength: '50', value: v('model'), placeholder: 'cth: Vario 160 CBS' });
  const plateInput = h('input', { type: 'text', maxlength: '15', value: v('plate'), placeholder: 'B 1234 XYZ', autocapitalize: 'characters', style: { fontWeight: '700', fontSize: '17px', letterSpacing: '.02em' } });
  const thisYear = new Date().getFullYear();
  const yearSel = h('select', null,
    h('option', { value: '' }, '—'),
    Array.from({ length: thisYear + 1 - 1980 + 1 }, (_, i) => thisYear + 1 - i).map((y) => h('option', { value: String(y), selected: Number(v('year')) === y }, String(y))),
  );
  const transGroup = radioGroup({
    name: uid('trans'),
    className: 'segmented light',
    label: 'Tipe transmisi',
    value: v('transmission'),
    options: Object.entries(TRANSMISSION_LABELS).map(([value, label]) => ({ value, label })),
  });
  const ccInput = numberInput({ value: v('engineCc', null), placeholder: '160' });

  // ---------- Odometer & kapasitas ----------
  const odoStart = numberInput({ value: v('odometerStart', null), required: true, placeholder: '0', className: 't-stat' });
  odoStart.style.color = 'var(--primary)';
  const odoCurrent = isEdit ? numberInput({ value: motor.odometerCurrent }) : null;
  const tankInput = numberInput({ value: v('tankLiters', null), integer: false, placeholder: '5,5' });
  const oilInput = numberInput({ value: v('oilLiters', null), integer: false, placeholder: '0,8' });

  // ---------- Spesifikasi tambahan ----------
  const tireFront = h('input', { type: 'text', maxlength: '30', value: v('tireFront'), placeholder: '100/80-14' });
  const tireRear = h('input', { type: 'text', maxlength: '30', value: v('tireRear'), placeholder: '120/70-14' });
  const oilType = h('input', { type: 'text', maxlength: '60', value: v('oilType'), placeholder: 'cth: AHM SPX2 0.8L (10W-30)' });
  const hasExtra = Boolean(v('tireFront') || v('tireRear') || v('oilType') || v('engineCc', null));

  // ---------- Opsi ----------
  const makeActive = h('input', { type: 'checkbox', checked: !isEdit || getActiveMotorId() === (motor && motor.id) || getMotors().length === 0 });
  const autoSchedule = h('input', { type: 'checkbox', checked: true });

  const sectionTitle = (iconName, text, extra) => h('div', { class: 'row-between', style: { marginBottom: '14px' } },
    h('h2', { class: 'row gap-8 t-title', style: { fontSize: '16px' } }, h('span', { class: 'c-primary' }, icon(iconName, 22)), text),
    extra,
  );

  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('save', 20), isEdit ? 'Simpan Perubahan' : 'Simpan Motor');

  const form = h('form', { novalidate: true, class: 'stack', style: { gap: '16px' } },
    !isEdit && h('div', { class: 'card card-pad hero row gap-12', style: { alignItems: 'flex-start', background: 'var(--surface-low)' } },
      h('span', { class: 'tile-icon round', style: { background: 'var(--primary-container)', color: '#fff' } }, icon('two_wheeler', 24)),
      h('div', { class: 'stack' },
        h('span', { class: 't-h3' }, 'Daftarkan Motor Anda'),
        h('span', { class: 't-sm c-2' }, 'Data ini dipakai untuk menghitung jadwal servis, takaran oli, dan rekap biaya per motor.'),
      ),
    ),
    h('section', { class: 'card card-pad' },
      sectionTitle('badge', 'Identitas motor'),
      field({ label: 'Nama panggilan motor', required: true, input: nameInput, name: 'name', control: affix(nameInput, icon('edit', 18), { suffix: true }) }),
      h('div', { class: 'field', dataset: { field: 'brand' } }, h('span', { class: 'label' }, 'Pabrikan / merk'), brandGroup.el, brandOtherWrap, h('div', { class: 'field-error', hidden: true })),
      field({ label: 'Model & varian', input: modelInput, name: 'model' }),
      h('div', { class: 'field-grid' },
        field({ label: 'Nomor polisi (plat)', input: plateInput, name: 'plate' }),
        field({ label: 'Tahun perakitan', input: yearSel, name: 'year' }),
      ),
      h('div', { class: 'field', dataset: { field: 'transmission' } }, h('span', { class: 'label' }, 'Tipe transmisi'), transGroup.el, h('div', { class: 'field-error', hidden: true })),
    ),
    h('section', { class: 'card card-pad' },
      sectionTitle('speed', 'Odometer & kapasitas fisik', h('span', { class: 'badge badge-primary' }, 'Penting')),
      h('div', { class: 'card-tint', style: { padding: '14px' } },
        field({
          label: isEdit ? 'Odometer awal (saat mulai dicatat)' : 'Odometer terkini saat ini', required: true, input: odoStart, name: 'odometerStart',
          control: affix(odoStart, 'km', { suffix: true }),
          hint: [icon('info', 14), 'Titik awal perhitungan masa pakai oli & sparepart'],
        }),
        isEdit && field({ label: 'Odometer terkini', input: odoCurrent, name: 'odometerCurrent', control: affix(odoCurrent, 'km', { suffix: true }), hint: 'Ubah hanya untuk koreksi salah input.' }),
      ),
      h('div', { class: 'field-grid mt-12' },
        field({ label: 'Tangki BBM', input: tankInput, name: 'tankLiters', control: affix(tankInput, 'Liter', { suffix: true }) }),
        field({ label: 'Oli mesin', input: oilInput, name: 'oilLiters', control: affix(oilInput, 'Liter', { suffix: true }) }),
      ),
    ),
    h('details', { class: 'card', open: hasExtra },
      h('summary', { class: 'row-between card-pad', style: { cursor: 'pointer', listStyle: 'none' } },
        h('span', { class: 'row gap-12' }, h('span', { class: 'c-primary' }, icon('tune', 22)),
          h('span', { class: 'stack' }, h('span', { class: 't-title' }, 'Spesifikasi tambahan & ban'), h('span', { class: 't-sm c-2' }, 'Ukuran ban, oli rekomendasi, kapasitas mesin'))),
        icon('expand_more', 22),
      ),
      h('div', { class: 'card-pad', style: { paddingTop: 0 } },
        h('div', { class: 'field-grid' },
          field({ label: 'Ban depan', input: tireFront, name: 'tireFront' }),
          field({ label: 'Ban belakang', input: tireRear, name: 'tireRear' }),
        ),
        field({ label: 'Oli rekomendasi', input: oilType, name: 'oilType' }),
        field({ label: 'Kapasitas mesin', input: ccInput, name: 'engineCc', control: affix(ccInput, 'cc', { suffix: true }) }),
      ),
    ),
    h('section', { class: 'card', style: { padding: '0 16px' } },
      h('label', { class: 'check-row' }, makeActive, h('span', { class: 'stack' }, h('span', { class: 't-title' }, 'Jadikan motor utama'), h('span', { class: 't-sm c-2' }, 'Ditampilkan di beranda dan dipakai sebagai motor aktif.'))),
      !isEdit && h('label', { class: 'check-row' }, autoSchedule, h('span', { class: 'stack' },
        h('span', { class: 'row gap-8 t-title' }, 'Jadwal servis otomatis', h('span', { class: 'badge badge-ok' }, 'Rekomendasi')),
        h('span', { class: 't-sm c-2' }, 'Buat jadwal ganti oli mesin, oli gardan, busi, filter udara, minyak rem, V-belt, dan air radiator.'))),
    ),
    h('div', { class: 'note' }, icon('verified', 22), h('span', null, 'Data tersimpan di Google Spreadsheet milik Anda sendiri dan bisa dibuka kapan saja.')),
    h('div', { class: 'action-bar' },
      h('a', { class: 'btn btn-outline', href: '#/motors' }, 'Batal'),
      submitBtn,
    ),
  );

  let submitting = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    const brand = brandGroup.value === 'LAINNYA' ? brandOther.value.trim() : brandGroup.value;
    const data = {
      name: nameInput.value.trim(),
      brand,
      model: modelInput.value.trim(),
      year: yearSel.value ? Number(yearSel.value) : null,
      plate: plateInput.value.trim(),
      odometerStart: readNumber(odoStart),
      transmission: transGroup.value,
      engineCc: readNumber(ccInput),
      tankLiters: readNumber(tankInput),
      oilLiters: readNumber(oilInput),
      tireFront: tireFront.value.trim(),
      tireRear: tireRear.value.trim(),
      oilType: oilType.value.trim(),
    };
    if (isEdit) data.odometerCurrent = readNumber(odoCurrent);
    const errors = validateMotor(data);
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    showFieldErrors(form, {});

    submitting = true;
    const restore = busy(submitBtn);
    try {
      const saved = isEdit
        ? await call('motors.update', { id: motor.id, ...data })
        : await call('motors.create', { ...data, createDefaultReminders: autoSchedule.checked });
      if (makeActive.checked) setActiveMotorId(saved.id);
      invalidateMotors();
      toast(isEdit ? 'Motor diperbarui' : 'Motor ditambahkan', 'success');
      navigate(makeActive.checked && !isEdit ? '/' : '/motors', { replace: true });
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

  mount(h('h1', { class: 'visually-hidden', tabindex: '-1' }, isEdit ? 'Edit motor' : 'Tambah motor'), form);
}
