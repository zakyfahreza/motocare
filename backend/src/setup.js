/**
 * Jalankan setup() SEKALI dari editor Apps Script (pilih fungsi "setup" → Run).
 * Aman dijalankan berulang: tidak menduplikasi sheet, header, atau kategori.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    ss = SpreadsheetApp.create('MotoCare DB');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(TIMEZONE);

  Object.keys(SCHEMA).forEach(function (name) {
    ensureSheet_(ss, name, SCHEMA[name]);
  });
  removeDefaultSheet_(ss);

  Db.reset();
  seedCategories_();
  seedMeta_();

  var tokenCreated = false;
  if (!props.getProperty('API_TOKEN')) {
    props.setProperty('API_TOKEN', generateToken_());
    tokenCreated = true;
  }

  // v0.4: folder foto di Google Drive (memicu permintaan izin Drive saat pertama kali) + migrasi foto lama.
  DriveStore.folder_('motor');
  DriveStore.folder_('record');
  var moved = PhotoService.migrateLegacy();

  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Folder foto Google Drive: ' + DriveStore.folderUrl());
  if (moved) Logger.log(moved + ' foto motor lama dipindahkan dari spreadsheet ke Google Drive.');
  if (tokenCreated) {
    Logger.log('API_TOKEN baru (salin dan simpan, ini kode akses aplikasi): ' + props.getProperty('API_TOKEN'));
  } else {
    Logger.log('API_TOKEN sudah ada. Lihat di Project Settings → Script properties, atau jalankan rotateToken() untuk membuat baru.');
  }
  Logger.log('Setup selesai. Versi ' + APP_VERSION);
}

/** Membuat token baru. Token lama langsung tidak berlaku. */
function rotateToken() {
  var token = generateToken_();
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('API_TOKEN baru (token lama tidak berlaku lagi): ' + token);
}

function generateToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function ensureSheet_(ss, name, schema) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var wanted = Object.keys(schema);
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); })
    : [];

  if (existing.join('') === '') {
    existing = [];
  }
  // Tambahkan header yang belum ada di ujung kanan (aman untuk migrasi).
  var missing = wanted.filter(function (h) { return existing.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    existing = existing.concat(missing);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, existing.length).setFontWeight('bold');

  // Kolom string diformat teks agar tidak dikonversi otomatis (tanggal, nomor plat, dll).
  existing.forEach(function (h, idx) {
    if (schema[h] === 'string') {
      sheet.getRange(1, idx + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
  });
}

function removeDefaultSheet_(ss) {
  ss.getSheets().forEach(function (sheet) {
    if (!SCHEMA.hasOwnProperty(sheet.getName()) && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}

function seedCategories_() {
  var existing = Db.all(SHEETS.CATEGORIES).map(function (c) { return c.code; });
  var toInsert = [];
  DEFAULT_CATEGORIES.forEach(function (pair, idx) {
    if (existing.indexOf(pair[0]) === -1) {
      toInsert.push({ code: pair[0], label: pair[1], sortOrder: (idx + 1) * 10, active: true });
    }
  });
  Db.insertMany(SHEETS.CATEGORIES, toInsert);
}

function seedMeta_() {
  if (Db.findById(SHEETS.META, 'schemaVersion')) {
    Db.update(SHEETS.META, 'schemaVersion', { value: SCHEMA_VERSION });
  } else {
    Db.insert(SHEETS.META, { key: 'schemaVersion', value: SCHEMA_VERSION });
  }
}
