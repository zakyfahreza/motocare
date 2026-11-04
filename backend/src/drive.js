/**
 * Penyimpanan foto di Google Drive pemilik script.
 * Struktur: "MotoCare Foto" / "Foto Motor" dan "MotoCare Foto" / "Nota & Part".
 * File bersifat privat (tidak dibagikan); aplikasi mengambilnya lewat backend.
 */
var DriveStore = {
  DATA_URL: /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  EXT: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  folderMemo_: {},

  /** Folder induk; dibuat jika belum ada atau sudah dibuang ke sampah. */
  rootFolder_: function () {
    return DriveStore.ensureFolder_('PHOTO_FOLDER_ID', DRIVE_ROOT_FOLDER, null);
  },

  folder_: function (kind) {
    var name = DRIVE_SUBFOLDERS[kind];
    if (!name) throw new Error('Jenis folder tidak dikenal: ' + kind);
    return DriveStore.ensureFolder_('PHOTO_FOLDER_' + kind.toUpperCase(), name, DriveStore.rootFolder_());
  },

  ensureFolder_: function (propKey, name, parent) {
    if (DriveStore.folderMemo_[propKey]) return DriveStore.folderMemo_[propKey];
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(propKey);
    var folder = null;
    if (id) {
      try {
        folder = DriveApp.getFolderById(id);
        if (folder.isTrashed()) folder = null;
      } catch (e) {
        folder = null;
      }
    }
    if (!folder) {
      folder = parent ? parent.createFolder(name) : DriveApp.createFolder(name);
      props.setProperty(propKey, folder.getId());
    }
    DriveStore.folderMemo_[propKey] = folder;
    return folder;
  },

  folderUrl: function () {
    var id = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
    return id ? 'https://drive.google.com/drive/folders/' + id : '';
  },

  /** Validasi data URL gambar. Mengembalikan { mime, base64 } atau melempar VALIDATION_ERROR. */
  parse: function (dataUrl, field) {
    var fields = {};
    fields[field || 'photo'] = 'Tidak valid';
    if (typeof dataUrl !== 'string' || !dataUrl) {
      throw new AppError('VALIDATION_ERROR', 'Foto wajib diisi.', fields);
    }
    if (dataUrl.length > PHOTO_UPLOAD_MAX_CHARS) {
      throw new AppError('VALIDATION_ERROR', 'Ukuran foto terlalu besar setelah dikompres. Coba foto lain.', fields);
    }
    var m = DriveStore.DATA_URL.exec(dataUrl);
    if (!m) throw new AppError('VALIDATION_ERROR', 'Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.', fields);
    return { mime: m[1], base64: m[2] };
  },

  /** Simpan foto ke folder Drive. kind: 'motor' | 'record'. Mengembalikan ID file. */
  save: function (kind, baseName, dataUrl) {
    var p = DriveStore.parse(dataUrl);
    var name = baseName + '-' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss') + '.' + DriveStore.EXT[p.mime];
    var blob = Utilities.newBlob(Utilities.base64Decode(p.base64), p.mime, name);
    var file = DriveStore.folder_(kind).createFile(blob);
    return file.getId();
  },

  /** Pindahkan file ke sampah Drive (bisa dipulihkan 30 hari). Tidak melempar error. */
  trash: function (fileId) {
    if (!fileId) return;
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (e) {
      console.warn('Gagal membuang file ' + fileId + ': ' + e);
    }
  },

  /** Baca file sebagai data URL, atau '' jika tidak ada / sudah dihapus. */
  read: function (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      if (file.isTrashed()) return '';
      var blob = file.getBlob();
      return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) {
      console.warn('Gagal membaca file ' + fileId + ': ' + e);
      return '';
    }
  },
};
