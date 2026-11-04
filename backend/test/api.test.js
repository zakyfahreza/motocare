/**
 * Uji integrasi seluruh API di atas mock Apps Script (backend/test/gas-mock.js).
 * Tanggal "hari ini" dikunci ke 2026-11-03 (Asia/Jakarta).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasContext } = require('./gas-mock.js');

function setupApp() {
  const app = createGasContext({ today: '2026-11-03' });
  app.ctx.setup();
  return app;
}

function okData(res) {
  assert.equal(res.ok, true, 'respons gagal: ' + JSON.stringify(res.error));
  return res.data;
}

function errCode(res) {
  assert.equal(res.ok, false, 'seharusnya gagal');
  return res.error.code;
}

test('setup idempoten: sheet, kategori, token', () => {
  const app = setupApp();
  const token = app.props.API_TOKEN;
  assert.match(token, /^[a-f0-9]{64}$/);
  app.ctx.setup();
  assert.equal(app.props.API_TOKEN, token);
  const names = app.spreadsheet().getSheets().map((s) => s.getName()).sort();
  assert.deepEqual(names, ['categories', 'meta', 'motors', 'record_items', 'records', 'reminders']);
  const cats = okData(app.call('settings.get', {})).categories;
  assert.equal(cats.length, 17);
  assert.equal(app.spreadsheet().getSheetByName('meta').getLastRow(), 2);
});

test('request tidak valid & auth', () => {
  const app = setupApp();
  assert.equal(errCode(app.raw('bukan json')), 'BAD_REQUEST');
  assert.equal(errCode(app.raw('{"token":"x"}')), 'BAD_REQUEST');
  assert.equal(errCode(app.call('auth.check', {}, 'salah')), 'UNAUTHORIZED');
  assert.equal(errCode(app.call('auth.check', {}, null)), 'UNAUTHORIZED');
  assert.equal(errCode(app.call('auth.check', {}, app.props.API_TOKEN + 'x')), 'UNAUTHORIZED');
  assert.equal(errCode(app.call('tidak.ada', {})), 'UNKNOWN_ACTION');
  assert.equal(okData(app.call('auth.check', {})).version, app.ctx.APP_VERSION);
  const health = JSON.parse(app.ctx.doGet().getContent());
  assert.equal(health.data.app, 'motocare');
});

test('motor: create + reminder default, update, odometer, delete', () => {
  const app = setupApp();
  const bad = app.call('motors.create', { name: '', odometerStart: -1, year: 1800 });
  assert.equal(errCode(bad), 'VALIDATION_ERROR');
  assert.ok(bad.error.fields.name && bad.error.fields.odometerStart && bad.error.fields.year);

  const m = okData(app.call('motors.create', { name: 'Vario', brand: 'Honda', model: 'Vario 125', year: 2022, plate: 'b 1234 xyz', odometerStart: 10000 }));
  assert.equal(m.plate, 'B 1234 XYZ');
  assert.equal(m.odometerCurrent, 10000);
  const rem = okData(app.call('reminders.list', { motorId: m.id }));
  assert.equal(rem.length, 7);
  assert.ok(rem.every((r) => r.status === 'BELUM_ADA_DATA'));

  assert.equal(errCode(app.call('motors.updateOdometer', { id: m.id, odometer: 9000 })), 'ODOMETER_LOWER');
  assert.equal(okData(app.call('motors.updateOdometer', { id: m.id, odometer: 10500 })).odometerCurrent, 10500);

  const upd = okData(app.call('motors.update', { id: m.id, name: 'Vario Harian', odometerStart: 10000, odometerCurrent: 10400 }));
  assert.equal(upd.name, 'Vario Harian');
  assert.equal(upd.odometerCurrent, 10400);

  okData(app.call('motors.delete', { id: m.id }));
  assert.equal(okData(app.call('motors.list', {})).length, 0);
  assert.equal(errCode(app.call('motors.delete', { id: m.id })), 'NOT_FOUND');
});

test('records: create/validasi/odometer/list/update/delete + dashboard & laporan', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Vario', odometerStart: 10000 }));

  // Validasi tipe
  assert.equal(errCode(app.call('records.create', { motorId: m.id, date: '2026-10-01', type: 'BELANJA_PART', odometer: 12000, items: [] })), 'VALIDATION_ERROR');
  const noOil = app.call('records.create', {
    motorId: m.id, date: '2026-10-01', type: 'GANTI_OLI', odometer: 12000,
    items: [{ category: 'BUSI', name: 'Busi', qty: 1, unitPrice: 20000 }],
  });
  assert.equal(errCode(noOil), 'VALIDATION_ERROR');
  const badItem = app.call('records.create', {
    motorId: m.id, date: '2027-01-01', type: 'SERVIS', odometer: 12000,
    items: [{ category: 'NGAWUR', name: '', qty: 0, unitPrice: -5 }],
  });
  assert.equal(errCode(badItem), 'VALIDATION_ERROR');
  assert.ok(badItem.error.fields.date);
  assert.ok(badItem.error.fields['items.0.category']);
  assert.ok(badItem.error.fields['items.0.name']);
  assert.ok(badItem.error.fields['items.0.qty']);
  assert.ok(badItem.error.fields['items.0.unitPrice']);

  // Ganti oli 2026-10-01 @ 12.000 km
  const oil = okData(app.call('records.create', {
    motorId: m.id, date: '2026-10-01', type: 'GANTI_OLI', odometer: 12000, place: 'Bengkel Jaya', serviceFee: 10000,
    items: [{ category: 'OLI_MESIN', name: '=Yamalube', brand: 'Yamalube', qty: 1, unitPrice: 55000 }, { category: 'OLI_GARDAN', name: 'Gear oil', qty: 1, unitPrice: 15000 }],
  }));
  assert.equal(oil.itemsTotal, 70000);
  assert.equal(oil.grandTotal, 80000);
  assert.equal(oil.items.length, 2);
  assert.equal(oil.items[0].name, '=Yamalube', 'prefix formula injection tidak bocor ke API');
  const itemSheet = app.spreadsheet().getSheetByName('record_items');
  assert.ok(itemSheet.data.some((row) => row.includes("'=Yamalube")), 'nilai diawali = ditulis dengan prefix apostrof');

  // Servis hanya jasa (tanpa item) boleh
  const svc = okData(app.call('records.create', { motorId: m.id, date: '2026-11-01', type: 'SERVIS', odometer: 13000, serviceFee: 35000 }));
  assert.equal(svc.grandTotal, 35000);
  assert.equal(okData(app.call('motors.list', {}))[0].odometerCurrent, 13000);

  // Odometer lebih kecil dari catatan sebelumnya
  const lower = { motorId: m.id, date: '2026-11-02', type: 'BELANJA_PART', odometer: 12500, items: [{ category: 'BUSI', name: 'Busi NGK', qty: 1, unitPrice: 25000 }] };
  assert.equal(errCode(app.call('records.create', lower)), 'ODOMETER_LOWER');
  const forced = okData(app.call('records.create', Object.assign({ confirmOdometer: true }, lower)));
  assert.equal(okData(app.call('motors.list', {}))[0].odometerCurrent, 13000, 'odometer tidak turun');

  // Status pengingat oli: last 12000, next 14000, current 13000 → OK sisa 1000
  let oilRem = okData(app.call('reminders.list', { motorId: m.id })).find((r) => r.category === 'OLI_MESIN');
  assert.equal(oilRem.status, 'OK');
  assert.equal(oilRem.remainingKm, 1000);
  okData(app.call('motors.updateOdometer', { id: m.id, odometer: 13850 }));
  oilRem = okData(app.call('reminders.list', { motorId: m.id })).find((r) => r.category === 'OLI_MESIN');
  assert.equal(oilRem.status, 'SEGERA');
  okData(app.call('motors.updateOdometer', { id: m.id, odometer: 14000 }));
  const rems = okData(app.call('reminders.list', { motorId: m.id }));
  assert.equal(rems[0].category, 'OLI_MESIN');
  assert.equal(rems[0].status, 'TERLAMBAT');

  // List + filter + paginasi
  let list = okData(app.call('records.list', { motorId: m.id }));
  assert.equal(list.total, 3);
  assert.deepEqual(list.items.map((r) => r.date), ['2026-11-02', '2026-11-01', '2026-10-01']);
  assert.equal(okData(app.call('records.list', { motorId: m.id, type: 'GANTI_OLI' })).total, 1);
  assert.equal(okData(app.call('records.list', { motorId: m.id, category: 'BUSI' })).total, 1);
  assert.equal(okData(app.call('records.list', { motorId: m.id, category: 'JASA' })).total, 2);
  assert.equal(okData(app.call('records.list', { motorId: m.id, from: '2026-11-01', to: '2026-11-01' })).total, 1);
  const page2 = okData(app.call('records.list', { motorId: m.id, limit: 2, offset: 2 }));
  assert.equal(page2.items.length, 1);
  assert.equal(page2.total, 3);
  assert.deepEqual(okData(app.call('records.places', { motorId: m.id })), ['Bengkel Jaya']);

  // Update: ganti item, total dihitung ulang
  const upd = okData(app.call('records.update', {
    id: forced.id, date: '2026-11-02', type: 'BELANJA_PART', odometer: 13100,
    items: [{ category: 'BUSI', name: 'Busi Iridium', qty: 2, unitPrice: 60000 }],
  }));
  assert.equal(upd.grandTotal, 120000);
  assert.equal(upd.items.length, 1);
  assert.equal(upd.items[0].name, 'Busi Iridium');

  // Dashboard & laporan
  const dash = okData(app.call('dashboard.get', { motorId: m.id }));
  assert.equal(dash.spend.thisMonth, 35000 + 120000);
  assert.equal(dash.spend.thisYear, 80000 + 35000 + 120000);
  assert.equal(dash.lastRecord.id, forced.id);
  assert.equal(dash.reminders[0].status, 'TERLAMBAT');

  const monthly = okData(app.call('reports.monthly', { motorId: m.id }));
  assert.equal(monthly.length, 12);
  assert.equal(monthly[11].total, 155000);
  assert.equal(monthly[10].total, 80000);
  const byCat = okData(app.call('reports.byCategory', { motorId: m.id, year: 2026 }));
  const total = (c) => (byCat.find((x) => x.category === c) || {}).total;
  assert.equal(total('BUSI'), 120000);
  assert.equal(total('OLI_MESIN'), 55000);
  assert.equal(total('JASA'), 45000);
  assert.equal(byCat.find((x) => x.category === 'JASA').label, 'Jasa Servis');

  // Delete
  okData(app.call('records.delete', { id: forced.id }));
  list = okData(app.call('records.list', { motorId: m.id }));
  assert.equal(list.total, 2);
  assert.equal(errCode(app.call('records.get', { id: forced.id })), 'NOT_FOUND');
  const rowsDeleted = itemSheet.data.filter((row) => row.includes(forced.id));
  assert.ok(rowsDeleted.length >= 2 && rowsDeleted.every((row) => row.includes(true)), 'item ikut soft delete');
});

test('reminders.upsert & settings.saveCategory', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Vario', odometerStart: 0 }));
  assert.equal(errCode(app.call('reminders.upsert', { motorId: m.id, category: 'OLI_MESIN', intervalKm: 3000 })), 'DUPLICATE');
  assert.equal(errCode(app.call('reminders.upsert', { motorId: m.id, category: 'AKI' })), 'VALIDATION_ERROR');
  const aki = okData(app.call('reminders.upsert', { motorId: m.id, category: 'AKI', intervalDays: 730 }));
  assert.equal(aki.status, 'BELUM_ADA_DATA');
  const updated = okData(app.call('reminders.upsert', { id: aki.id, motorId: m.id, category: 'AKI', intervalDays: 365, active: false }));
  assert.equal(updated.intervalDays, 365);
  assert.equal(updated.status, 'NONAKTIF');
  okData(app.call('reminders.delete', { id: aki.id }));
  assert.equal(okData(app.call('reminders.list', { motorId: m.id })).length, 7);

  assert.equal(errCode(app.call('settings.saveCategory', { code: 'jasa', label: 'x' })), 'VALIDATION_ERROR');
  assert.equal(errCode(app.call('settings.saveCategory', { code: 'JASA', label: 'x' })), 'VALIDATION_ERROR');
  const c = okData(app.call('settings.saveCategory', { code: 'SHOCK_DEPAN', label: 'Shock Depan' }));
  assert.equal(c.sortOrder, 180);
  okData(app.call('settings.saveCategory', { code: 'SHOCK_DEPAN', label: 'Shockbreaker Depan', active: false }));
  const cats = okData(app.call('settings.get', {})).categories;
  assert.equal(cats.length, 18);
  assert.equal(cats.find((x) => x.code === 'SHOCK_DEPAN').label, 'Shockbreaker Depan');
  assert.equal(errCode(app.call('records.create', {
    motorId: m.id, date: '2026-11-01', type: 'BELANJA_PART', odometer: 10,
    items: [{ category: 'SHOCK_DEPAN', name: 'Shock', qty: 1, unitPrice: 1 }],
  })), 'VALIDATION_ERROR', 'kategori nonaktif ditolak');
});

test('dev_seedDummy berjalan', () => {
  const app = setupApp();
  app.ctx.dev_seedDummy();
  const motors = okData(app.call('motors.list', {}));
  const list = okData(app.call('records.list', { motorId: motors[0].id }));
  assert.equal(list.total, 1000);
  okData(app.call('dashboard.get', { motorId: motors[0].id }));
});

test('v2: spesifikasi motor, overview garasi, tanpa jadwal default', () => {
  const app = setupApp();
  const bad = app.call('motors.create', { name: 'X', odometerStart: 0, transmission: 'ROKET', tankLiters: -1 });
  assert.equal(errCode(bad), 'VALIDATION_ERROR');
  assert.ok(bad.error.fields.transmission && bad.error.fields.tankLiters);

  const a = okData(app.call('motors.create', {
    name: 'Vario', brand: 'Honda', model: 'Vario 160', year: 2023, plate: 'b 1 a', odometerStart: 10000,
    transmission: 'MATIK', engineCc: 160, tankLiters: 5.5, oilLiters: 0.8, tireFront: '100/80-14', tireRear: '120/70-14', oilType: '10W-30',
  }));
  assert.equal(a.tankLiters, 5.5);
  assert.equal(a.transmission, 'MATIK');
  const b = okData(app.call('motors.create', { name: 'Beat', odometerStart: 500, createDefaultReminders: false }));
  assert.equal(okData(app.call('reminders.list', { motorId: b.id })).length, 0);
  assert.equal(b.tankLiters, null);

  // update mempertahankan field yang dikirim
  const upd = okData(app.call('motors.update', { id: a.id, name: 'Vario', odometerStart: 10000, transmission: 'MATIK', tankLiters: 5.5, oilLiters: 0.9, tireFront: '100/80-14' }));
  assert.equal(upd.oilLiters, 0.9);
  assert.equal(upd.tireRear, '');

  okData(app.call('records.create', {
    motorId: a.id, date: '2026-11-01', type: 'GANTI_OLI', odometer: 12500, serviceFee: 0,
    items: [{ category: 'OLI_MESIN', name: 'AHM SPX2', qty: 1, unitPrice: 60000 }],
  }));
  const ov = okData(app.call('motors.overview', {}));
  assert.equal(ov.totals.count, 2);
  assert.equal(ov.totals.totalKm, 12500 + 500);
  assert.equal(ov.totals.monthSpend, 60000);
  const va = ov.motors.find((m) => m.id === a.id);
  assert.equal(va.stats.lastOilName, 'AHM SPX2');
  assert.equal(va.stats.recordCount, 1);
  assert.equal(va.stats.nextReminder.category, 'OLI_MESIN');
});

test('v2: migrasi otomatis kolom baru pada sheet lama', () => {
  const app = setupApp();
  const sheet = app.spreadsheet().getSheetByName('motors');
  // Simulasi sheet versi 1: buang kolom spesifikasi
  const v1Cols = ['id', 'name', 'brand', 'model', 'year', 'plate', 'odometerStart', 'odometerCurrent', 'odometerUpdatedAt', 'createdAt', 'updatedAt', 'deleted'];
  sheet.data = [v1Cols, ['m1', 'Lama', '', '', '', '', 100, 100, '', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false]];
  const list = okData(app.call('motors.list', {}));
  assert.equal(list[0].name, 'Lama');
  assert.equal(list[0].tankLiters, null);
  assert.ok(sheet.data[0].includes('tankLiters'), 'header baru ditambahkan');
  okData(app.call('motors.update', { id: 'm1', name: 'Lama', odometerStart: 100, tankLiters: 4.2 }));
  assert.equal(okData(app.call('motors.list', {}))[0].tankLiters, 4.2);
});

test('v2: records.list sumTotal, records.export, reports.summary, backup.export, dashboard count', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Vario', odometerStart: 10000 }));
  const mk = (date, type, odo, fee, items) => okData(app.call('records.create', { motorId: m.id, date, type, odometer: odo, serviceFee: fee, place: 'Bengkel ' + date, items }));
  mk('2025-05-01', 'SERVIS', 10500, 100000, []);
  mk('2026-06-07', 'SERVIS', 16000, 45000, [{ category: 'FILTER_UDARA', name: 'Filter', qty: 1, unitPrice: 65000 }, { category: 'BUSI', name: 'Busi', qty: 1, unitPrice: 25000 }]);
  mk('2026-08-26', 'GANTI_OLI', 17200, 0, [{ category: 'OLI_MESIN', name: 'MPX2', qty: 1, unitPrice: 55000 }, { category: 'OLI_GARDAN', name: 'Gear', qty: 1, unitPrice: 17000 }]);
  mk('2026-10-15', 'BELANJA_PART', 18800, 0, [{ category: 'KAMPAS_REM_DEPAN', name: 'Kampas', qty: 1, unitPrice: 48000 }]);

  const list = okData(app.call('records.list', { motorId: m.id, from: '2026-01-01' }));
  assert.equal(list.total, 3);
  assert.equal(list.sumTotal, 135000 + 72000 + 48000);

  const rows = okData(app.call('records.export', { motorId: m.id }));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].items.length, 1);
  assert.equal(rows[1].items.length, 2);

  const s = okData(app.call('reports.summary', { motorId: m.id, year: 2026 }));
  assert.equal(s.total, 255000);
  assert.equal(s.prevTotal, 100000);
  assert.equal(s.changePct, 155);
  assert.equal(s.sessions, 3);
  assert.equal(s.months.length, 12);
  assert.equal(s.months[5].total, 135000);
  assert.equal(s.months[5].dominantType, 'SERVIS');
  assert.equal(s.months[7].dominantType, 'GANTI_OLI');
  assert.equal(s.average, Math.round(255000 / 11), 'tahun berjalan: dibagi 11 bulan (Jan–Nov)');
  assert.equal(s.biggest.grandTotal, 135000);
  const g = Object.fromEntries(s.groups.map((x) => [x.key, x]));
  assert.equal(g.JASA.total, 45000);
  assert.equal(g.FLUID.total, 72000);
  assert.equal(g.PART.total, 65000 + 25000 + 48000);
  assert.equal(g.PART.count, 2);
  assert.equal(s.costPerKm.total, 355000);
  assert.equal(s.costPerKm.km, 8800);
  assert.equal(s.costPerKm.value, 40.34);
  assert.equal(s.recent.length, 3);
  assert.deepEqual(s.years, [2026, 2025]);

  const dash = okData(app.call('dashboard.get', { motorId: m.id }));
  assert.equal(dash.spend.countYear, 3);
  assert.equal(dash.spend.countMonth, 0);

  const bk = okData(app.call('backup.export', {}));
  assert.equal(bk.app, 'motocare');
  assert.equal(bk.records.length, 4);
  assert.equal(bk.recordItems.length, 5);
  assert.equal(bk.motors.length, 1);
});
