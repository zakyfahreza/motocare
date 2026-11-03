# PRD — MotoCare: Catatan Servis & Belanja Part Motor

> **Untuk AI agent:** Dokumen ini adalah sumber kebenaran untuk *apa* yang dibangun dan *kenapa*.
> Baca bersama `design.md` (bagaimana membangunnya) dan `task.md` (urutan pengerjaan).
> Jika ada konflik: `prd.md` menang untuk scope, `design.md` menang untuk detail teknis.
> Jangan menambah fitur di luar bagian "Scope MVP" tanpa konfirmasi pemilik proyek.

---

## 1. Ringkasan

MotoCare adalah web app pribadi untuk mencatat riwayat servis motor, belanja part, dan penggantian oli.
Data disimpan di Google Spreadsheet milik pengguna, backend memakai Google Apps Script (sebagai JSON API),
dan frontend statis di-hosting di GitHub Pages. Kode disimpan di satu repository GitHub.

## 2. Latar Belakang & Masalah

- Catatan servis tersebar di nota kertas, chat, dan ingatan. Mudah hilang.
- Sulit tahu kapan terakhir ganti oli atau part tertentu, dan di kilometer berapa.
- Tidak ada gambaran total biaya perawatan per bulan/tahun.
- Butuh solusi gratis, tanpa server berbayar, dan data tetap bisa dibuka langsung di spreadsheet.

## 3. Tujuan

| ID | Tujuan | Ukuran keberhasilan |
|----|--------|---------------------|
| G1 | Mencatat servis/belanja part dengan cepat dari HP | Input 1 catatan (3 item) selesai < 60 detik |
| G2 | Tahu kapan perawatan berikutnya jatuh tempo | Dashboard menampilkan status tiap jenis perawatan (OK / Segera / Terlambat) |
| G3 | Melihat total pengeluaran | Ringkasan per bulan dan per tahun, per motor |
| G4 | Biaya nol | Hanya memakai Google Sheets, Apps Script, GitHub Pages (semua gratis) |
| G5 | Data tetap milik pengguna | Semua data bisa dibaca/diedit langsung di Google Spreadsheet |

## 4. Non-Tujuan (di luar scope)

- Multi-user / akun publik / pendaftaran pengguna.
- Aplikasi native Android/iOS.
- Integrasi bengkel, marketplace, atau pembayaran.
- Notifikasi push / email otomatis (boleh jadi fase berikutnya).
- Upload foto nota (fase berikutnya, lihat bagian 9).

## 5. Pengguna

**Persona utama:** Pemilik motor (1 orang, mungkin punya 1–3 motor). Mengakses terutama dari HP
di bengkel atau setelah servis. Paham dasar Google Sheets, bukan developer.

## 6. User Stories

### Motor
- **US-01** Sebagai pengguna, saya bisa menambah motor (nama, merk, model, tahun, plat nomor, odometer awal).
- **US-02** Saya bisa mengubah dan menghapus (soft delete) data motor.
- **US-03** Saya bisa memilih motor aktif; semua halaman menampilkan data motor tersebut.
- **US-04** Saya bisa memperbarui odometer terkini tanpa membuat catatan servis.

### Catatan Servis / Belanja / Ganti Oli
- **US-05** Saya bisa membuat catatan dengan tipe: `SERVIS`, `GANTI_OLI`, atau `BELANJA_PART`.
- **US-06** Satu catatan berisi: tanggal, odometer (km), tempat (bengkel/toko), biaya jasa, catatan teks,
  dan daftar item (part/oli).
- **US-07** Setiap item berisi: kategori, nama item, merk, qty, harga satuan. Subtotal dan total dihitung otomatis.
- **US-08** Saya bisa melihat daftar riwayat catatan, terbaru di atas, dengan filter tipe, kategori, dan rentang tanggal.
- **US-09** Saya bisa melihat detail, mengubah, dan menghapus catatan.
- **US-10** Odometer pada catatan baru tidak boleh lebih kecil dari odometer catatan sebelumnya (berdasarkan tanggal)
  kecuali pengguna mengonfirmasi peringatan.

### Pengingat Perawatan
- **US-11** Saya bisa mengatur jadwal perawatan per kategori: interval km dan/atau interval hari
  (contoh: Oli mesin tiap 2.000 km atau 60 hari).
- **US-12** Sistem menghitung jatuh tempo berikutnya dari catatan terakhir yang memuat kategori itu.
- **US-13** Dashboard menampilkan status: `OK`, `SEGERA` (sisa ≤ 10% interval atau ≤ 7 hari), `TERLAMBAT`.
- **US-14** Motor baru otomatis mendapat jadwal default (lihat bagian 7.3), bisa diubah.

### Dashboard & Laporan
- **US-15** Dashboard menampilkan: odometer terkini, catatan terakhir, status pengingat, total biaya bulan ini dan tahun ini.
- **US-16** Halaman laporan menampilkan total biaya per bulan (12 bulan terakhir) dan per kategori.

### Akses
- **US-17** Aplikasi meminta kode akses (API token) sekali, disimpan di perangkat. Tanpa token yang benar, API menolak semua permintaan.
- **US-18** Saya bisa keluar (hapus token dari perangkat) dari halaman Pengaturan.

## 7. Kebutuhan Fungsional Detail

### 7.1 Tipe catatan
| Tipe | Kegunaan | Item wajib? |
|------|----------|-------------|
| `SERVIS` | Servis berkala / perbaikan di bengkel | Tidak (boleh hanya biaya jasa) |
| `GANTI_OLI` | Ganti oli mesin/gardan | Ya, minimal 1 item kategori oli |
| `BELANJA_PART` | Beli part (dipasang sendiri atau disimpan) | Ya, minimal 1 item |

### 7.2 Kategori item (default, bisa ditambah di Pengaturan)
`OLI_MESIN`, `OLI_GARDAN`, `FILTER_OLI`, `FILTER_UDARA`, `BUSI`, `KAMPAS_REM_DEPAN`, `KAMPAS_REM_BELAKANG`,
`MINYAK_REM`, `AIR_RADIATOR`, `V_BELT`, `ROLLER`, `RANTAI_GIR`, `BAN_DEPAN`, `BAN_BELAKANG`, `AKI`, `LAMPU`, `LAINNYA`.

### 7.3 Jadwal perawatan default
| Kategori | Interval km | Interval hari |
|----------|-------------|---------------|
| OLI_MESIN | 2.000 | 60 |
| OLI_GARDAN | 8.000 | 240 |
| FILTER_UDARA | 12.000 | 365 |
| BUSI | 8.000 | 365 |
| MINYAK_REM | 20.000 | 730 |
| V_BELT | 24.000 | — |
| AIR_RADIATOR | 12.000 | 365 |

Pengingat dianggap jatuh tempo pada **mana yang lebih dulu** antara km atau hari.
Jika belum pernah ada catatan untuk kategori itu, status = `BELUM_ADA_DATA`.

### 7.4 Validasi
- Tanggal wajib, tidak boleh di masa depan lebih dari 1 hari.
- Odometer: bilangan bulat ≥ 0.
- Qty: bilangan > 0. Harga: bilangan ≥ 0 (Rupiah, tanpa desimal).
- Nama item wajib, maksimal 100 karakter. Catatan maksimal 1.000 karakter.
- Validasi dilakukan di frontend (UX) **dan** di backend (wajib, sumber kebenaran).

### 7.5 Format
- Mata uang: Rupiah, format `Rp 125.000`.
- Tanggal tampilan: `3 Nov 2026`; penyimpanan: ISO `YYYY-MM-DD`.
- Zona waktu: `Asia/Jakarta`.
- Bahasa UI: Bahasa Indonesia.

## 8. Kebutuhan Non-Fungsional

| ID | Kebutuhan |
|----|-----------|
| NF-01 | Mobile-first, nyaman di layar 360px, tetap rapi di desktop. |
| NF-02 | Tanpa build step wajib untuk frontend (HTML/CSS/JS murni, ES modules). |
| NF-03 | Respons API normal < 3 detik untuk data ≤ 2.000 catatan. |
| NF-04 | Keamanan: spreadsheet tetap privat; API hanya menerima permintaan dengan token valid; token tidak pernah di-commit ke repo. |
| NF-05 | Penulisan data memakai `LockService` agar tidak bentrok. |
| NF-06 | Hapus data = soft delete (`deleted = TRUE`), data tidak benar-benar hilang. |
| NF-07 | Aksesibilitas dasar: label pada semua input, kontras cukup, bisa dioperasikan keyboard. |
| NF-08 | Deploy otomatis lewat GitHub Actions: frontend ke GitHub Pages, backend ke Apps Script via `clasp`. |
| NF-09 | Kode backend bisa diuji fungsi intinya tanpa Spreadsheet (logika murni dipisah dari akses Sheet). |

## 9. Fase Berikutnya (jangan dikerjakan di MVP)
- Upload foto nota ke Google Drive.
- Notifikasi email/Telegram saat pengingat `SEGERA`/`TERLAMBAT` (time-driven trigger).
- PWA offline + antrean sinkronisasi.
- Export PDF riwayat servis (untuk jual motor).

## 10. Scope MVP (Definition of Done)
MVP selesai jika semua ini terpenuhi:
1. US-01 s.d. US-18 berfungsi end-to-end dari frontend di GitHub Pages ke Spreadsheet.
2. Fungsi `setup()` di Apps Script membuat semua sheet + header + data default.
3. Push ke branch `main` memicu deploy frontend dan backend otomatis.
4. `README.md` berisi langkah setup dari nol yang bisa diikuti non-developer.
5. Tidak ada token/secret di dalam repository.

## 11. Asumsi & Risiko
| Asumsi / Risiko | Dampak | Mitigasi |
|-----------------|--------|----------|
| Web app Apps Script di-deploy dengan akses "Anyone" agar bisa dipanggil dari GitHub Pages | URL API publik | Wajib token di setiap request; token di Script Properties |
| Apps Script tidak mendukung CORS preflight (OPTIONS) | Request `application/json` gagal | Kirim POST dengan `Content-Type: text/plain` (lihat design.md) |
| Kuota Apps Script (akun gratis) | Lambat/gagal jika berlebihan | Pemakaian pribadi jauh di bawah kuota; cache bacaan dengan `CacheService` |
| Token tersimpan di `localStorage` | Bisa dibaca jika perangkat dipinjam | Tombol "Keluar"; token bisa diganti kapan saja di Script Properties |
