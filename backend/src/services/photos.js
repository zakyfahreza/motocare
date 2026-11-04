/**
 * Foto motor & foto nota/part. File disimpan di Google Drive (lihat drive.js),
 * spreadsheet hanya menyimpan ID file (motors.photoFileId, records.photoIds).
 */
var PhotoService = {
  /** Simpan/ganti foto motor. payload: { id: motorId, dataUrl } */
  set: function (payload) {
    var motorId = requireId_(payload);
    var motor = MotorService.getOrThrow(motorId);
    DriveStore.parse(payload && payload.dataUrl);
    var fileId = DriveStore.save('motor', 'motor-' + slug_(motor.name), payload.dataUrl);
    var old = motor.photoFileId;
    var updated = Db.update(SHEETS.MOTORS, motorId, { photoFileId: fileId, photoUpdatedAt: nowISO_() });
    if (old && old !== fileId) DriveStore.trash(old);
    return { id: motorId, photoFileId: fileId, photoUpdatedAt: updated.photoUpdatedAt };
  },

  remove: function (payload) {
    var motorId = requireId_(payload);
    var motor = MotorService.getOrThrow(motorId);
    if (motor.photoFileId) DriveStore.trash(motor.photoFileId);
    Db.update(SHEETS.MOTORS, motorId, { photoFileId: '', photoUpdatedAt: '' });
    return { id: motorId };
  },

  /**
   * Ambil foto berdasarkan ID file. Hanya ID yang tercatat di aplikasi yang dilayani,
   * agar token tidak bisa dipakai membaca file Drive lain milik pemilik.
   * payload: { ids: string[] } → { [fileId]: dataUrl }
   */
  get: function (payload) {
    var ids = payload && Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    if (ids.length > MAX_PHOTOS_PER_FETCH) {
      throw new AppError('VALIDATION_ERROR', 'Maksimal ' + MAX_PHOTOS_PER_FETCH + ' foto per permintaan.');
    }
    var known = PhotoService.knownIds_();
    var out = {};
    ids.forEach(function (id) {
      if (!known[id] || out[id]) return;
      var data = DriveStore.read(id);
      if (data) out[id] = data;
    });
    return out;
  },

  knownIds_: function () {
    var known = {};
    Db.all(SHEETS.MOTORS).forEach(function (m) { if (m.photoFileId) known[m.photoFileId] = true; });
    Db.all(SHEETS.RECORDS).forEach(function (r) {
      splitIds_(r.photoIds).forEach(function (id) { known[id] = true; });
    });
    return known;
  },

  /**
   * Proses daftar foto catatan dari form: [{ id }] (foto lama dipertahankan) atau [{ dataUrl }] (foto baru).
   * Mengembalikan { ids, created } — created dipakai untuk membersihkan file jika penyimpanan gagal.
   */
  prepareRecordPhotos: function (raw, existingIds, baseName) {
    if (raw === undefined || raw === null) return { ids: existingIds.slice(), created: [], unchanged: true };
    if (!Array.isArray(raw)) throw new AppError('VALIDATION_ERROR', 'Foto harus berupa daftar.', { photos: 'Tidak valid' });
    if (raw.length > MAX_RECORD_PHOTOS) {
      throw new AppError('VALIDATION_ERROR', 'Maksimal ' + MAX_RECORD_PHOTOS + ' foto per catatan.', { photos: 'Maksimal ' + MAX_RECORD_PHOTOS + ' foto' });
    }
    // Validasi semua dulu sebelum membuat file apa pun.
    raw.forEach(function (p, i) {
      if (!p || typeof p !== 'object') throw new AppError('VALIDATION_ERROR', 'Foto tidak valid.', { photos: 'Tidak valid' });
      if (p.id) {
        if (existingIds.indexOf(String(p.id)) === -1) {
          throw new AppError('VALIDATION_ERROR', 'Foto ke-' + (i + 1) + ' bukan milik catatan ini.', { photos: 'Tidak valid' });
        }
      } else {
        DriveStore.parse(p.dataUrl, 'photos');
      }
    });
    var ids = [];
    var created = [];
    try {
      raw.forEach(function (p, i) {
        if (p.id) {
          ids.push(String(p.id));
        } else {
          var id = DriveStore.save('record', baseName + '-' + (i + 1), p.dataUrl);
          created.push(id);
          ids.push(id);
        }
      });
    } catch (err) {
      created.forEach(DriveStore.trash);
      throw err;
    }
    return { ids: ids, created: created, unchanged: false };
  },

  /**
   * Migrasi v0.3 → v0.4: pindahkan foto motor dari sheet motor_photos ke Drive.
   * Dipanggil oleh setup(). Aman dijalankan berulang.
   */
  migrateLegacy: function () {
    var moved = 0;
    var legacy = {};
    Db.all(SHEETS.PHOTOS, { includeDeleted: true }).forEach(function (p) { legacy[p.motorId] = p; });
    Db.all(SHEETS.MOTORS).forEach(function (m) {
      var p = legacy[m.id];
      if (!p || m.photoFileId || p.deleted) return;
      var data = '';
      for (var i = 0; i < PHOTO_PARTS; i++) data += p['part' + (i + 1)] || '';
      if (!DriveStore.DATA_URL.test(data)) return;
      var fileId = DriveStore.save('motor', 'motor-' + slug_(m.name), data);
      Db.update(SHEETS.MOTORS, m.id, { photoFileId: fileId, photoUpdatedAt: nowISO_() });
      var clear = { mime: '', chars: 0, deleted: true };
      for (var j = 0; j < PHOTO_PARTS; j++) clear['part' + (j + 1)] = '';
      Db.upsert(SHEETS.PHOTOS, m.id, clear);
      moved++;
    });
    return moved;
  },
};

function splitIds_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

function slug_(s) {
  return String(s || 'motor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40) || 'motor';
}
