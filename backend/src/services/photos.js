var PhotoService = {
  DATA_URL: /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,

  /** Simpan/ganti foto motor. payload: { id: motorId, dataUrl } */
  set: function (payload) {
    var motorId = requireId_(payload);
    MotorService.getOrThrow(motorId);
    var dataUrl = payload && payload.dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl) {
      throw new AppError('VALIDATION_ERROR', 'Foto wajib diisi.', { photo: 'Wajib diisi' });
    }
    if (dataUrl.length > PHOTO_MAX_CHARS) {
      throw new AppError('VALIDATION_ERROR', 'Ukuran foto terlalu besar setelah dikompres. Coba foto lain.', { photo: 'Terlalu besar' });
    }
    var m = PhotoService.DATA_URL.exec(dataUrl);
    if (!m) {
      throw new AppError('VALIDATION_ERROR', 'Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.', { photo: 'Format tidak valid' });
    }

    var row = { mime: m[1], chars: dataUrl.length, deleted: false };
    for (var i = 0; i < PHOTO_PARTS; i++) {
      row['part' + (i + 1)] = dataUrl.substring(i * PHOTO_CHUNK, (i + 1) * PHOTO_CHUNK);
    }
    Db.upsert(SHEETS.PHOTOS, motorId, row);
    var motor = Db.update(SHEETS.MOTORS, motorId, { photoUpdatedAt: nowISO_() });
    return { id: motorId, photoUpdatedAt: motor.photoUpdatedAt, chars: dataUrl.length };
  },

  /** Hapus foto: kosongkan data agar spreadsheet tidak menyimpan gambar yang tidak dipakai. */
  remove: function (payload) {
    var motorId = requireId_(payload);
    MotorService.getOrThrow(motorId);
    var row = { mime: '', chars: 0, deleted: true };
    for (var i = 0; i < PHOTO_PARTS; i++) row['part' + (i + 1)] = '';
    Db.upsert(SHEETS.PHOTOS, motorId, row);
    Db.update(SHEETS.MOTORS, motorId, { photoUpdatedAt: '' });
    return { id: motorId };
  },

  /** Ambil foto beberapa motor sekaligus. payload: { ids?: string[] } → { [motorId]: dataUrl } */
  get: function (payload) {
    var ids = payload && Array.isArray(payload.ids) ? payload.ids.map(String) : null;
    if (ids && ids.length > 50) throw new AppError('VALIDATION_ERROR', 'Maksimal 50 motor per permintaan.');
    var active = {};
    Db.all(SHEETS.MOTORS).forEach(function (mo) { if (mo.photoUpdatedAt) active[mo.id] = true; });
    var out = {};
    Db.all(SHEETS.PHOTOS).forEach(function (p) {
      if (!active[p.motorId] || (ids && ids.indexOf(p.motorId) === -1)) return;
      var data = PhotoService.join_(p);
      if (data) out[p.motorId] = data;
    });
    return out;
  },

  join_: function (p) {
    var s = '';
    for (var i = 0; i < PHOTO_PARTS; i++) s += p['part' + (i + 1)] || '';
    return PhotoService.DATA_URL.test(s) ? s : '';
  },
};
