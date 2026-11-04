/** Peta ikon & warna untuk kategori, jenis catatan, dan status. */

const CATEGORY_ICONS = {
  OLI_MESIN: 'oil_barrel',
  OLI_GARDAN: 'settings',
  FILTER_OLI: 'filter_alt',
  FILTER_UDARA: 'air',
  BUSI: 'bolt',
  KAMPAS_REM_DEPAN: 'album',
  KAMPAS_REM_BELAKANG: 'album',
  MINYAK_REM: 'format_color_reset',
  AIR_RADIATOR: 'mode_fan',
  V_BELT: 'all_inclusive',
  ROLLER: 'adjust',
  RANTAI_GIR: 'link',
  BAN_DEPAN: 'tire_repair',
  BAN_BELAKANG: 'tire_repair',
  AKI: 'battery_charging_full',
  LAMPU: 'lightbulb',
  LAINNYA: 'category',
  JASA: 'build',
};

export function categoryIcon(code) {
  return CATEGORY_ICONS[code] || 'category';
}

export const TYPE_ICONS = {
  GANTI_OLI: 'oil_barrel',
  SERVIS: 'build',
  BELANJA_PART: 'shopping_cart',
};

/** Kelas warna latar ikon untuk jenis catatan. */
export const TYPE_TONES = {
  GANTI_OLI: '',
  SERVIS: 'tone-violet',
  BELANJA_PART: 'tone-sky',
};

export const TYPE_BADGES = {
  GANTI_OLI: 'badge-primary',
  SERVIS: '',
  BELANJA_PART: 'badge-sky',
};

export const STATUS_TONES = {
  TERLAMBAT: 'tone-late',
  SEGERA: 'tone-soon',
  OK: 'tone-ok',
  BELUM_ADA_DATA: 'tone-none',
  NONAKTIF: 'tone-none',
};

export const TRANSMISSION_LABELS = {
  MATIK: 'Matik',
  MANUAL: 'Manual',
  KOPLING: 'Kopling',
  LISTRIK: 'Listrik',
};

export const BRANDS = ['Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'Vespa'];

/** Inisial 2 huruf dari nama, contoh "Vario Harian" → "VH". */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MC';
  return (parts[0][0] + (parts[1] ? parts[1][0] : parts[0][1] || '')).toUpperCase();
}
