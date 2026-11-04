/**
 * Konstanta aplikasi: versi, skema sheet, kategori & jadwal default.
 * Catatan: semua file di backend/src berbagi satu scope global Apps Script.
 */

var APP_VERSION = '0.3.0';
var TIMEZONE = 'Asia/Jakarta';

var SHEETS = {
  MOTORS: 'motors',
  RECORDS: 'records',
  ITEMS: 'record_items',
  REMINDERS: 'reminders',
  CATEGORIES: 'categories',
  META: 'meta',
  PHOTOS: 'motor_photos',
};

/**
 * Foto motor disimpan sebagai data URL (JPEG terkompresi dari HP) dipecah ke beberapa sel,
 * karena satu sel Google Sheets maksimal 50.000 karakter. Tidak butuh izin Google Drive.
 */
var PHOTO_CHUNK = 40000;
var PHOTO_PARTS = 6;
var PHOTO_MAX_CHARS = PHOTO_CHUNK * PHOTO_PARTS;

/**
 * Skema tiap sheet. Urutan key = urutan kolom saat setup().
 * Tipe: string | int | intOrNull | number | bool
 * Kolom bertipe string diformat teks ('@') agar Sheets tidak mengubahnya jadi tanggal/angka.
 */
var SCHEMA = {
  motors: {
    id: 'string',
    name: 'string',
    brand: 'string',
    model: 'string',
    year: 'intOrNull',
    plate: 'string',
    odometerStart: 'int',
    odometerCurrent: 'int',
    odometerUpdatedAt: 'string',
    createdAt: 'string',
    updatedAt: 'string',
    deleted: 'bool',
    // Spesifikasi (v2). setup() menambahkan kolom ini di ujung kanan sheet lama.
    transmission: 'string',
    engineCc: 'intOrNull',
    tankLiters: 'numberOrNull',
    oilLiters: 'numberOrNull',
    tireFront: 'string',
    tireRear: 'string',
    oilType: 'string',
    // v0.3: penanda versi foto (kosong = tanpa foto). Datanya di sheet motor_photos.
    photoUpdatedAt: 'string',
  },
  records: {
    id: 'string',
    motorId: 'string',
    date: 'string',
    type: 'string',
    odometer: 'int',
    place: 'string',
    serviceFee: 'int',
    itemsTotal: 'int',
    grandTotal: 'int',
    notes: 'string',
    createdAt: 'string',
    updatedAt: 'string',
    deleted: 'bool',
  },
  record_items: {
    id: 'string',
    recordId: 'string',
    motorId: 'string',
    category: 'string',
    name: 'string',
    brand: 'string',
    qty: 'number',
    unitPrice: 'int',
    subtotal: 'int',
    createdAt: 'string',
    deleted: 'bool',
  },
  reminders: {
    id: 'string',
    motorId: 'string',
    category: 'string',
    intervalKm: 'intOrNull',
    intervalDays: 'intOrNull',
    active: 'bool',
    createdAt: 'string',
    updatedAt: 'string',
    deleted: 'bool',
  },
  categories: {
    code: 'string',
    label: 'string',
    sortOrder: 'int',
    active: 'bool',
  },
  meta: {
    key: 'string',
    value: 'string',
  },
  motor_photos: {
    motorId: 'string',
    mime: 'string',
    chars: 'int',
    part1: 'string',
    part2: 'string',
    part3: 'string',
    part4: 'string',
    part5: 'string',
    part6: 'string',
    createdAt: 'string',
    updatedAt: 'string',
    deleted: 'bool',
  },
};

/** Primary key per sheet (default: id). */
var PRIMARY_KEYS = {
  categories: 'code',
  meta: 'key',
  motor_photos: 'motorId',
};

var RECORD_TYPES = ['SERVIS', 'GANTI_OLI', 'BELANJA_PART'];
var TRANSMISSIONS = ['MATIK', 'MANUAL', 'KOPLING', 'LISTRIK'];
/** Kelompok laporan: kategori oli & cairan. Biaya jasa = JASA. Sisanya = suku cadang. */
var FLUID_CATEGORIES = ['OLI_MESIN', 'OLI_GARDAN', 'MINYAK_REM', 'AIR_RADIATOR'];
var OIL_CATEGORIES = ['OLI_MESIN', 'OLI_GARDAN'];
var SERVICE_FEE_CATEGORY = 'JASA';
var SERVICE_FEE_LABEL = 'Jasa Servis';
var SCHEMA_VERSION = '3';

var DEFAULT_CATEGORIES = [
  ['OLI_MESIN', 'Oli Mesin'],
  ['OLI_GARDAN', 'Oli Gardan'],
  ['FILTER_OLI', 'Filter Oli'],
  ['FILTER_UDARA', 'Filter Udara'],
  ['BUSI', 'Busi'],
  ['KAMPAS_REM_DEPAN', 'Kampas Rem Depan'],
  ['KAMPAS_REM_BELAKANG', 'Kampas Rem Belakang'],
  ['MINYAK_REM', 'Minyak Rem'],
  ['AIR_RADIATOR', 'Air Radiator'],
  ['V_BELT', 'V-Belt'],
  ['ROLLER', 'Roller'],
  ['RANTAI_GIR', 'Rantai & Gir'],
  ['BAN_DEPAN', 'Ban Depan'],
  ['BAN_BELAKANG', 'Ban Belakang'],
  ['AKI', 'Aki'],
  ['LAMPU', 'Lampu'],
  ['LAINNYA', 'Lainnya'],
];

var DEFAULT_REMINDERS = [
  { category: 'OLI_MESIN', intervalKm: 2000, intervalDays: 60 },
  { category: 'OLI_GARDAN', intervalKm: 8000, intervalDays: 240 },
  { category: 'FILTER_UDARA', intervalKm: 12000, intervalDays: 365 },
  { category: 'BUSI', intervalKm: 8000, intervalDays: 365 },
  { category: 'MINYAK_REM', intervalKm: 20000, intervalDays: 730 },
  { category: 'V_BELT', intervalKm: 24000, intervalDays: null },
  { category: 'AIR_RADIATOR', intervalKm: 12000, intervalDays: 365 },
];
