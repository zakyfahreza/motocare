var ReportService = {
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
