/** Error aplikasi yang aman dikirim ke klien apa adanya. */
function AppError(code, message, fields) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.fields = fields || null;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return jsonOut_({ ok: true, data: data === undefined ? null : data });
}

function fail_(err) {
  if (err instanceof AppError) {
    var error = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    return jsonOut_({ ok: false, error: error });
  }
  // Detail error hanya ke log, bukan ke respons.
  console.error('INTERNAL_ERROR: ' + (err && err.stack ? err.stack : err));
  return jsonOut_({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan di server. Coba lagi.' },
  });
}
