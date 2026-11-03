var ReminderService = {
  list: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    var motor = MotorService.getOrThrow(motorId);
    return ReminderService.computeForMotor(motor);
  },

  /** Semua aturan pengingat motor + status terhitung, terurut sesuai prioritas. */
  computeForMotor: function (motor) {
    var rules = Db.all(SHEETS.REMINDERS).filter(function (r) { return r.motorId === motor.id; });
    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motor.id; });
    var items = Db.all(SHEETS.ITEMS).filter(function (it) { return it.motorId === motor.id; });
    var labels = SettingsService.categoryLabels();
    var today = todayISO_();

    var list = rules.map(function (rule) {
      return ReminderService.withStatus_(rule, records, items, motor.odometerCurrent, today, labels);
    });
    return Logic.sortReminders(list);
  },

  withStatus_: function (rule, records, items, currentOdometer, today, labels) {
    var lastDone = Logic.findLastDone(records, items, rule.category);
    var s = Logic.computeReminderStatus(rule, lastDone, currentOdometer, today);
    var out = {
      id: rule.id,
      motorId: rule.motorId,
      category: rule.category,
      label: labels[rule.category] || rule.category,
      intervalKm: rule.intervalKm,
      intervalDays: rule.intervalDays,
      active: rule.active,
    };
    Object.keys(s).forEach(function (k) { out[k] = s[k]; });
    if (!rule.active) out.status = 'NONAKTIF';
    return out;
  },

  upsert: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    var motor = MotorService.getOrThrow(motorId);
    var v = new Validator_(payload);
    v.oneOf('category', SettingsService.activeCategoryCodes(), { required: true })
      .int('intervalKm', { min: 1, max: 1000000 })
      .int('intervalDays', { min: 1, max: 3650 })
      .bool('active', { defaultValue: true });
    var isEmpty = function (x) { return x === undefined || x === null || x === ''; };
    if (payload && isEmpty(payload.intervalKm) && isEmpty(payload.intervalDays)) {
      v.addError('intervalKm', 'Isi interval km atau interval hari (minimal salah satu)');
    }
    var data = v.done();
    var id = payload.id ? String(payload.id) : null;

    var duplicate = Db.all(SHEETS.REMINDERS).some(function (r) {
      return r.motorId === motorId && r.category === data.category && r.id !== id;
    });
    if (duplicate) {
      throw new AppError('DUPLICATE', 'Pengingat untuk kategori ini sudah ada.', { category: 'Sudah ada' });
    }

    var fields = {
      motorId: motorId,
      category: data.category,
      intervalKm: data.intervalKm,
      intervalDays: data.intervalDays,
      active: data.active,
    };
    var saved;
    if (id) {
      var existing = Db.findById(SHEETS.REMINDERS, id);
      if (!existing || existing.motorId !== motorId) throw new AppError('NOT_FOUND', 'Pengingat tidak ditemukan.');
      saved = Db.update(SHEETS.REMINDERS, id, fields);
    } else {
      saved = Db.insert(SHEETS.REMINDERS, fields);
    }

    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    var items = Db.all(SHEETS.ITEMS).filter(function (it) { return it.motorId === motorId; });
    return ReminderService.withStatus_(saved, records, items, motor.odometerCurrent, todayISO_(), SettingsService.categoryLabels());
  },

  remove: function (payload) {
    var id = requireId_(payload);
    if (!Db.findById(SHEETS.REMINDERS, id)) throw new AppError('NOT_FOUND', 'Pengingat tidak ditemukan.');
    Db.softDelete(SHEETS.REMINDERS, id);
    return { id: id };
  },
};
