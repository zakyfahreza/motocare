import { parseNumber, todayISO } from './format.js';

/** Validasi sisi klien untuk UX. Backend tetap sumber kebenaran. Format error sama dengan server. */

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function validateMotor(data) {
  const e = {};
  if (!data.name.trim()) e.name = 'Wajib diisi';
  else if (data.name.length > 50) e.name = 'Maksimal 50 karakter';
  if (data.year !== null && (Number.isNaN(data.year) || data.year < 1950 || data.year > new Date().getFullYear() + 1)) e.year = 'Tahun tidak valid';
  if (data.odometerStart === null) e.odometerStart = 'Wajib diisi';
  else if (Number.isNaN(data.odometerStart) || data.odometerStart < 0) e.odometerStart = 'Harus angka ≥ 0';
  if (data.plate.length > 15) e.plate = 'Maksimal 15 karakter';
  return e;
}

export function validateRecord(data) {
  const e = {};
  if (!data.date) e.date = 'Wajib diisi';
  else if (data.date > addDaysISO(todayISO(), 1)) e.date = 'Tanggal tidak boleh di masa depan';
  if (data.odometer === null) e.odometer = 'Wajib diisi';
  else if (Number.isNaN(data.odometer) || data.odometer < 0) e.odometer = 'Harus angka ≥ 0';
  if (Number.isNaN(data.serviceFee) || data.serviceFee < 0) e.serviceFee = 'Harus angka ≥ 0';
  if (data.notes.length > 1000) e.notes = 'Maksimal 1.000 karakter';
  if (data.place.length > 100) e.place = 'Maksimal 100 karakter';

  data.items.forEach((it, i) => {
    const p = `items.${i}.`;
    if (!it.category) e[`${p}category`] = 'Pilih kategori';
    if (!it.name.trim()) e[`${p}name`] = 'Wajib diisi';
    else if (it.name.length > 100) e[`${p}name`] = 'Maksimal 100 karakter';
    if (it.qty === null || Number.isNaN(it.qty) || !(it.qty > 0)) e[`${p}qty`] = 'Harus > 0';
    if (it.unitPrice === null || Number.isNaN(it.unitPrice) || it.unitPrice < 0) e[`${p}unitPrice`] = 'Harus angka ≥ 0';
  });

  if (!Object.keys(e).length) {
    if (data.type === 'BELANJA_PART' && data.items.length === 0) e.items = 'Belanja part wajib memiliki minimal 1 item';
    if (data.type === 'GANTI_OLI' && !data.items.some((it) => it.category === 'OLI_MESIN' || it.category === 'OLI_GARDAN')) {
      e.items = 'Ganti oli wajib memiliki minimal 1 item Oli Mesin atau Oli Gardan';
    }
  }
  return e;
}

export function validateReminder(data) {
  const e = {};
  if (!data.category) e.category = 'Pilih kategori';
  const badKm = data.intervalKm !== null && (Number.isNaN(data.intervalKm) || data.intervalKm < 1);
  const badDays = data.intervalDays !== null && (Number.isNaN(data.intervalDays) || data.intervalDays < 1);
  if (badKm) e.intervalKm = 'Harus angka ≥ 1';
  if (badDays) e.intervalDays = 'Harus angka ≥ 1';
  if (data.intervalKm === null && data.intervalDays === null) e.intervalKm = 'Isi interval km atau interval hari (minimal salah satu)';
  return e;
}

export { parseNumber };
