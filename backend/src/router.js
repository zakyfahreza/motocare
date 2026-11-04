/**
 * Peta action → handler. write: true = dijalankan di dalam LockService.
 * Dibuat lewat fungsi agar tidak bergantung pada urutan load file.
 */
function getRoutes_() {
  return {
    'auth.check': { handler: function () { return { version: APP_VERSION }; } },

    'settings.get': { handler: SettingsService.get },
    'settings.saveCategory': { write: true, handler: SettingsService.saveCategory },

    'motors.list': { handler: MotorService.list },
    'motors.create': { write: true, handler: MotorService.create },
    'motors.update': { write: true, handler: MotorService.update },
    'motors.delete': { write: true, handler: MotorService.remove },
    'motors.updateOdometer': { write: true, handler: MotorService.updateOdometer },
    'motors.overview': { handler: MotorService.overview },
    'motors.setPhoto': { write: true, handler: PhotoService.set },
    'motors.removePhoto': { write: true, handler: PhotoService.remove },
    'photos.get': { handler: PhotoService.get },
    'records.fuelHistory': { handler: RecordService.fuelHistory },
    'batch': { handler: runBatch_ },
    'records.export': { handler: RecordService.exportRows },
    'reports.summary': { handler: ReportService.summary },
    'backup.export': { handler: BackupService.exportAll },

    'records.list': { handler: RecordService.list },
    'records.get': { handler: RecordService.get },
    'records.create': { write: true, handler: RecordService.create },
    'records.update': { write: true, handler: RecordService.update },
    'records.delete': { write: true, handler: RecordService.remove },
    'records.places': { handler: RecordService.places },

    'reminders.list': { handler: ReminderService.list },
    'reminders.upsert': { write: true, handler: ReminderService.upsert },
    'reminders.delete': { write: true, handler: ReminderService.remove },

    'dashboard.get': { handler: DashboardService.get },

    'reports.monthly': { handler: ReportService.monthly },
    'reports.byCategory': { handler: ReportService.byCategory },
  };
}

var BATCH_MAX = 12;

/**
 * Jalankan beberapa action BACA dalam satu request agar aplikasi lebih cepat
 * (satu kali bolak-balik ke Apps Script, sheet dibaca sekali lalu dipakai bersama).
 * payload: { calls: [{ action, payload }] } → [{ ok, data } | { ok: false, error }]
 */
function runBatch_(payload) {
  var calls = payload && payload.calls;
  if (!Array.isArray(calls) || !calls.length) throw new AppError('BAD_REQUEST', 'Field "calls" wajib berupa daftar.');
  if (calls.length > BATCH_MAX) throw new AppError('BAD_REQUEST', 'Maksimal ' + BATCH_MAX + ' action per batch.');
  var routes = getRoutes_();
  return calls.map(function (c) {
    try {
      var action = c && c.action;
      var route = routes.hasOwnProperty(action) ? routes[action] : null;
      if (!route || action === 'batch') throw new AppError('UNKNOWN_ACTION', 'Action tidak dikenal: ' + action);
      if (route.write) throw new AppError('BAD_REQUEST', 'Action tulis tidak boleh di dalam batch: ' + action);
      var p = c.payload;
      if (p !== undefined && (typeof p !== 'object' || p === null || Array.isArray(p))) throw new AppError('BAD_REQUEST', 'payload harus objek');
      return { ok: true, data: route.handler(p || {}) };
    } catch (err) {
      if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message, fields: err.fields || undefined } };
      console.error('BATCH INTERNAL_ERROR: ' + (err && err.stack ? err.stack : err));
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan di server.' } };
    }
  });
}
