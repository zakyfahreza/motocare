import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatKm, formatTimestamp } from '../utils/format.js';
import { validateMotor } from '../utils/validate.js';
import {
  pageHead, emptyState, openDialog, confirmDialog, field, numberInput, readNumber,
  showFieldErrors, toast, toastError,
} from '../ui/components.js';
import { loadMotors, getActiveMotor, setActiveMotorId, invalidateMotors } from '../state.js';
import { navigate } from '../router.js';

export async function render({ mount, query, refresh, updateHeader }) {
  const motors = await loadMotors();
  const active = getActiveMotor();

  const after = (msg) => {
    toast(msg, 'success');
    invalidateMotors();
    refresh(); // main.js memuat ulang daftar motor & header
  };

  const addBtn = h('button', {
    type: 'button', class: 'btn btn-primary',
    onclick: async () => {
      const saved = await openMotorDialog(null);
      if (saved) {
        setActiveMotorId(saved.id);
        await after('Motor ditambahkan');
      }
    },
  }, '＋ Tambah motor');

  const list = motors.length
    ? h('div', { class: 'card' }, h('ul', { class: 'list' }, motors.map((m) => {
      const isActive = active && active.id === m.id;
      return h('li', null, h('div', { class: 'list-item' },
        h('div', { class: 'list-main' },
          h('div', { class: 'list-title' }, m.name, ' ', isActive && h('span', { class: 'badge badge-ok' }, 'Aktif')),
          h('div', { class: 'list-sub' }, [m.brand, m.model, m.year].filter(Boolean).join(' ') || '—'),
          h('div', { class: 'list-sub' }, [m.plate, formatKm(m.odometerCurrent)].filter(Boolean).join(' · ')),
        ),
        h('div', { class: 'list-actions' },
          !isActive && h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: () => { setActiveMotorId(m.id); updateHeader(); navigate('/'); },
          }, 'Pilih'),
          h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: async () => { if (await openOdometerDialog(m)) await after('Odometer diperbarui'); },
          }, 'Update km'),
          h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: async () => { if (await openMotorDialog(m)) await after('Motor diperbarui'); },
          }, 'Edit'),
          h('button', {
            type: 'button', class: 'btn btn-sm btn-danger',
            onclick: async () => {
              const ok = await confirmDialog(`Hapus motor "${m.name}"? Riwayat catatannya tidak akan tampil lagi.`, { okText: 'Hapus', danger: true });
              if (!ok) return;
              try {
                await call('motors.delete', { id: m.id });
                await after('Motor dihapus');
              } catch (err) { toastError(err); }
            },
          }, 'Hapus'),
        ),
      ));
    })))
    : emptyState({ icon: '🏍', title: 'Belum ada motor', text: 'Tambahkan motor pertama Anda.', action: addBtn });

  mount(pageHead('Motor', motors.length ? addBtn : null), list);

  if (query.get('add') === '1') {
    history.replaceState(null, '', '#/motors');
    addBtn.click();
  }
}

/** Dialog tambah/edit motor. Resolve dengan motor tersimpan atau null. */
export async function openMotorDialog(motor) {
  const isEdit = Boolean(motor);
  const inputs = {
    name: h('input', { type: 'text', maxlength: '50', required: true, value: motor ? motor.name : '', placeholder: 'contoh: Vario Harian' }),
    brand: h('input', { type: 'text', maxlength: '30', value: motor ? motor.brand : '', placeholder: 'Honda' }),
    model: h('input', { type: 'text', maxlength: '50', value: motor ? motor.model : '', placeholder: 'Vario 125' }),
    year: numberInput({ value: motor ? motor.year : null, placeholder: '2022' }),
    plate: h('input', { type: 'text', maxlength: '15', value: motor ? motor.plate : '', placeholder: 'B 1234 XYZ', autocapitalize: 'characters' }),
    odometerStart: numberInput({ value: motor ? motor.odometerStart : null, required: true, placeholder: '0' }),
    odometerCurrent: isEdit ? numberInput({ value: motor.odometerCurrent }) : null,
  };
  // Tahun tidak perlu pemisah ribuan.
  inputs.year.addEventListener('blur', () => { inputs.year.value = inputs.year.value.replace(/\./g, ''); });

  const form = h('form', { novalidate: true },
    field({ label: 'Nama motor *', input: inputs.name, name: 'name' }),
    h('div', { class: 'field-row' },
      field({ label: 'Merk', input: inputs.brand, name: 'brand' }),
      field({ label: 'Model', input: inputs.model, name: 'model' }),
    ),
    h('div', { class: 'field-row' },
      field({ label: 'Tahun', input: inputs.year, name: 'year' }),
      field({ label: 'Plat nomor', input: inputs.plate, name: 'plate' }),
    ),
    field({ label: 'Odometer awal (km) *', input: inputs.odometerStart, name: 'odometerStart', hint: 'Angka km saat motor mulai dicatat.' }),
    isEdit && field({ label: 'Odometer terkini (km)', input: inputs.odometerCurrent, name: 'odometerCurrent', hint: 'Ubah hanya untuk koreksi salah input.' }),
    h('div', { class: 'field-error', role: 'alert', hidden: true, dataset: { general: '1' } }),
  );
  form.addEventListener('submit', (e) => e.preventDefault());

  let saved = null;
  await openDialog({
    title: isEdit ? 'Edit motor' : 'Tambah motor',
    body: form,
    actions: [{ label: 'Batal', value: 'cancel' }, { label: 'Simpan', value: 'save', class: 'btn-primary' }],
    onAction: async (value) => {
      if (value !== 'save') return true;
      const data = {
        name: inputs.name.value.trim(),
        brand: inputs.brand.value.trim(),
        model: inputs.model.value.trim(),
        year: readNumber(inputs.year),
        plate: inputs.plate.value.trim(),
        odometerStart: readNumber(inputs.odometerStart),
      };
      if (isEdit) data.odometerCurrent = readNumber(inputs.odometerCurrent);
      const errors = validateMotor(data);
      if (Object.keys(errors).length) { showFieldErrors(form, errors); return false; }
      try {
        saved = await call(isEdit ? 'motors.update' : 'motors.create', isEdit ? { id: motor.id, ...data } : data);
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

/** Dialog update odometer. Resolve dengan motor terbaru atau null. */
export async function openOdometerDialog(motor) {
  const input = numberInput({ value: null, required: true, placeholder: String(motor.odometerCurrent) });
  const form = h('form', { novalidate: true },
    h('p', { class: 'muted small' }, `Saat ini ${formatKm(motor.odometerCurrent)}`, motor.odometerUpdatedAt ? ` (diperbarui ${formatTimestamp(motor.odometerUpdatedAt)})` : ''),
    field({ label: 'Odometer sekarang (km)', input, name: 'odometer' }),
  );
  let saved = null;
  const submit = async () => {
    const odometer = readNumber(input);
    if (odometer === null || Number.isNaN(odometer)) { showFieldErrors(form, { odometer: 'Masukkan angka km' }); return false; }
    if (odometer < motor.odometerCurrent) {
      showFieldErrors(form, { odometer: `Minimal ${formatKm(motor.odometerCurrent)}. Untuk koreksi gunakan Edit motor.` });
      return false;
    }
    try {
      saved = await call('motors.updateOdometer', { id: motor.id, odometer });
      invalidateMotors();
      return true;
    } catch (err) {
      const rest = showFieldErrors(form, err.fields || {});
      if (!err.fields || Object.keys(rest).length) toastError(err);
      return false;
    }
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  await openDialog({
    title: 'Update odometer',
    body: form,
    actions: [{ label: 'Batal', value: 'cancel' }, { label: 'Simpan', value: 'save', class: 'btn-primary' }],
    onAction: (value) => (value === 'save' ? submit() : true),
  });
  return saved;
}
