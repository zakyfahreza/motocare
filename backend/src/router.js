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
