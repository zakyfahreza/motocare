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
  BENSIN: 'local_gas_station',
  BAN: 'tire_repair',
};

/** Kelas warna latar ikon untuk jenis catatan. */
export const TYPE_TONES = {
  GANTI_OLI: '',
  SERVIS: 'tone-violet',
  BELANJA_PART: 'tone-sky',
  BENSIN: 'tone-soon',
  BAN: 'tone-ok',
};

export const TYPE_BADGES = {
  GANTI_OLI: 'badge-primary',
  SERVIS: '',
  BELANJA_PART: 'badge-sky',
  BENSIN: 'badge-soon',
  BAN: 'badge-ok',
};

/** Kategori besar di form catatan. */
export const RECORD_GROUPS = [
  { key: 'SERVIS', label: 'Servis', iconName: 'build' },
  { key: 'BENSIN', label: 'Bensin', iconName: 'local_gas_station' },
  { key: 'BAN', label: 'Ban', iconName: 'tire_repair' },
];
export const SERVICE_TYPES = ['SERVIS', 'GANTI_OLI', 'BELANJA_PART'];
export const groupOfType = (t) => (t === 'BENSIN' || t === 'BAN' ? t : 'SERVIS');

export const SERVICE_TAGS = [
  { code: 'SERVIS_RUTIN', label: 'Servis Rutin / Berkala' },
  { code: 'GANTI_OLI_MESIN', label: 'Ganti Oli Mesin', category: 'OLI_MESIN' },
  { code: 'GANTI_OLI_GARDAN', label: 'Ganti Oli Gardan', category: 'OLI_GARDAN' },
  { code: 'SERVIS_CVT', label: 'Servis CVT / Rantai' },
  { code: 'TUNE_UP', label: 'Tune-up & Injeksi' },
  { code: 'BELI_PART', label: 'Beli Part Saja' },
];

/** Tipe catatan servis dari jenis servis yang dipilih. */
export function serviceTypeFromTags(tags) {
  if (tags.includes('BELI_PART')) return 'BELANJA_PART';
  const oil = ['GANTI_OLI_MESIN', 'GANTI_OLI_GARDAN'];
  if (tags.length && tags.every((t) => oil.includes(t))) return 'GANTI_OLI';
  return 'SERVIS';
}

/** Jenis servis awal untuk catatan lama (sebelum ada tags). */
export function tagsFromType(type) {
  if (type === 'GANTI_OLI') return ['GANTI_OLI_MESIN'];
  if (type === 'BELANJA_PART') return ['BELI_PART'];
  return ['SERVIS_RUTIN'];
}

export const FUEL_STATIONS = ['Pertamina', 'Shell', 'BP', 'Vivo'];
/** Harga hanya saran awal (bisa diubah). */
export const FUEL_TYPES = [
  { name: 'Pertalite', price: 10000, station: 'Pertamina' },
  { name: 'Pertamax', price: 12950, station: 'Pertamina' },
  { name: 'Pertamax Green', price: 13900, station: 'Pertamina' },
  { name: 'Pertamax Turbo', price: 14400, station: 'Pertamina' },
  { name: 'Shell Super', price: 13450, station: 'Shell' },
  { name: 'Shell V-Power', price: 14750, station: 'Shell' },
  { name: 'BP 92', price: 13200, station: 'BP' },
  { name: 'Revvo 92', price: 13800, station: 'Vivo' },
];

export const TIRE_ACTIONS = [
  { code: 'GANTI', label: 'Ganti Ban Baru', sub: 'Penggantian kompon luar', iconName: 'tire_repair' },
  { code: 'ANGIN', label: 'Cek & Isi Angin', sub: 'Nitrogen / pompa biasa', iconName: 'air' },
  { code: 'TAMBAL', label: 'Tambal Tubeless', sub: 'Perbaikan bocor paku', iconName: 'healing' },
  { code: 'BALIR', label: 'Balir / Cek TWI', sub: 'Pemeriksaan keausan', iconName: 'sync' },
];
export const TIRE_POSITIONS = [
  { code: 'DEPAN', label: 'Ban Depan', iconName: 'radio_button_checked' },
  { code: 'BELAKANG', label: 'Ban Belakang', iconName: 'adjust' },
  { code: 'SEPASANG', label: 'Sepasang', iconName: 'trip_origin' },
];
export const TIRE_BRANDS = ['Maxxis', 'Michelin', 'Pirelli', 'IRC', 'FDR', 'Corsa', 'Aspira', 'Bridgestone'];
export const TIRE_SHOPS = ['Planet Ban', 'Proban', 'Motoquick', 'Bengkel resmi'];
export const tireActionLabel = (c) => (TIRE_ACTIONS.find((a) => a.code === c) || {}).label || c;
export const tirePositionLabel = (c) => (TIRE_POSITIONS.find((a) => a.code === c) || {}).label || c;

/** Judul ringkas catatan untuk daftar riwayat & beranda. */
export function recordTitle(r, details) {
  if (r.type === 'BENSIN') {
    const f = details.fuel || {};
    return [f.fuelType || 'Bensin', f.liters ? `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(f.liters)} L` : '', f.fullTank ? 'Full tank' : ''].filter(Boolean).join(' · ');
  }
  if (r.type === 'BAN') {
    const t = details.tire || {};
    return [tireActionLabel(t.action), tirePositionLabel(t.position), t.action === 'GANTI' ? t.brand : ''].filter(Boolean).join(' · ');
  }
  if (r.itemNames && r.itemNames.length) {
    return r.itemNames.join(', ') + (r.itemCount > r.itemNames.length ? ` +${r.itemCount - r.itemNames.length}` : '');
  }
  return '';
}

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
