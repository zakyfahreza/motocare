/**
 * Konstanta aplikasi: versi, skema sheet, kategori & jadwal default.
 * Catatan: semua file di backend/src berbagi satu scope global Apps Script.
 */

var APP_VERSION = '0.4.0';
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
 * v0.3 (lama): foto motor disimpan di sheet motor_photos, dipecah per sel.
 * v0.4: foto disimpan sebagai file di Google Drive (folder "MotoCare Foto").
 * Konstanta lama dipertahankan untuk migrasi (setup() memindahkan foto lama ke Drive).
 */
var PHOTO_CHUNK = 40000;
var PHOTO_PARTS = 6;
var PHOTO_MAX_CHARS = PHOTO_CHUNK * PHOTO_PARTS;

/** Foto di Google Drive. */
var DRIVE_ROOT_FOLDER = 'MotoCare Foto';
var DRIVE_SUBFOLDERS = { motor: 'Foto Motor', record: 'Nota & Part' };
var PHOTO_UPLOAD_MAX_CHARS = 1500000; // ±1,1 MB per foto setelah dikompres di perangkat
var MAX_RECORD_PHOTOS = 2;
var MAX_PHOTOS_PER_FETCH = 10;

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
    // v0.3: penanda versi foto (kosong = tanpa foto).
    photoUpdatedAt: 'string',
    // v0.4: ID file foto di Google Drive.
    photoFileId: 'string',
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
    // v0.4
    tags: 'string',     // kode jenis servis, dipisah koma (SERVIS_RUTIN,GANTI_OLI_MESIN,...)
    details: 'string',  // JSON rincian khusus Bensin / Ban
    photoIds: 'string', // ID file Google Drive foto nota/part, dipisah koma
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

var RECORD_TYPES = ['SERVIS', 'GANTI_OLI', 'BELANJA_PART', 'BENSIN', 'BAN'];
/** Tipe yang memakai form "Servis" (item part/oli bebas). */
var SERVICE_TYPES = ['SERVIS', 'GANTI_OLI', 'BELANJA_PART'];
var SERVICE_TAGS = ['SERVIS_RUTIN', 'GANTI_OLI_MESIN', 'GANTI_OLI_GARDAN', 'SERVIS_CVT', 'TUNE_UP', 'BELI_PART'];

/** Kategori sistem (tidak ada di sheet categories, tidak muncul di pilihan item). */
var FUEL_CATEGORY = 'BBM';
var SYSTEM_CATEGORY_LABELS = { JASA: 'Jasa Servis', BBM: 'Bahan Bakar (BBM)' };
var TIRE_CATEGORIES = ['BAN_DEPAN', 'BAN_BELAKANG'];
var TIRE_ACTIONS = ['GANTI', 'ANGIN', 'TAMBAL', 'BALIR'];
var TIRE_POSITIONS = ['DEPAN', 'BELAKANG', 'SEPASANG'];
var TIRE_CONSTRUCTIONS = ['TL', 'TT'];
var TIRE_GASES = ['N2', 'ANGIN'];
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
