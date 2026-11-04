const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const numberFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const TZ = 'Asia/Jakarta';

export const TYPE_LABELS = {
  SERVIS: 'Servis',
  GANTI_OLI: 'Ganti Oli',
  BELANJA_PART: 'Belanja Part',
  BENSIN: 'Bensin',
  BAN: 'Ban',
};

/** Rincian JSON catatan Bensin/Ban. */
export function parseDetails(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s) || {}; } catch { return {}; }
}

export function formatLiters(n) {
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(n) || 0)} L`;
}

export const STATUS_LABELS = {
  OK: 'OK',
  SEGERA: 'Segera',
  TERLAMBAT: 'Terlambat',
  BELUM_ADA_DATA: 'Belum ada data',
  NONAKTIF: 'Nonaktif',
};

export function formatNumber(n) {
  return numberFmt.format(Number(n) || 0);
}

/** 125000 → "Rp 125.000" */
export function formatRupiah(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-Rp ' : 'Rp ') + numberFmt.format(Math.abs(v));
}

/** 12000 → "12.000 km" */
export function formatKm(n) {
  return `${formatNumber(Math.round(Number(n) || 0))} km`;
}

/** "2026-11-03" → "3 Nov 2026" */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-11" → "Nov 26" */
export function formatMonthShort(ym) {
  const [y, mo] = String(ym).split('-');
  return `${MONTHS[Number(mo) - 1]} ${String(y).slice(2)}`;
}

/** ISO timestamp → "3 Nov 2026" (zona Jakarta) */
export function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatDate(toISODate(d));
}

export function toISODate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function todayISO() {
  return toISODate(new Date());
}

export function currentYear() {
  return Number(todayISO().slice(0, 4));
}

/**
 * Parse angka format Indonesia.
 * integer: "12.000" → 12000. desimal: "0,8" → 0.8. Kosong → null. Tidak valid → NaN.
 */
export function parseNumber(value, { integer = true } = {}) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s/g, '').replace(/^Rp/i, '');
  if (s === '') return null;
  const normalized = integer ? s.replace(/\./g, '') : s.replace(/\./g, (m, i, str) => (str.includes(',') ? '' : m)).replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

/** Teks ringkas sisa/lewat pengingat. */
export function describeReminder(r) {
  if (r.status === 'NONAKTIF') return 'Pengingat dimatikan';
  if (r.status === 'BELUM_ADA_DATA') return 'Belum pernah dicatat';
  const parts = [];
  if (r.remainingKm !== null && r.remainingKm !== undefined) {
    parts.push(r.remainingKm > 0 ? `sisa ${formatKm(r.remainingKm)}` : `lewat ${formatKm(-r.remainingKm)}`);
  }
  if (r.remainingDays !== null && r.remainingDays !== undefined) {
    parts.push(r.remainingDays > 0 ? `${r.remainingDays} hari lagi` : `lewat ${-r.remainingDays} hari`);
  }
  return parts.join(' · ');
}

export function describeInterval(r) {
  const parts = [];
  if (r.intervalKm) parts.push(`tiap ${formatKm(r.intervalKm)}`);
  if (r.intervalDays) parts.push(`${r.intervalDays} hari`);
  return parts.join(' / ');
}
