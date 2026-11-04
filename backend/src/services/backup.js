var BackupService = {
  /** Semua data aktif (tanpa baris yang dihapus) untuk diunduh sebagai file cadangan JSON. */
  exportAll: function () {
    return {
      app: 'motocare',
      version: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowISO_(),
      motors: Db.all(SHEETS.MOTORS),
      records: Db.all(SHEETS.RECORDS),
      recordItems: Db.all(SHEETS.ITEMS),
      reminders: Db.all(SHEETS.REMINDERS),
      categories: Db.all(SHEETS.CATEGORIES),
      motorPhotos: PhotoService.get({}),
    };
  },
};
