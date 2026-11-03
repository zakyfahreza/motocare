var MotorService = {
  list: function () {
    return Db.all(SHEETS.MOTORS).sort(function (a, b) {
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  },

  getOrThrow: function (id) {
    var motor = Db.findById(SHEETS.MOTORS, id);
    if (!motor) throw new AppError('NOT_FOUND', 'Motor tidak ditemukan.');
    return motor;
  },

  validate_: function (payload, isUpdate) {
    var maxYear = Number(todayISO_().substring(0, 4)) + 1;
    var v = new Validator_(payload);
    v.string('name', { required: true, max: 50 })
      .string('brand', { max: 30 })
      .string('model', { max: 50 })
      .int('year', { min: 1950, max: maxYear })
      .string('plate', { max: 15 })
      .int('odometerStart', { required: true, min: 0, max: 9999999 });
    if (isUpdate) v.int('odometerCurrent', { min: 0, max: 9999999 });
    return v.done();
  },

  create: function (payload) {
    var data = MotorService.validate_(payload, false);
    data.plate = data.plate.toUpperCase();
    data.odometerCurrent = data.odometerStart;
    data.odometerUpdatedAt = nowISO_();
    var motor = Db.insert(SHEETS.MOTORS, data);

    Db.insertMany(SHEETS.REMINDERS, DEFAULT_REMINDERS.map(function (r) {
      return {
        motorId: motor.id,
        category: r.category,
        intervalKm: r.intervalKm,
        intervalDays: r.intervalDays,
        active: true,
      };
    }));
    return motor;
  },

  update: function (payload) {
    var id = requireId_(payload);
    var existing = MotorService.getOrThrow(id);
    var data = MotorService.validate_(payload, true);
    var patch = {
      name: data.name,
      brand: data.brand,
      model: data.model,
      year: data.year,
      plate: data.plate.toUpperCase(),
      odometerStart: data.odometerStart,
    };
    // Koreksi odometer manual (boleh turun, misalnya salah ketik).
    if (data.odometerCurrent !== null && data.odometerCurrent !== existing.odometerCurrent) {
      patch.odometerCurrent = data.odometerCurrent;
      patch.odometerUpdatedAt = nowISO_();
    }
    var current = patch.hasOwnProperty('odometerCurrent') ? patch.odometerCurrent : existing.odometerCurrent;
    if (current < data.odometerStart) {
      patch.odometerCurrent = data.odometerStart;
      patch.odometerUpdatedAt = nowISO_();
    }
    return Db.update(SHEETS.MOTORS, id, patch);
  },

  remove: function (payload) {
    var id = requireId_(payload);
    MotorService.getOrThrow(id);
    Db.softDelete(SHEETS.MOTORS, id);
    return { id: id };
  },

  updateOdometer: function (payload) {
    var id = requireId_(payload);
    var motor = MotorService.getOrThrow(id);
    var data = new Validator_(payload).int('odometer', { required: true, min: 0, max: 9999999 }).done();
    if (data.odometer < motor.odometerCurrent) {
      throw new AppError(
        'ODOMETER_LOWER',
        'Odometer baru lebih kecil dari odometer terkini (' + motor.odometerCurrent + ' km). ' +
          'Untuk koreksi, ubah lewat menu Edit Motor.',
        { odometer: 'Minimal ' + motor.odometerCurrent },
      );
    }
    return Db.update(SHEETS.MOTORS, id, { odometerCurrent: data.odometer, odometerUpdatedAt: nowISO_() });
  },

  /** Naikkan odometerCurrent jika odometer catatan lebih besar. Tidak pernah menurunkan. */
  bumpOdometer: function (motor, odometer) {
    if (odometer > motor.odometerCurrent) {
      return Db.update(SHEETS.MOTORS, motor.id, { odometerCurrent: odometer, odometerUpdatedAt: nowISO_() });
    }
    return motor;
  },
};
