/** Helper kecil yang butuh layanan Apps Script (tanggal sekarang, UUID). */

function nowISO_() {
  return new Date().toISOString();
}

/** Tanggal hari ini di zona Asia/Jakarta, format YYYY-MM-DD. */
function todayISO_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function newId_() {
  return Utilities.getUuid();
}
