/**
 * Fungsi MURNI (tanpa akses Sheet / layanan Apps Script).
 * Bisa diuji di Node: lihat backend/test/logic.test.js.
 * Semua tanggal berformat 'YYYY-MM-DD'.
 */
var Logic = (function () {
  var DAY_MS = 86400000;

  function parseISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return NaN;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var ms = Date.UTC(y, mo - 1, d);
    var check = new Date(ms);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return NaN;
    return ms;
  }

  function isValidISODate(iso) {
    return !isNaN(parseISODate(iso));
  }

  function formatISODate(ms) {
    var d = new Date(ms);
    var mm = String(d.getUTCMonth() + 1);
    var dd = String(d.getUTCDate());
    return d.getUTCFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
  }

  /** Jumlah hari dari a ke b (b - a). */
  function daysBetween(aISO, bISO) {
    return Math.round((parseISODate(bISO) - parseISODate(aISO)) / DAY_MS);
  }

  function addDays(iso, n) {
    return formatISODate(parseISODate(iso) + n * DAY_MS);
  }

  function calcItemSubtotal(qty, unitPrice) {
    return Math.round((Number(qty) || 0) * (Number(unitPrice) || 0));
  }

  function calcRecordTotals(items, serviceFee) {
    var itemsTotal = (items || []).reduce(function (sum, it) {
      return sum + calcItemSubtotal(it.qty, it.unitPrice);
    }, 0);
    var fee = Math.round(Number(serviceFee) || 0);
    return { itemsTotal: itemsTotal, grandTotal: itemsTotal + fee };
  }

  /** Urutan riwayat: tanggal terbaru, lalu odometer terbesar, lalu dibuat paling akhir. */
  function compareRecordsDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.odometer !== b.odometer) return b.odometer - a.odometer;
    var ca = a.createdAt || '';
    var cb = b.createdAt || '';
    if (ca === cb) return 0;
    return ca < cb ? 1 : -1;
  }

  /**
   * Catatan terakhir (aktif) yang memuat item dengan kategori tertentu.
   * @return {{date:string, odometer:number, recordId:string}|null}
   */
  function findLastDone(records, items, category) {
    var activeRecords = {};
    (records || []).forEach(function (r) {
      if (!r.deleted) activeRecords[r.id] = r;
    });
    var best = null;
    (items || []).forEach(function (it) {
      if (it.deleted || it.category !== category) return;
      var rec = activeRecords[it.recordId];
      if (!rec) return;
      if (!best || compareRecordsDesc(rec, best) < 0) best = rec;
    });
    return best ? { date: best.date, odometer: best.odometer, recordId: best.id } : null;
  }

  /**
   * Status pengingat untuk satu aturan.
   * TERLAMBAT jika sisa km <= 0 atau sisa hari <= 0.
   * SEGERA jika sisa km <= ceil(10% interval km) atau sisa hari <= 7.
   */
  function computeReminderStatus(rule, lastDone, currentOdometer, todayISO) {
    var result = {
      status: 'BELUM_ADA_DATA',
      lastDate: null,
      lastOdometer: null,
      lastRecordId: null,
      nextKm: null,
      nextDate: null,
      remainingKm: null,
      remainingDays: null,
    };
    if (!lastDone) return result;

    var intervalKm = rule.intervalKm || null;
    var intervalDays = rule.intervalDays || null;
    result.lastDate = lastDone.date;
    result.lastOdometer = lastDone.odometer;
    result.lastRecordId = lastDone.recordId || null;

    if (intervalKm) {
      result.nextKm = lastDone.odometer + intervalKm;
      result.remainingKm = result.nextKm - (Number(currentOdometer) || 0);
    }
    if (intervalDays) {
      result.nextDate = addDays(lastDone.date, intervalDays);
      result.remainingDays = daysBetween(todayISO, result.nextDate);
    }

    var kmOver = result.remainingKm !== null && result.remainingKm <= 0;
    var daysOver = result.remainingDays !== null && result.remainingDays <= 0;
    var kmSoon = result.remainingKm !== null && result.remainingKm <= Math.ceil(0.1 * intervalKm);
    var daysSoon = result.remainingDays !== null && result.remainingDays <= 7;

    if (kmOver || daysOver) result.status = 'TERLAMBAT';
    else if (kmSoon || daysSoon) result.status = 'SEGERA';
    else result.status = 'OK';
    return result;
  }

  var STATUS_RANK = { TERLAMBAT: 0, SEGERA: 1, OK: 2, BELUM_ADA_DATA: 3, NONAKTIF: 4 };

  /** Urutkan: TERLAMBAT, SEGERA, OK, BELUM_ADA_DATA, NONAKTIF; lalu sisa km terkecil. */
  function sortReminders(list) {
    return list.slice().sort(function (a, b) {
      var ra = STATUS_RANK[a.status] !== undefined ? STATUS_RANK[a.status] : 9;
      var rb = STATUS_RANK[b.status] !== undefined ? STATUS_RANK[b.status] : 9;
      if (ra !== rb) return ra - rb;
      var ka = a.remainingKm === null || a.remainingKm === undefined ? Infinity : a.remainingKm;
      var kb = b.remainingKm === null || b.remainingKm === undefined ? Infinity : b.remainingKm;
      if (ka !== kb) return ka - kb;
      return String(a.category).localeCompare(String(b.category));
    });
  }

  /** Total grandTotal per bulan untuk `months` bulan terakhir (termasuk bulan ini). Bulan kosong = 0. */
  function aggregateMonthly(records, months, todayISO) {
    var y = Number(todayISO.substring(0, 4));
    var m = Number(todayISO.substring(5, 7));
    var keys = [];
    for (var i = months - 1; i >= 0; i--) {
      var mm = m - i;
      var yy = y;
      while (mm <= 0) { mm += 12; yy -= 1; }
      keys.push(yy + '-' + (mm < 10 ? '0' + mm : String(mm)));
    }
    var totals = {};
    keys.forEach(function (k) { totals[k] = 0; });
    (records || []).forEach(function (r) {
      if (r.deleted) return;
      var key = String(r.date).substring(0, 7);
      if (totals.hasOwnProperty(key)) totals[key] += Number(r.grandTotal) || 0;
    });
    return keys.map(function (k) { return { month: k, total: totals[k] }; });
  }

  /**
   * Total per kategori dalam satu tahun. Biaya jasa masuk kategori 'JASA'.
   * Urut dari total terbesar; kategori bernilai 0 tidak ditampilkan.
   */
  function aggregateByCategory(records, items, year) {
    var prefix = String(year) + '-';
    var activeRecords = {};
    var totals = {};
    (records || []).forEach(function (r) {
      if (r.deleted || String(r.date).indexOf(prefix) !== 0) return;
      activeRecords[r.id] = true;
      var fee = Number(r.serviceFee) || 0;
      if (fee) totals.JASA = (totals.JASA || 0) + fee;
    });
    (items || []).forEach(function (it) {
      if (it.deleted || !activeRecords[it.recordId]) return;
      var sub = calcItemSubtotal(it.qty, it.unitPrice);
      if (sub) totals[it.category] = (totals[it.category] || 0) + sub;
    });
    return Object.keys(totals)
      .map(function (k) { return { category: k, total: totals[k] }; })
      .sort(function (a, b) { return b.total - a.total || a.category.localeCompare(b.category); });
  }

  /** Total grandTotal catatan aktif yang tanggalnya diawali prefix (misal '2026-11' atau '2026'). */
  function sumByDatePrefix(records, prefix) {
    return (records || []).reduce(function (sum, r) {
      if (r.deleted || String(r.date).indexOf(prefix) !== 0) return sum;
      return sum + (Number(r.grandTotal) || 0);
    }, 0);
  }

  return {
    parseISODate: parseISODate,
    isValidISODate: isValidISODate,
    daysBetween: daysBetween,
    addDays: addDays,
    calcItemSubtotal: calcItemSubtotal,
    calcRecordTotals: calcRecordTotals,
    compareRecordsDesc: compareRecordsDesc,
    findLastDone: findLastDone,
    computeReminderStatus: computeReminderStatus,
    sortReminders: sortReminders,
    aggregateMonthly: aggregateMonthly,
    aggregateByCategory: aggregateByCategory,
    sumByDatePrefix: sumByDatePrefix,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logic;
}
