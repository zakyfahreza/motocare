var RecordService = {
  MAX_ITEMS: 50,

  // ---------- baca ----------

  list: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    var f = new Validator_(payload)
      .oneOf('type', RECORD_TYPES)
      .string('category', { max: 30 })
      .date('from')
      .date('to')
      .int('limit', { min: 1, max: 100, defaultValue: 20 })
      .int('offset', { min: 0, defaultValue: 0 })
      .done();

    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    var itemsByRecord = RecordService.itemsByRecord_(motorId);

    var filtered = records.filter(function (r) {
      if (f.type && r.type !== f.type) return false;
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      if (f.category) {
        var its = itemsByRecord[r.id] || [];
        if (f.category === SERVICE_FEE_CATEGORY) return r.serviceFee > 0;
        if (!its.some(function (it) { return it.category === f.category; })) return false;
      }
      return true;
    });
    filtered.sort(Logic.compareRecordsDesc);

    var page = filtered.slice(f.offset, f.offset + f.limit).map(function (r) {
      return RecordService.toSummary_(r, itemsByRecord[r.id] || []);
    });
    return { items: page, total: filtered.length };
  },

  get: function (payload) {
    var id = requireId_(payload);
    var record = RecordService.getOrThrow_(id);
    record.items = Db.all(SHEETS.ITEMS).filter(function (it) { return it.recordId === id; });
    return record;
  },

  places: function (payload) {
    var motorId = payload && payload.motorId;
    var seen = {};
    var out = [];
    Db.all(SHEETS.RECORDS)
      .filter(function (r) { return !motorId || r.motorId === motorId; })
      .sort(Logic.compareRecordsDesc)
      .forEach(function (r) {
        var p = (r.place || '').trim();
        var key = p.toLowerCase();
        if (p && !seen[key] && out.length < 30) {
          seen[key] = true;
          out.push(p);
        }
      });
    return out;
  },

  /** Catatan terbaru (ringkasan) untuk satu motor, atau null. */
  latest: function (motorId) {
    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    if (!records.length) return null;
    records.sort(Logic.compareRecordsDesc);
    var byRecord = RecordService.itemsByRecord_(motorId);
    return RecordService.toSummary_(records[0], byRecord[records[0].id] || []);
  },

  // ---------- tulis ----------

  create: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    var motor = MotorService.getOrThrow(motorId);
    var data = RecordService.validate_(payload);
    RecordService.checkOdometer_(motorId, null, data, payload.confirmOdometer === true);

    var totals = Logic.calcRecordTotals(data.items, data.serviceFee);
    var record = Db.insert(SHEETS.RECORDS, {
      motorId: motorId,
      date: data.date,
      type: data.type,
      odometer: data.odometer,
      place: data.place,
      serviceFee: data.serviceFee,
      itemsTotal: totals.itemsTotal,
      grandTotal: totals.grandTotal,
      notes: data.notes,
    });
    RecordService.insertItems_(record, data.items);
    MotorService.bumpOdometer(motor, data.odometer);
    return RecordService.get({ id: record.id });
  },

  update: function (payload) {
    var id = requireId_(payload);
    var existing = RecordService.getOrThrow_(id);
    var motor = MotorService.getOrThrow(existing.motorId);
    var data = RecordService.validate_(payload);
    RecordService.checkOdometer_(existing.motorId, id, data, payload.confirmOdometer === true);

    var totals = Logic.calcRecordTotals(data.items, data.serviceFee);
    var record = Db.update(SHEETS.RECORDS, id, {
      date: data.date,
      type: data.type,
      odometer: data.odometer,
      place: data.place,
      serviceFee: data.serviceFee,
      itemsTotal: totals.itemsTotal,
      grandTotal: totals.grandTotal,
      notes: data.notes,
    });
    Db.softDeleteWhere(SHEETS.ITEMS, function (it) { return it.recordId === id; });
    RecordService.insertItems_(record, data.items);
    MotorService.bumpOdometer(motor, data.odometer);
    return RecordService.get({ id: id });
  },

  remove: function (payload) {
    var id = requireId_(payload);
    RecordService.getOrThrow_(id);
    Db.softDelete(SHEETS.RECORDS, id);
    Db.softDeleteWhere(SHEETS.ITEMS, function (it) { return it.recordId === id; });
    return { id: id };
  },

  // ---------- internal ----------

  getOrThrow_: function (id) {
    var record = Db.findById(SHEETS.RECORDS, id);
    if (!record) throw new AppError('NOT_FOUND', 'Catatan tidak ditemukan.');
    return record;
  },

  itemsByRecord_: function (motorId) {
    var map = {};
    Db.all(SHEETS.ITEMS).forEach(function (it) {
      if (it.motorId !== motorId) return;
      (map[it.recordId] = map[it.recordId] || []).push(it);
    });
    return map;
  },

  toSummary_: function (record, items) {
    var cats = [];
    items.forEach(function (it) {
      if (cats.indexOf(it.category) === -1) cats.push(it.category);
    });
    record.itemCount = items.length;
    record.categories = cats;
    record.itemNames = items.map(function (it) { return it.name; }).slice(0, 5);
    return record;
  },

  insertItems_: function (record, items) {
    Db.insertMany(SHEETS.ITEMS, items.map(function (it) {
      return {
        recordId: record.id,
        motorId: record.motorId,
        category: it.category,
        name: it.name,
        brand: it.brand,
        qty: it.qty,
        unitPrice: it.unitPrice,
        subtotal: Logic.calcItemSubtotal(it.qty, it.unitPrice),
      };
    }));
  },

  validate_: function (payload) {
    var maxDate = Logic.addDays(todayISO_(), 1);
    var v = new Validator_(payload);
    v.date('date', { required: true, maxDate: maxDate })
      .oneOf('type', RECORD_TYPES, { required: true })
      .int('odometer', { required: true, min: 0, max: 9999999 })
      .string('place', { max: 100 })
      .int('serviceFee', { min: 0, max: 1000000000, defaultValue: 0 })
      .string('notes', { max: 1000 });

    var rawItems = payload && payload.items !== undefined ? payload.items : [];
    var items = [];
    if (!Array.isArray(rawItems)) {
      v.addError('items', 'Harus berupa daftar');
    } else if (rawItems.length > RecordService.MAX_ITEMS) {
      v.addError('items', 'Maksimal ' + RecordService.MAX_ITEMS + ' item');
    } else {
      var activeCats = SettingsService.activeCategoryCodes();
      rawItems.forEach(function (raw, idx) {
        var iv = new Validator_(raw, 'items.' + idx + '.');
        iv.oneOf('category', activeCats, { required: true })
          .string('name', { required: true, max: 100 })
          .string('brand', { max: 50 })
          .number('qty', { required: true, gt: 0, max: 10000 })
          .int('unitPrice', { required: true, min: 0, max: 1000000000 });
        Object.keys(iv.errors).forEach(function (k) { v.errors[k] = iv.errors[k]; });
        items.push(iv.out);
      });
    }

    var type = payload && payload.type;
    if (!v.hasErrors()) {
      if (type === 'BELANJA_PART' && items.length === 0) {
        v.addError('items', 'Belanja part wajib memiliki minimal 1 item');
      }
      if (type === 'GANTI_OLI' && !items.some(function (it) { return OIL_CATEGORIES.indexOf(it.category) !== -1; })) {
        v.addError('items', 'Ganti oli wajib memiliki minimal 1 item Oli Mesin atau Oli Gardan');
      }
    }
    var data = v.done();
    data.items = items;
    return data;
  },

  /**
   * ODOMETER_LOWER jika odometer lebih kecil dari catatan aktif lain yang tanggalnya lebih awal.
   * Bisa dilewati dengan confirmOdometer = true.
   */
  checkOdometer_: function (motorId, selfId, data, confirmed) {
    if (confirmed) return;
    var conflict = null;
    Db.all(SHEETS.RECORDS).forEach(function (r) {
      if (r.motorId !== motorId || r.id === selfId) return;
      if (r.date < data.date && r.odometer > data.odometer) {
        if (!conflict || r.odometer > conflict.odometer) conflict = r;
      }
    });
    if (conflict) {
      throw new AppError(
        'ODOMETER_LOWER',
        'Odometer ' + data.odometer + ' km lebih kecil dari catatan sebelumnya (' +
          conflict.odometer + ' km pada ' + conflict.date + '). Tetap simpan?',
        { odometer: 'Lebih kecil dari catatan ' + conflict.date + ' (' + conflict.odometer + ' km)' },
      );
    }
  },
};
