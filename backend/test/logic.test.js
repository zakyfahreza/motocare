const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic.js');

const TODAY = '2026-11-03';

test('tanggal: valid, daysBetween, addDays lintas bulan & kabisat', () => {
  assert.equal(L.isValidISODate('2026-11-03'), true);
  assert.equal(L.isValidISODate('2026-02-30'), false);
  assert.equal(L.isValidISODate('03-11-2026'), false);
  assert.equal(L.daysBetween('2026-11-01', '2026-11-03'), 2);
  assert.equal(L.daysBetween('2026-11-03', '2026-11-01'), -2);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(L.addDays('2026-11-03', 60), '2027-01-02');
});

test('calcItemSubtotal & calcRecordTotals', () => {
  assert.equal(L.calcItemSubtotal(2, 45000), 90000);
  assert.equal(L.calcItemSubtotal(0.8, 55000), 44000);
  assert.equal(L.calcItemSubtotal('3', '1000'), 3000);
  assert.deepEqual(
    L.calcRecordTotals([{ qty: 1, unitPrice: 55000 }, { qty: 2, unitPrice: 15000 }], 20000),
    { itemsTotal: 85000, grandTotal: 105000 },
  );
  assert.deepEqual(L.calcRecordTotals([], 35000), { itemsTotal: 0, grandTotal: 35000 });
});

const records = [
  { id: 'r1', date: '2026-08-01', odometer: 10000, deleted: false, createdAt: 'a' },
  { id: 'r2', date: '2026-10-01', odometer: 12000, deleted: false, createdAt: 'b' },
  { id: 'r3', date: '2026-10-20', odometer: 12500, deleted: true, createdAt: 'c' },
];
const items = [
  { recordId: 'r1', category: 'OLI_MESIN', deleted: false },
  { recordId: 'r2', category: 'OLI_MESIN', deleted: false },
  { recordId: 'r3', category: 'OLI_MESIN', deleted: false }, // record terhapus
  { recordId: 'r2', category: 'BUSI', deleted: true }, // item terhapus
];

test('findLastDone mengabaikan record & item yang dihapus', () => {
  assert.deepEqual(L.findLastDone(records, items, 'OLI_MESIN'), { date: '2026-10-01', odometer: 12000, recordId: 'r2' });
  assert.equal(L.findLastDone(records, items, 'BUSI'), null);
  assert.equal(L.findLastDone(records, items, 'AKI'), null);
});

test('findLastDone: tanggal sama → odometer terbesar', () => {
  const rs = [
    { id: 'a', date: '2026-10-01', odometer: 100 },
    { id: 'b', date: '2026-10-01', odometer: 200 },
  ];
  const its = [{ recordId: 'a', category: 'X' }, { recordId: 'b', category: 'X' }];
  assert.equal(L.findLastDone(rs, its, 'X').recordId, 'b');
});

const rule = { intervalKm: 2000, intervalDays: 60 };
const last = { date: '2026-10-01', odometer: 12000, recordId: 'r2' };
// nextKm = 14000, nextDate = 2026-11-30 (27 hari dari TODAY)

test('status: BELUM_ADA_DATA tanpa catatan', () => {
  assert.equal(L.computeReminderStatus(rule, null, 13000, TODAY).status, 'BELUM_ADA_DATA');
});

test('status: OK dengan sisa km & hari benar', () => {
  const s = L.computeReminderStatus(rule, last, 13000, TODAY);
  assert.equal(s.status, 'OK');
  assert.equal(s.nextKm, 14000);
  assert.equal(s.remainingKm, 1000);
  assert.equal(s.nextDate, '2026-11-30');
  assert.equal(s.remainingDays, 27);
});

test('status: SEGERA karena km (tepat 10% interval)', () => {
  assert.equal(L.computeReminderStatus(rule, last, 13800, TODAY).status, 'SEGERA');
  assert.equal(L.computeReminderStatus(rule, last, 13799, TODAY).status, 'OK');
});

test('status: SEGERA karena hari (sisa 7 hari)', () => {
  assert.equal(L.computeReminderStatus(rule, last, 12100, '2026-11-23').status, 'SEGERA');
  assert.equal(L.computeReminderStatus(rule, last, 12100, '2026-11-22').status, 'OK');
});

test('status: TERLAMBAT tepat di batas km', () => {
  const s = L.computeReminderStatus(rule, last, 14000, TODAY);
  assert.equal(s.status, 'TERLAMBAT');
  assert.equal(s.remainingKm, 0);
});

test('status: TERLAMBAT tepat di batas hari', () => {
  const s = L.computeReminderStatus(rule, last, 12100, '2026-11-30');
  assert.equal(s.status, 'TERLAMBAT');
  assert.equal(s.remainingDays, 0);
});

test('status: hanya interval km', () => {
  const s = L.computeReminderStatus({ intervalKm: 24000, intervalDays: null }, last, 20000, '2030-01-01');
  assert.equal(s.status, 'OK');
  assert.equal(s.nextDate, null);
  assert.equal(s.remainingDays, null);
});

test('status: hanya interval hari', () => {
  const s = L.computeReminderStatus({ intervalKm: null, intervalDays: 365 }, last, 99999, TODAY);
  assert.equal(s.status, 'OK');
  assert.equal(s.nextKm, null);
  assert.equal(s.remainingKm, null);
  assert.equal(s.remainingDays, 332);
});

test('sortReminders: TERLAMBAT, SEGERA, OK, BELUM_ADA_DATA, NONAKTIF', () => {
  const sorted = L.sortReminders([
    { category: 'A', status: 'OK', remainingKm: 500 },
    { category: 'B', status: 'NONAKTIF', remainingKm: null },
    { category: 'C', status: 'BELUM_ADA_DATA', remainingKm: null },
    { category: 'D', status: 'TERLAMBAT', remainingKm: -10 },
    { category: 'E', status: 'SEGERA', remainingKm: 100 },
    { category: 'F', status: 'OK', remainingKm: 200 },
  ]);
  assert.deepEqual(sorted.map((r) => r.category), ['D', 'E', 'F', 'A', 'C', 'B']);
});

test('aggregateMonthly: jumlah entri tepat, bulan kosong = 0, lintas tahun', () => {
  const rs = [
    { date: '2026-11-01', grandTotal: 100000 },
    { date: '2026-11-02', grandTotal: 50000 },
    { date: '2026-01-15', grandTotal: 70000 },
    { date: '2025-12-31', grandTotal: 999 }, // di luar 12 bulan terakhir
    { date: '2026-10-10', grandTotal: 40000, deleted: true },
  ];
  const res = L.aggregateMonthly(rs, 12, TODAY);
  assert.equal(res.length, 12);
  assert.equal(res[0].month, '2025-12');
  assert.equal(res[11].month, '2026-11');
  assert.equal(res[11].total, 150000);
  assert.equal(res[10].total, 0);
  assert.equal(res[1].total, 70000);
  assert.equal(res[0].total, 999);
  assert.equal(L.aggregateMonthly(rs, 3, '2026-02-10')[0].month, '2025-12');
});

test('aggregateByCategory: jasa masuk JASA, filter tahun & deleted', () => {
  const rs = [
    { id: 'a', date: '2026-03-01', serviceFee: 20000 },
    { id: 'b', date: '2026-05-01', serviceFee: 0 },
    { id: 'c', date: '2025-05-01', serviceFee: 50000 },
    { id: 'd', date: '2026-06-01', serviceFee: 10000, deleted: true },
  ];
  const its = [
    { recordId: 'a', category: 'OLI_MESIN', qty: 1, unitPrice: 55000 },
    { recordId: 'b', category: 'OLI_MESIN', qty: 1, unitPrice: 50000 },
    { recordId: 'b', category: 'BUSI', qty: 1, unitPrice: 25000, deleted: true },
    { recordId: 'c', category: 'AKI', qty: 1, unitPrice: 300000 },
    { recordId: 'd', category: 'AKI', qty: 1, unitPrice: 300000 },
  ];
  assert.deepEqual(L.aggregateByCategory(rs, its, 2026), [
    { category: 'OLI_MESIN', total: 105000 },
    { category: 'JASA', total: 20000 },
  ]);
});

test('sumByDatePrefix', () => {
  const rs = [
    { date: '2026-11-01', grandTotal: 10 },
    { date: '2026-10-01', grandTotal: 5 },
    { date: '2026-11-02', grandTotal: 7, deleted: true },
  ];
  assert.equal(L.sumByDatePrefix(rs, '2026-11'), 10);
  assert.equal(L.sumByDatePrefix(rs, '2026'), 15);
});

test('fuelEconomy: full-to-full, isi sebagian dijumlahkan, sebelum isi penuh pertama diabaikan', () => {
  const fills = [
    { id: 'a', odometer: 100, liters: 3, fullTank: false },
    { id: 'b', odometer: 200, liters: 4, fullTank: true },
    { id: 'c', odometer: 300, liters: 1.5, fullTank: false },
    { id: 'd', odometer: 400, liters: 3.5, fullTank: true },
    { id: 'e', odometer: 450, liters: 2, fullTank: true },
  ];
  const eco = L.fuelEconomy(fills.slice().reverse());
  assert.deepEqual(Object.keys(eco).sort(), ['d', 'e']);
  assert.deepEqual(eco.d, { distance: 200, liters: 5, kmPerL: 40 });
  assert.deepEqual(eco.e, { distance: 50, liters: 2, kmPerL: 25 });
  assert.equal(L.averageEconomy(eco), Math.round((250 / 7) * 10) / 10);
  assert.equal(L.averageEconomy(eco, { d: true }), 40);
  assert.equal(L.averageEconomy({}), null);
});
