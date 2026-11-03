/**
 * Repo generik berbasis header untuk Google Sheets.
 * - Kolom dipetakan berdasarkan nama header di baris 1, bukan posisi.
 * - Setiap sheet dibaca sekali per request lalu disimpan di memo.
 * - Baris dengan deleted = TRUE diabaikan kecuali includeDeleted.
 */
var Db = (function () {
  var spreadsheet = null;
  var memo = {};

  function reset() {
    spreadsheet = null;
    memo = {};
  }

  function getSpreadsheet() {
    if (!spreadsheet) {
      var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (!id) throw new AppError('INTERNAL_ERROR', 'Database belum di-setup. Jalankan setup() di editor Apps Script.');
      spreadsheet = SpreadsheetApp.openById(id);
    }
    return spreadsheet;
  }

  function pkOf(name) {
    return PRIMARY_KEYS[name] || 'id';
  }

  // ---------- konversi nilai sel ----------

  function fromCell(value, type, header) {
    if (value instanceof Date) {
      // Jaga-jaga jika ada sel yang terlanjur dikonversi Sheets menjadi tanggal.
      value = header === 'date'
        ? Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd')
        : value.toISOString();
    }
    switch (type) {
      case 'int':
        return value === '' || value === null ? 0 : Math.round(Number(value)) || 0;
      case 'intOrNull':
        if (value === '' || value === null) return null;
        var n = Math.round(Number(value));
        return isNaN(n) ? null : n;
      case 'number':
        return value === '' || value === null ? 0 : Number(value) || 0;
      case 'bool':
        return value === true || value === 'TRUE' || value === 'true';
      default:
        var s = value === null || value === undefined ? '' : String(value);
        // Hapus prefix apostrof yang dipakai untuk mencegah formula injection.
        if (/^'[=+\-@]/.test(s)) s = s.substring(1);
        return s;
    }
  }

  function toCell(value, type) {
    if (value === null || value === undefined) return '';
    switch (type) {
      case 'int':
      case 'intOrNull':
      case 'number':
        return Number(value);
      case 'bool':
        return value === true;
      default:
        var s = String(value);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return s;
    }
  }

  // ---------- baca ----------

  function load(name) {
    if (memo[name]) return memo[name];
    var schema = SCHEMA[name];
    if (!schema) throw new Error('Sheet tidak dikenal: ' + name);
    var sheet = getSpreadsheet().getSheetByName(name);
    if (!sheet) throw new AppError('INTERNAL_ERROR', 'Sheet "' + name + '" tidak ada. Jalankan setup().');

    var values = sheet.getDataRange().getValues();
    var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var raw = values[i];
      var isEmpty = true;
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var h = headers[j];
        if (!h || !schema.hasOwnProperty(h)) continue;
        if (raw[j] !== '' && raw[j] !== null) isEmpty = false;
        obj[h] = fromCell(raw[j], schema[h], h);
      }
      if (isEmpty) continue;
      rows.push({ rowNumber: i + 1, obj: obj });
    }
    memo[name] = { sheet: sheet, headers: headers, schema: schema, rows: rows };
    return memo[name];
  }

  function copy(obj) {
    var out = {};
    for (var k in obj) if (obj.hasOwnProperty(k)) out[k] = obj[k];
    return out;
  }

  function isDeleted(obj) {
    return obj.deleted === true;
  }

  function all(name, opts) {
    var includeDeleted = opts && opts.includeDeleted;
    return load(name).rows
      .filter(function (r) { return includeDeleted || !isDeleted(r.obj); })
      .map(function (r) { return copy(r.obj); });
  }

  function findRow(name, pkValue) {
    var pk = pkOf(name);
    var rows = load(name).rows;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].obj[pk] === pkValue) return rows[i];
    }
    return null;
  }

  function findById(name, pkValue) {
    if (!pkValue) return null;
    var row = findRow(name, String(pkValue));
    if (!row || isDeleted(row.obj)) return null;
    return copy(row.obj);
  }

  // ---------- tulis ----------

  function toRowValues(table, obj) {
    return table.headers.map(function (h) {
      if (!h || !table.schema.hasOwnProperty(h)) return '';
      return toCell(obj[h], table.schema[h]);
    });
  }

  function withDefaults(table, obj) {
    var now = nowISO_();
    var full = {};
    Object.keys(table.schema).forEach(function (k) {
      full[k] = obj.hasOwnProperty(k) ? obj[k] : null;
    });
    if (table.schema.hasOwnProperty('id') && !full.id) full.id = newId_();
    if (table.schema.hasOwnProperty('createdAt') && !full.createdAt) full.createdAt = now;
    if (table.schema.hasOwnProperty('updatedAt') && !full.updatedAt) full.updatedAt = now;
    if (table.schema.hasOwnProperty('deleted')) full.deleted = full.deleted === true;
    return full;
  }

  function insertMany(name, objs) {
    if (!objs || !objs.length) return [];
    var table = load(name);
    var fulls = objs.map(function (o) { return withDefaults(table, o); });
    var startRow = table.sheet.getLastRow() + 1;
    var values = fulls.map(function (o) { return toRowValues(table, o); });
    table.sheet.getRange(startRow, 1, values.length, table.headers.length).setValues(values);
    fulls.forEach(function (o, idx) {
      table.rows.push({ rowNumber: startRow + idx, obj: copy(o) });
    });
    return fulls.map(copy);
  }

  function insert(name, obj) {
    return insertMany(name, [obj])[0];
  }

  function writeRow(table, row) {
    table.sheet
      .getRange(row.rowNumber, 1, 1, table.headers.length)
      .setValues([toRowValues(table, row.obj)]);
  }

  function update(name, pkValue, patch) {
    var table = load(name);
    var row = findRow(name, String(pkValue));
    if (!row || isDeleted(row.obj)) throw new AppError('NOT_FOUND', 'Data tidak ditemukan.');
    var pk = pkOf(name);
    Object.keys(patch).forEach(function (k) {
      if (k !== pk && table.schema.hasOwnProperty(k)) row.obj[k] = patch[k];
    });
    if (table.schema.hasOwnProperty('updatedAt')) row.obj.updatedAt = nowISO_();
    writeRow(table, row);
    return copy(row.obj);
  }

  function softDelete(name, pkValue) {
    return update(name, pkValue, { deleted: true });
  }

  /** Soft delete semua baris aktif yang cocok dengan predicate. Mengembalikan jumlah baris. */
  function softDeleteWhere(name, predicate) {
    var table = load(name);
    var count = 0;
    table.rows.forEach(function (row) {
      if (isDeleted(row.obj) || !predicate(copy(row.obj))) return;
      row.obj.deleted = true;
      if (table.schema.hasOwnProperty('updatedAt')) row.obj.updatedAt = nowISO_();
      writeRow(table, row);
      count++;
    });
    return count;
  }

  return {
    reset: reset,
    getSpreadsheet: getSpreadsheet,
    all: all,
    findById: findById,
    insert: insert,
    insertMany: insertMany,
    update: update,
    softDelete: softDelete,
    softDeleteWhere: softDeleteWhere,
  };
})();
