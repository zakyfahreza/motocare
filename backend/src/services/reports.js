var ReportService = {
  /** Ringkasan laporan tahunan + biaya per km + 3 catatan terbaru. */
  summary: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    var motor = MotorService.getOrThrow(motorId);
    var today = todayISO_();
    var currentYear = Number(today.substring(0, 4));
    var p = new Validator_(payload).int('year', { min: 1950, max: currentYear + 1, defaultValue: currentYear }).done();
    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    var items = Db.all(SHEETS.ITEMS).filter(function (it) { return it.motorId === motorId; });

    var summary = Logic.summarizeYear(records, items, p.year, today, FLUID_CATEGORIES);
    var allTime = records.reduce(function (s, r) { return s + (Number(r.grandTotal) || 0); }, 0);
    var km = Math.max(0, motor.odometerCurrent - motor.odometerStart);
    summary.costPerKm = { total: allTime, km: km, value: km ? Math.round((allTime / km) * 100) / 100 : null };

    var byRecord = RecordService.itemsByRecord_(motorId);
    summary.recent = records.slice().sort(Logic.compareRecordsDesc).slice(0, 3).map(function (r) {
      return RecordService.toSummary_(r, byRecord[r.id] || []);
    });
    var years = {};
    records.forEach(function (r) { years[String(r.date).substring(0, 4)] = true; });
    years[String(currentYear)] = true;
    summary.years = Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
    return summary;
  },

  monthly: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    MotorService.getOrThrow(motorId);
    var p = new Validator_(payload).int('months', { min: 1, max: 36, defaultValue: 12 }).done();
    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    return Logic.aggregateMonthly(records, p.months, todayISO_());
  },

  byCategory: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    MotorService.getOrThrow(motorId);
    var currentYear = Number(todayISO_().substring(0, 4));
    var p = new Validator_(payload).int('year', { min: 1950, max: currentYear + 1, defaultValue: currentYear }).done();
    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    var items = Db.all(SHEETS.ITEMS).filter(function (it) { return it.motorId === motorId; });
    var labels = SettingsService.categoryLabels();
    return Logic.aggregateByCategory(records, items, p.year).map(function (row) {
      return { category: row.category, label: labels[row.category] || row.category, total: row.total };
    });
  },
};
