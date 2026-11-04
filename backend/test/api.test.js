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
  assert.deepEqual(names, ['categories', 'meta', 'motor_photos', 'motors', 'record_items', 'records', 'reminders']);
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

  // Status pengingat oli: last 12000, next 14000, current 13000 â†’ OK sisa 1000
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
  assert.equal(s.average, Math.round(255000 / 11), 'tahun berjalan: dibagi 11 bulan (Janâ€“Nov)');
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


const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('v4: foto motor di Google Drive — simpan, ambil, ganti (lama dibuang), hapus, validasi', () => {
  const app = setupApp();
  const a = okData(app.call('motors.create', { name: 'Vario Harian', odometerStart: 0 }));

  assert.equal(errCode(app.call('motors.setPhoto', { id: a.id })), 'VALIDATION_ERROR');
  assert.equal(errCode(app.call('motors.setPhoto', { id: a.id, dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' })), 'VALIDATION_ERROR');
  assert.equal(errCode(app.call('motors.setPhoto', { id: a.id, dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(app.ctx.PHOTO_UPLOAD_MAX_CHARS) })), 'VALIDATION_ERROR');

  const s1 = okData(app.call('motors.setPhoto', { id: a.id, dataUrl: JPG }));
  const f1 = app.drive.items.get(s1.photoFileId);
  assert.ok(f1 && f1.kind === 'file' && !f1.trashed);
  assert.match(f1.name, /^motor-vario-harian-\d{8}-\d{6}\.jpg$/);
  const sub = app.drive.items.get(f1.parent);
  assert.equal(sub.name, 'Foto Motor');
  assert.equal(app.drive.items.get(sub.parent).name, 'MotoCare Foto');
  assert.equal(okData(app.call('photos.get', { ids: [s1.photoFileId] }))[s1.photoFileId], JPG);

  const s2 = okData(app.call('motors.setPhoto', { id: a.id, dataUrl: PNG }));
  assert.notEqual(s2.photoFileId, s1.photoFileId);
  assert.equal(f1.trashed, true, 'foto lama dibuang ke sampah');
  assert.equal(okData(app.call('motors.list', {}))[0].photoFileId, s2.photoFileId);

  // Tidak boleh membaca file Drive yang tidak tercatat di aplikasi
  const foreign = app.drive.api.createFolder('Lain').createFile(new (class { getName() { return 'x'; } getBytes() { return [1]; } getContentType() { return 'image/png'; } })());
  assert.deepEqual(okData(app.call('photos.get', { ids: [foreign.getId(), s1.photoFileId] })), {});
  assert.equal(errCode(app.call('photos.get', { ids: Array.from({ length: 11 }, (_, i) => 'x' + i) })), 'VALIDATION_ERROR');

  okData(app.call('motors.removePhoto', { id: a.id }));
  assert.equal(app.drive.items.get(s2.photoFileId).trashed, true);
  assert.equal(okData(app.call('motors.list', {}))[0].photoFileId, '');
  assert.ok(okData(app.call('settings.get', {})).photoFolderUrl.startsWith('https://drive.google.com/drive/folders/'));
});

test('v4: migrasi foto lama (sheet motor_photos) ke Drive lewat setup()', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Lama', odometerStart: 0 }));
  // Simulasikan data v0.3
  const db = app.ctx.Db;
  db.reset();
  db.upsert('motor_photos', m.id, { mime: 'image/jpeg', chars: JPG.length, part1: JPG.slice(0, 10), part2: JPG.slice(10), deleted: false });
  db.update('motors', m.id, { photoUpdatedAt: '2026-11-01T00:00:00Z' });
  app.ctx.setup();
  const mm = okData(app.call('motors.list', {}))[0];
  assert.ok(mm.photoFileId);
  assert.equal(okData(app.call('photos.get', { ids: [mm.photoFileId] }))[mm.photoFileId], JPG);
  app.ctx.setup();
  assert.equal(okData(app.call('motors.list', {}))[0].photoFileId, mm.photoFileId, 'idempoten');
});

test('v4: foto nota catatan — buat, pertahankan, ganti, batas 2, milik catatan lain ditolak', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Vario', odometerStart: 0 }));
  const base = { motorId: m.id, date: '2026-11-01', type: 'SERVIS', odometer: 100, serviceFee: 10000 };
  assert.equal(errCode(app.call('records.create', { ...base, photos: [{ dataUrl: JPG }, { dataUrl: JPG }, { dataUrl: JPG }] })), 'VALIDATION_ERROR');
  assert.equal(errCode(app.call('records.create', { ...base, photos: [{ dataUrl: 'data:image/gif;base64,R0lG' }] })), 'VALIDATION_ERROR');
  const filesBefore = app.drive.items.size;
  assert.equal(errCode(app.call('records.create', { ...base, date: '', photos: [{ dataUrl: JPG }] })), 'VALIDATION_ERROR');
  assert.equal(app.drive.items.size, filesBefore, 'tidak ada file dibuat jika validasi gagal');

  const r = okData(app.call('records.create', { ...base, photos: [{ dataUrl: JPG }, { dataUrl: PNG }] }));
  const ids = r.photoIds.split(',');
  assert.equal(ids.length, 2);
  assert.equal(app.drive.items.get(app.drive.items.get(ids[0]).parent).name, 'Nota & Part');
  const got = okData(app.call('photos.get', { ids }));
  assert.equal(got[ids[0]], JPG);
  assert.equal(got[ids[1]], PNG);

  // Update tanpa field photos → foto tetap
  okData(app.call('records.update', { ...base, id: r.id, serviceFee: 20000 }));
  assert.equal(okData(app.call('records.get', { id: r.id })).photoIds, r.photoIds);
  // Pertahankan foto 1, buang foto 2, tambah foto baru
  const u = okData(app.call('records.update', { ...base, id: r.id, photos: [{ id: ids[0] }, { dataUrl: JPG }] }));
  const ids2 = u.photoIds.split(',');
  assert.equal(ids2[0], ids[0]);
  assert.notEqual(ids2[1], ids[1]);
  assert.equal(app.drive.items.get(ids[1]).trashed, true);

  // Tidak bisa menempelkan foto milik catatan lain
  const r2 = okData(app.call('records.create', { ...base, date: '2026-11-02' }));
  assert.equal(errCode(app.call('records.update', { ...base, id: r2.id, date: '2026-11-02', photos: [{ id: ids[0] }] })), 'VALIDATION_ERROR');
});

test('v4: catatan Bensin — item BBM dari liter × harga, konsumsi km/L full-to-full', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Aerox', odometerStart: 18000 }));
  const fuel = (date, odo, liters, price, fullTank, extra = {}) => app.call('records.create', {
    motorId: m.id, date, type: 'BENSIN', odometer: odo, place: 'Pertamina MT Haryono',
    fuel: { fuelType: 'Pertamax', liters, pricePerLiter: price, fullTank, station: 'Pertamina' }, ...extra,
  });
  const bad = fuel('2026-11-01', 18100, 0, -1, 'ya');
  assert.equal(errCode(bad), 'VALIDATION_ERROR');
  assert.ok(bad.error.fields['fuel.liters'] && bad.error.fields['fuel.pricePerLiter'] && bad.error.fields['fuel.fullTank']);
  assert.equal(errCode(app.call('records.create', { motorId: m.id, date: '2026-11-01', type: 'BENSIN', odometer: 1 })), 'VALIDATION_ERROR');

  const a = okData(fuel('2026-10-20', 18200, 4, 12950, true));
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].category, 'BBM');
  assert.equal(a.grandTotal, 51800);
  assert.equal(a.serviceFee, 0);
  assert.equal(a.economy, null, 'isi penuh pertama belum punya pembanding');
  // Abaikan items & serviceFee dari klien
  const b = okData(fuel('2026-10-25', 18300, 1.5, 12950, false, { items: [{ category: 'AKI', name: 'x', qty: 1, unitPrice: 999999 }], serviceFee: 50000 }));
  assert.equal(b.grandTotal, Math.round(1.5 * 12950));
  const c = okData(fuel('2026-11-01', 18400, 3.5, 12950, true));
  assert.deepEqual(c.economy, { distance: 200, liters: 5, kmPerL: 40 });
  assert.equal(JSON.parse(c.details).fuel.fullTank, true);

  const hist = okData(app.call('records.fuelHistory', { motorId: m.id }));
  assert.deepEqual(hist.map((f) => f.odometer), [18200, 18300, 18400]);
  assert.equal(okData(app.call('records.list', { motorId: m.id, category: 'BBM' })).total, 3);

  const s = okData(app.call('reports.summary', { motorId: m.id, year: 2026 }));
  assert.equal(s.fuel.fills, 3);
  assert.equal(s.fuel.liters, 9);
  assert.equal(s.fuel.avgKmPerL, 40);
  assert.equal(s.groups.find((g) => g.key === 'FUEL').total, 51800 + Math.round(1.5 * 12950) + Math.round(3.5 * 12950));
  assert.equal(s.months[10].byType.BENSIN > 0, true);
  const cats = okData(app.call('reports.byCategory', { motorId: m.id, year: 2026 }));
  assert.equal(cats.find((x) => x.category === 'BBM').label, 'Bahan Bakar (BBM)');
});

test('v4: catatan Ban — ganti sepasang membuat 2 item, jasa = pasang + tambahan, reminder ban terpicu', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Aerox', odometerStart: 10000 }));
  okData(app.call('reminders.upsert', { motorId: m.id, category: 'BAN_BELAKANG', intervalKm: 15000 }));
  const tire = (t, extra = {}) => app.call('records.create', { motorId: m.id, date: '2026-11-01', type: 'BAN', odometer: 19050, place: 'Planet Ban', tire: t, ...extra });

  const bad = tire({ action: 'GANTI', position: 'ATAS' });
  assert.equal(errCode(bad), 'VALIDATION_ERROR');
  assert.ok(bad.error.fields['tire.position'] && bad.error.fields['tire.brand']);

  const pair = okData(tire({ action: 'GANTI', position: 'SEPASANG', brand: 'Michelin Pilot Street 2', size: '140/70-14', dot: '2424', construction: 'TL', psiFront: 29, psiRear: 33, gas: 'N2', tirePrice: 355000, installFee: 20000, extraFee: 10000 }));
  assert.deepEqual(pair.items.map((i) => i.category).sort(), ['BAN_BELAKANG', 'BAN_DEPAN']);
  assert.equal(pair.items[0].name, 'Michelin Pilot Street 2 140/70-14');
  assert.equal(pair.serviceFee, 30000);
  assert.equal(pair.grandTotal, 355000 * 2 + 30000);
  assert.equal(JSON.parse(pair.details).tire.psiRear, 33);
  const rem = okData(app.call('reminders.list', { motorId: m.id })).find((r) => r.category === 'BAN_BELAKANG');
  assert.equal(rem.status, 'OK');
  assert.equal(rem.lastOdometer, 19050);

  const patch = okData(tire({ action: 'TAMBAL', position: 'BELAKANG', tirePrice: 999999, installFee: 25000 }));
  assert.equal(patch.items.length, 0, 'tambal tidak membuat item ban');
  assert.equal(patch.grandTotal, 25000);
  const s = okData(app.call('reports.summary', { motorId: m.id, year: 2026 }));
  assert.equal(s.groups.find((g) => g.key === 'TIRE').total, 710000);
  assert.equal(s.groups.find((g) => g.key === 'JASA').total, 55000);
});

test('v4: servis dengan jenis (tags) & batch', () => {
  const app = setupApp();
  const m = okData(app.call('motors.create', { name: 'Vario', odometerStart: 0 }));
  assert.equal(errCode(app.call('records.create', { motorId: m.id, date: '2026-11-01', type: 'SERVIS', odometer: 1, tags: ['NGAWUR'] })), 'VALIDATION_ERROR');
  const r = okData(app.call('records.create', { motorId: m.id, date: '2026-11-01', type: 'SERVIS', odometer: 1, serviceFee: 15000, tags: ['SERVIS_RUTIN', 'SERVIS_CVT', 'SERVIS_RUTIN'] }));
  assert.equal(r.tags, 'SERVIS_RUTIN,SERVIS_CVT');

  const res = okData(app.call('batch', { calls: [
    { action: 'motors.list' },
    { action: 'settings.get' },
    { action: 'records.list', payload: { motorId: m.id } },
    { action: 'motors.delete', payload: { id: m.id } },
    { action: 'tidak.ada' },
    { action: 'records.get', payload: { id: 'x' } },
  ] }));
  assert.equal(res.length, 6);
  assert.equal(res[0].ok, true);
  assert.equal(res[0].data.length, 1);
  assert.equal(res[2].data.total, 1);
  assert.equal(res[3].ok, false, 'action tulis ditolak di batch');
  assert.equal(okData(app.call('motors.list', {})).length, 1, 'motor tidak terhapus');
  assert.equal(res[4].error.code, 'UNKNOWN_ACTION');
  assert.equal(res[5].error.code, 'NOT_FOUND');
  assert.equal(errCode(app.call('batch', { calls: [] })), 'BAD_REQUEST');
  assert.equal(okData(app.call('batch', { calls: [{ action: 'batch', payload: { calls: [] } }] }))[0].error.code, 'UNKNOWN_ACTION', 'batch bersarang ditolak');
  assert.equal(errCode(app.call('batch', { calls: Array.from({ length: 13 }, () => ({ action: 'motors.list' })) })), 'BAD_REQUEST');
});
