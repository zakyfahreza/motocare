var Auth = {
  /** Lempar UNAUTHORIZED jika token tidak cocok dengan Script Property API_TOKEN. */
  verify: function (token) {
    var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected) {
      throw new AppError('INTERNAL_ERROR', 'API_TOKEN belum diset. Jalankan setup() di editor Apps Script.');
    }
    if (typeof token !== 'string' || !safeEqual_(token, expected)) {
      throw new AppError('UNAUTHORIZED', 'Kode akses tidak valid.');
    }
  },
};

/** Perbandingan string tanpa early return (mengurangi kebocoran lewat waktu respons). */
function safeEqual_(a, b) {
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
