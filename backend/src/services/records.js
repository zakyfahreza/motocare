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
    var sumTotal = filtered.reduce(function (s, r) { return s + (Number(r.grandTotal) || 0); }, 0);
    return { items: page, total: filtered.length, sumTotal: sumTotal };
  },

  /** Semua catatan (sesuai filter) lengkap dengan item, untuk ekspor CSV. */
  exportRows: function (payload) {
    var p = {};
    Object.keys(payload || {}).forEach(function (k) { p[k] = payload[k]; });
    p.limit = 100;
    p.offset = 0;
    var first = RecordService.list(p);
    var ordered = [];
    var collect = function (res) { res.items.forEach(function (r) { ordered.push(r); }); };
    collect(first);
    while (ordered.length < first.total) {
      p.offset = ordered.length;
      var res = RecordService.list(p);
      if (!res.items.length) break;
      collect(res);
    }
    var itemsByRecord = RecordService.itemsByRecord_(p.motorId);
    return ordered.map(function (r) {
      r.items = itemsByRecord[r.id] || [];
      return r;
    });
  },

  get: function (payload) {
    var id = requireId_(payload);
    var record = RecordService.getOrThrow_(id);
    record.items = Db.all(SHEETS.ITEMS).filter(function (it) { return it.recordId === id; });
    if (record.type === 'BENSIN') {
      var eco = Logic.fuelEconomy(RecordService.fuelFills_(record.motorId));
      record.economy = eco[record.id] || null;
    }
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
    var photos = PhotoService.prepareRecordPhotos(payload.photos, [], 'nota-' + data.date);

    try {
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
        tags: data.tags.join(','),
        details: data.details,
        photoIds: photos.ids.join(','),
      });
      RecordService.insertItems_(record, data.items);
    } catch (err) {
      photos.created.forEach(DriveStore.trash);
      throw err;
    }
    MotorService.bumpOdometer(motor, data.odometer);
    return RecordService.get({ id: record.id });
  },

  update: function (payload) {
    var id = requireId_(payload);
    var existing = RecordService.getOrThrow_(id);
    var motor = MotorService.getOrThrow(existing.motorId);
    var data = RecordService.validate_(payload);
    RecordService.checkOdometer_(existing.motorId, id, data, payload.confirmOdometer === true);
    var oldIds = splitIds_(existing.photoIds);
    var photos = PhotoService.prepareRecordPhotos(payload.photos, oldIds, 'nota-' + data.date);

    var record;
    try {
      var totals = Logic.calcRecordTotals(data.items, data.serviceFee);
      record = Db.update(SHEETS.RECORDS, id, {
        date: data.date,
        type: data.type,
        odometer: data.odometer,
        place: data.place,
        serviceFee: data.serviceFee,
        itemsTotal: totals.itemsTotal,
        grandTotal: totals.grandTotal,
        notes: data.notes,
        tags: data.tags.join(','),
        details: data.details,
        photoIds: photos.ids.join(','),
      });
      Db.softDeleteWhere(SHEETS.ITEMS, function (it) { return it.recordId === id; });
      RecordService.insertItems_(record, data.items);
    } catch (err) {
      photos.created.forEach(DriveStore.trash);
      throw err;
    }
    // Foto yang dilepas dari catatan dibuang ke sampah Drive.
    oldIds.forEach(function (fid) { if (photos.ids.indexOf(fid) === -1) DriveStore.trash(fid); });
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

    var type = payload && payload.type;
    if (type === 'BENSIN') return RecordService.validateFuel_(payload, v);
    if (type === 'BAN') return RecordService.validateTire_(payload, v);

    // Jenis servis (chip) — hanya untuk tipe servis.
    var tags = [];
    if (payload && payload.tags !== undefined && payload.tags !== null) {
      if (!Array.isArray(payload.tags) || payload.tags.some(function (t) { return SERVICE_TAGS.indexOf(t) === -1; })) {
        v.addError('tags', 'Jenis servis tidak valid');
      } else {
        payload.tags.forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
      }
    }

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
    data.tags = tags;
    data.details = '';
    return data;
  },

  /** Bensin: item BBM dibuat server dari liter × harga per liter. */
  validateFuel_: function (payload, v) {
    var raw = payload.fuel && typeof payload.fuel === 'object' ? payload.fuel : {};
    var fv = new Validator_(raw, 'fuel.');
    fv.string('fuelType', { required: true, max: 40 })
      .number('liters', { required: true, gt: 0, max: 100 })
      .int('pricePerLiter', { required: true, min: 0, max: 100000 })
      .bool('fullTank', { defaultValue: false })
      .string('station', { max: 30 });
    Object.keys(fv.errors).forEach(function (k) { v.errors[k] = fv.errors[k]; });
    var data = v.done();
    var f = fv.out;
    f.liters = Math.round(f.liters * 100) / 100;
    data.serviceFee = 0;
    data.tags = [];
    data.items = [{ category: FUEL_CATEGORY, name: f.fuelType, brand: f.station, qty: f.liters, unitPrice: f.pricePerLiter }];
    data.details = JSON.stringify({ fuel: f });
    return data;
  },

  /** Ban: item ban baru (depan/belakang/sepasang) dibuat server, ongkos pasang + tambahan masuk biaya jasa. */
  validateTire_: function (payload, v) {
    var raw = payload.tire && typeof payload.tire === 'object' ? payload.tire : {};
    var tv = new Validator_(raw, 'tire.');
    tv.oneOf('action', TIRE_ACTIONS, { required: true })
      .oneOf('position', TIRE_POSITIONS, { required: true })
      .string('brand', { max: 60 })
      .string('size', { max: 30 })
      .string('dot', { max: 30 })
      .oneOf('construction', TIRE_CONSTRUCTIONS)
      .int('psiFront', { min: 0, max: 80 })
      .int('psiRear', { min: 0, max: 80 })
      .oneOf('gas', TIRE_GASES)
      .int('tirePrice', { min: 0, max: 100000000, defaultValue: 0 })
      .int('installFee', { min: 0, max: 100000000, defaultValue: 0 })
      .int('extraFee', { min: 0, max: 100000000, defaultValue: 0 });
    if (raw.action === 'GANTI' && !(String(raw.brand || '').trim())) tv.addError('brand', 'Wajib diisi untuk ganti ban');
    Object.keys(tv.errors).forEach(function (k) { v.errors[k] = tv.errors[k]; });
    var data = v.done();
    var t = tv.out;
    if (t.action !== 'GANTI') t.tirePrice = 0;
    var items = [];
    if (t.action === 'GANTI') {
      var cats = t.position === 'DEPAN' ? ['BAN_DEPAN'] : t.position === 'BELAKANG' ? ['BAN_BELAKANG'] : TIRE_CATEGORIES;
      var name = [t.brand, t.size].filter(Boolean).join(' ').substring(0, 100);
      cats.forEach(function (c) { items.push({ category: c, name: name, brand: t.brand.substring(0, 50), qty: 1, unitPrice: t.tirePrice }); });
    }
    data.serviceFee = t.installFee + t.extraFee;
    data.tags = [];
    data.items = items;
    data.details = JSON.stringify({ tire: t });
    return data;
  },

  /** Riwayat isi bensin satu motor (ringkas) untuk menghitung konsumsi km/liter. */
  fuelHistory: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    return RecordService.fuelFills_(motorId);
  },

  fuelFills_: function (motorId) {
    return Db.all(SHEETS.RECORDS)
      .filter(function (r) { return r.motorId === motorId && r.type === 'BENSIN'; })
      .map(function (r) {
        var f = (parseDetails_(r.details).fuel) || {};
        return {
          id: r.id, date: r.date, odometer: r.odometer, liters: Number(f.liters) || 0, fullTank: f.fullTank === true, createdAt: r.createdAt,
          fuelType: f.fuelType || '', pricePerLiter: Number(f.pricePerLiter) || 0, station: f.station || '',
        };
      })
      .sort(function (a, b) { return a.odometer - b.odometer || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
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

/** JSON rincian Bensin/Ban dari sel; objek kosong jika kosong/rusak. */
function parseDetails_(s) {
  if (!s) return {};
  try {
    var o = JSON.parse(s);
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}
