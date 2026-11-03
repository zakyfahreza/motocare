/**
 * Validator berantai. Mengumpulkan semua error field lalu melempar VALIDATION_ERROR sekaligus.
 *   var v = new Validator_(payload);
 *   v.string('name', { required: true, max: 50 }).int('year', { min: 1950 });
 *   var clean = v.done();
 */
function Validator_(input, prefix) {
  this.input = input && typeof input === 'object' ? input : {};
  this.prefix = prefix || '';
  this.errors = {};
  this.out = {};
}

Validator_.prototype._err = function (key, msg) {
  this.errors[this.prefix + key] = msg;
  return this;
};

Validator_.prototype._isEmpty = function (v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
};

Validator_.prototype.string = function (key, opts) {
  opts = opts || {};
  var v = this.input[key];
  if (this._isEmpty(v)) {
    if (opts.required) return this._err(key, 'Wajib diisi');
    this.out[key] = '';
    return this;
  }
  if (typeof v !== 'string' && typeof v !== 'number') return this._err(key, 'Harus berupa teks');
  var s = String(v).trim();
  if (opts.max && s.length > opts.max) return this._err(key, 'Maksimal ' + opts.max + ' karakter');
  if (opts.pattern && !opts.pattern.test(s)) return this._err(key, opts.patternMessage || 'Format tidak valid');
  this.out[key] = s;
  return this;
};

Validator_.prototype._number = function (key, opts, integer) {
  opts = opts || {};
  var v = this.input[key];
  if (this._isEmpty(v)) {
    if (opts.required) return this._err(key, 'Wajib diisi');
    this.out[key] = opts.hasOwnProperty('defaultValue') ? opts.defaultValue : null;
    return this;
  }
  var n;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    // Terima format Indonesia: "12.000" untuk bilangan bulat, "0,8" untuk desimal.
    var s = v.replace(/\s/g, '');
    n = integer ? Number(s.replace(/\./g, '')) : Number(s.replace(',', '.'));
  } else {
    return this._err(key, 'Harus berupa angka');
  }
  if (!isFinite(n)) return this._err(key, 'Harus berupa angka');
  if (integer && Math.floor(n) !== n) return this._err(key, 'Harus bilangan bulat');
  if (opts.hasOwnProperty('min') && n < opts.min) return this._err(key, 'Minimal ' + opts.min);
  if (opts.hasOwnProperty('gt') && !(n > opts.gt)) return this._err(key, 'Harus lebih dari ' + opts.gt);
  if (opts.hasOwnProperty('max') && n > opts.max) return this._err(key, 'Maksimal ' + opts.max);
  this.out[key] = n;
  return this;
};

Validator_.prototype.int = function (key, opts) {
  return this._number(key, opts, true);
};

Validator_.prototype.number = function (key, opts) {
  return this._number(key, opts, false);
};

Validator_.prototype.bool = function (key, opts) {
  opts = opts || {};
  var v = this.input[key];
  if (v === undefined || v === null || v === '') {
    this.out[key] = opts.hasOwnProperty('defaultValue') ? opts.defaultValue : false;
    return this;
  }
  if (typeof v !== 'boolean') return this._err(key, 'Harus true/false');
  this.out[key] = v;
  return this;
};

Validator_.prototype.oneOf = function (key, values, opts) {
  opts = opts || {};
  var v = this.input[key];
  if (this._isEmpty(v)) {
    if (opts.required) return this._err(key, 'Wajib diisi');
    this.out[key] = opts.hasOwnProperty('defaultValue') ? opts.defaultValue : '';
    return this;
  }
  if (values.indexOf(v) === -1) return this._err(key, 'Pilihan tidak valid');
  this.out[key] = v;
  return this;
};

/** Tanggal YYYY-MM-DD; opsi maxDate (ISO) membatasi tanggal masa depan. */
Validator_.prototype.date = function (key, opts) {
  opts = opts || {};
  var v = this.input[key];
  if (this._isEmpty(v)) {
    if (opts.required) return this._err(key, 'Wajib diisi');
    this.out[key] = '';
    return this;
  }
  if (!Logic.isValidISODate(v)) return this._err(key, 'Format tanggal harus YYYY-MM-DD');
  if (opts.maxDate && v > opts.maxDate) return this._err(key, 'Tanggal tidak boleh di masa depan');
  this.out[key] = v;
  return this;
};

Validator_.prototype.addError = function (key, msg) {
  return this._err(key, msg);
};

Validator_.prototype.hasErrors = function () {
  return Object.keys(this.errors).length > 0;
};

Validator_.prototype.done = function () {
  if (this.hasErrors()) {
    throw new AppError('VALIDATION_ERROR', 'Data tidak valid. Periksa kembali isian Anda.', this.errors);
  }
  return this.out;
};

/** Ambil string id wajib dari payload, lempar VALIDATION_ERROR jika kosong. */
function requireId_(payload, key) {
  key = key || 'id';
  var v = payload && payload[key];
  if (typeof v !== 'string' || !v.trim()) {
    var fields = {};
    fields[key] = 'Wajib diisi';
    throw new AppError('VALIDATION_ERROR', 'Field "' + key + '" wajib diisi.', fields);
  }
  return v.trim();
}
