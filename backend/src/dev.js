/**
 * Utilitas pengembangan. TIDAK dipanggil otomatis dan tidak bisa diakses lewat API.
 * Jalankan manual dari editor Apps Script bila perlu.
 */

/** Membuat motor "Motor Uji" dengan 1.000 catatan dummy untuk uji performa (task T6.3). */
function dev_seedDummy() {
  Db.reset();
  var motor = MotorService.create({ name: 'Motor Uji', brand: 'Honda', model: 'Vario 125', year: 2022, plate: 'B 0000 UJI', odometerStart: 1000 });
  var cats = ['OLI_MESIN', 'BUSI', 'FILTER_UDARA', 'KAMPAS_REM_DEPAN', 'BAN_BELAKANG'];
  var types = ['GANTI_OLI', 'SERVIS', 'BELANJA_PART'];
  var records = [];
  var items = [];
  var odo = 1000;
  var start = Logic.addDays(todayISO_(), -1000);
  for (var i = 0; i < 1000; i++) {
    odo += 15 + (i % 7) * 5;
    var type = types[i % 3];
    var id = newId_();
    var its = [{ category: type === 'GANTI_OLI' ? 'OLI_MESIN' : cats[i % cats.length], name: 'Item ' + i, brand: '', qty: 1, unitPrice: 25000 + (i % 10) * 1000 }];
    var totals = Logic.calcRecordTotals(its, type === 'SERVIS' ? 20000 : 0);
    records.push({ id: id, motorId: motor.id, date: Logic.addDays(start, i), type: type, odometer: odo, place: 'Bengkel ' + (i % 5), serviceFee: type === 'SERVIS' ? 20000 : 0, itemsTotal: totals.itemsTotal, grandTotal: totals.grandTotal, notes: '' });
    its.forEach(function (it) {
      items.push({ recordId: id, motorId: motor.id, category: it.category, name: it.name, brand: it.brand, qty: it.qty, unitPrice: it.unitPrice, subtotal: Logic.calcItemSubtotal(it.qty, it.unitPrice) });
    });
  }
  Db.insertMany(SHEETS.RECORDS, records);
  Db.insertMany(SHEETS.ITEMS, items);
  MotorService.bumpOdometer(Db.findById(SHEETS.MOTORS, motor.id), odo);
  Logger.log('Dummy dibuat untuk motor ' + motor.id + ' (1.000 catatan). Hapus motor ini setelah uji selesai.');
}

/** Mengukur waktu beberapa action baca untuk motor tertentu. */
function dev_benchmark() {
  Db.reset();
  var motors = MotorService.list();
  if (!motors.length) return Logger.log('Belum ada motor.');
  var motorId = motors[motors.length - 1].id;
  ['records.list', 'dashboard.get', 'reminders.list', 'reports.monthly'].forEach(function (action) {
    Db.reset();
    var t = Date.now();
    getRoutes_()[action].handler({ motorId: motorId });
    Logger.log(action + ': ' + (Date.now() - t) + ' ms');
  });
}
