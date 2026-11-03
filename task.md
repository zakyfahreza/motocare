# Task — MotoCare

> **Untuk AI agent (Claude Opus):**
> 1. Baca `prd.md` lalu `design.md` sampai selesai sebelum menulis kode.
> 2. Kerjakan task **berurutan**. Setelah satu task selesai dan kriteria terima terpenuhi, ubah `[ ]` jadi `[x]`.
> 3. Satu task = satu commit, format Conventional Commits (`feat(backend): ...`, `chore: ...`, `docs: ...`).
> 4. Task bertanda **👤 MANUAL** harus dilakukan pemilik proyek (butuh login Google/GitHub). Berhenti, tulis
>    instruksi langkah demi langkah yang jelas, lalu tunggu konfirmasi sebelum lanjut ke task yang bergantung padanya.
> 5. Jangan menambah fitur di luar `prd.md` §10. Jika ragu, tanya.
> 6. Jangan pernah menulis token, `.clasprc.json`, atau Script ID ke file yang di-commit.
> 7. Jika menyimpang dari `design.md`, catat di `design.md` §9 "Catatan Perubahan".
> 8. Lingkungan pemilik: Windows + PowerShell. Tulis perintah di README untuk PowerShell.

Legenda: `[ ]` belum, `[x]` selesai. **KT** = kriteria terima.

> **Status 2026-11-03.** Semua kode selesai dan diuji tanpa akun Google:
> - `npm test`: 22 test lulus (unit `logic.js` + uji integrasi seluruh action API di atas mock Apps Script `backend/test/gas-mock.js`).
>   Mock ini menggantikan `__testRepo()` di T1.3.
> - E2E browser (Edge headless) terhadap `npm run dev:mock`: 16 skenario lulus di 360px & 1280px, terang & gelap, tanpa error CSP.
> - axe-core: 0 pelanggaran WCAG 2 AA di semua halaman; Lighthouse Accessibility halaman login = 100.
> - `clasp show-file-status`: hanya `appsscript.json` + `src/**` yang ikut di-push.
>
> **Belum bisa diverifikasi agent** (butuh akun Google/GitHub pemilik): T0.3, T1.6, T5.4 (manual), lalu
> T2.8 (jalankan `backend/scripts/smoke.ps1` ke URL asli), T5.1–T5.3 (workflow hijau di GitHub),
> T6.3 (`dev_seedDummy()` + `dev_benchmark()` di Apps Script asli), T7.2 (checklist di URL GitHub Pages), T7.3.

---

## Fase 0 — Persiapan Repository

- [x] **T0.1 Struktur folder & file dasar**
  Buat struktur sesuai `design.md` §2 (file kosong/placeholder boleh), `.gitignore` (§6.6), `package.json` (§6.5).
  KT: `npm install` berhasil; `git status` tidak menampilkan file yang seharusnya di-ignore.

- [x] **T0.2 README kerangka**
  Judul, deskripsi singkat, arsitektur (copy diagram dari design §1), daftar isi bagian setup (diisi di T7.1).
  KT: README ter-render rapi di GitHub.

- [ ] **T0.3 👤 MANUAL — Repo GitHub & clasp login**
  Instruksikan pemilik untuk:
  1. Membuat repo GitHub (boleh privat; GitHub Pages dari repo privat butuh paket berbayar → sarankan publik,
     aman karena tidak ada secret di repo).
  2. Mengaktifkan Apps Script API di https://script.google.com/home/usersettings.
  3. Menjalankan `npx clasp login` di PowerShell.
  4. Dari folder `backend/`, menjalankan `npx clasp create --type standalone --title "MotoCare API"`
     (agent: cek dulu `npx clasp --help`, di beberapa versi perintahnya `create-script`), lalu memastikan
     `backend/.clasp.json` berisi `"rootDir": "."` atau tanpa `rootDir`, dan tidak ikut ter-commit.
  KT: pemilik konfirmasi; `backend/.clasp.json` ada secara lokal dan di-ignore git.

---

## Fase 1 — Fondasi Backend

- [x] **T1.1 `appsscript.json`, `.claspignore`, `.clasp.json.example`** (design §4.1)
  `.claspignore` mengecualikan `test/**`, `**/*.md`, `.clasp.json.example`.
  KT: `npx clasp push` (dari `backend/`) hanya mengunggah `appsscript.json` dan `src/**`.

- [x] **T1.2 `config.js`, `response.js`**
  `APP_VERSION`, nama sheet, header tiap sheet (§3), kategori default, jadwal pengingat default (PRD §7.2–7.3).
  `AppError`, `ok(data)`, `fail(err)` → `ContentService` JSON.
  KT: konstanta header persis sama dengan design §3.

- [x] **T1.3 `db.js` — Repo generik** (design §4.4)
  Termasuk memo per request, `insertMany` satu `setValues`, proteksi formula injection (design §7).
  KT: fungsi uji manual `__testRepo()` (hapus setelah lolos atau beri prefix `dev_`) bisa insert, baca, update, soft delete.

- [x] **T1.4 `setup.js` — `setup()` & `rotateToken()`** (design §4.2)
  KT: dijalankan 2× berturut-turut tidak menduplikasi sheet/kategori; kolom tanggal berformat teks; token tercetak di log.

- [x] **T1.5 `auth.js`, `router.js`, `main.js`** (design §4.3)
  `doGet` health check; `doPost` parse → auth → route → lock untuk write → respons.
  Router berisi action `auth.check` dulu; action lain didaftarkan di fase 2.
  KT: body tidak valid → `BAD_REQUEST`; token salah → `UNAUTHORIZED`; action asing → `UNKNOWN_ACTION`;
  `auth.check` dengan token benar → `{ ok: true, data: { version } }`.

- [ ] **T1.6 👤 MANUAL — Setup & deployment pertama**
  Instruksikan pemilik:
  1. `npx clasp push` dari `backend/`.
  2. Buka editor project di https://script.google.com, jalankan `setup()`, setujui izin, salin token dari log.
  3. Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone** → salin **URL /exec** dan **Deployment ID**.
  4. Uji dari PowerShell:
     ```powershell
     $body = '{"action":"auth.check","token":"TOKEN_ANDA","payload":{}}'
     Invoke-RestMethod -Uri "URL_EXEC_ANDA" -Method Post -ContentType "text/plain;charset=utf-8" -Body $body
     ```
  KT: respons `ok = True`. Pemilik menyimpan token, URL, Deployment ID di tempat aman (bukan di repo).

---

## Fase 2 — Fitur Backend

- [x] **T2.1 `logic.js` + unit test** (design §4.5, §8)
  Implementasi semua fungsi murni + `module.exports` kondisional. Tulis `backend/test/logic.test.js`.
  KT: `npm test` hijau; mencakup kasus batas untuk `computeReminderStatus` (tepat di batas km, tepat di batas hari,
  hanya km, hanya hari, belum ada data, SEGERA karena km, SEGERA karena hari) dan `aggregateMonthly` (bulan kosong = 0).

- [x] **T2.2 `validators.js`**
  Validasi per entitas sesuai PRD §7.4 dan design §4.6. Kumpulkan semua error field sekaligus.
  KT: payload tidak valid menghasilkan `VALIDATION_ERROR` dengan `fields` berisi semua field yang salah.

- [x] **T2.3 `services/settings.js`** — `settings.get`, `settings.saveCategory`.
  KT: kategori baru muncul di `settings.get`; kode duplikat dengan data berbeda → update, bukan baris baru.

- [x] **T2.4 `services/motors.js`** — list, create (+ reminders default), update, delete, updateOdometer.
  KT: motor baru otomatis punya 7 reminder default; `updateOdometer` lebih kecil → `ODOMETER_LOWER`; delete = soft delete.

- [x] **T2.5 `services/records.js`** — list (filter + paginasi), get, create, update, delete, places.
  Total dihitung server. Update motor `odometerCurrent` sesuai design §4.6.
  KT: total di sheet = Σ subtotal + jasa; `GANTI_OLI` tanpa item oli ditolak; `ODOMETER_LOWER` muncul dan bisa
  dilewati dengan `confirmOdometer`; delete ikut soft delete item; list urut `date` desc, `odometer` desc.

- [x] **T2.6 `services/reminders.js`** — list (dengan status, urutan sesuai design), upsert, delete.
  KT: kategori duplikat untuk motor yang sama → `DUPLICATE`; status cocok dengan hasil `logic.js`.

- [x] **T2.7 `services/dashboard.js` & `services/reports.js`**
  KT: `dashboard.get` sesuai bentuk data di design §4.6; `reports.monthly` mengembalikan tepat `months` entri;
  `reports.byCategory` memasukkan biaya jasa ke `JASA`.

- [ ] **T2.8 Daftarkan semua action di `router.js` & uji end-to-end backend**
  Tandai action write sesuai tabel design §4.6. Push + perbarui deployment (versi baru di deployment yang sama).
  KT: setiap action di tabel diuji minimal 1× via PowerShell `Invoke-RestMethod`; tulis skrip uji ke
  `backend/scripts/smoke.ps1` yang membaca URL & token dari env var `MOTOCARE_API_URL` dan `MOTOCARE_TOKEN`.

---

## Fase 3 — Fondasi Frontend

- [x] **T3.1 `index.html` + `css/styles.css`**
  CSP & meta (design §5.6), viewport, `<main id="app">`, header, bottom nav. Design tokens via CSS variables,
  dark mode, komponen dasar (button, card, input, badge status, segmented control, table, toast, modal).
  KT: tampil benar di lebar 360px dan 1280px; tidak ada error CSP di console.

- [x] **T3.2 Utilitas** — `utils/format.js` (Rupiah, tanggal Indonesia, km), `utils/dom.js` (`h()`, `escapeHtml`),
  `utils/validate.js`.
  KT: `formatRupiah(125000)` → `Rp 125.000`; `formatDate('2026-11-03')` → `3 Nov 2026`.

- [x] **T3.3 `api.js`, `state.js`, `config.js`** (design §5.3–5.4)
  KT: timeout bekerja; `UNAUTHORIZED` mengarahkan ke login; error jaringan tampil sebagai toast yang ramah.

- [x] **T3.4 `router.js`, `ui/components.js`, `main.js`**
  Hash router dengan parameter (`:id`) dan query; guard login & guard "belum ada motor"; loading state & empty state.
  KT: navigasi bolak-balik dan tombol back browser bekerja; refresh di route mana pun tetap di route itu.

- [x] **T3.5 `views/login.js`**
  Input token (type password + toggle lihat), bagian "Lanjutan" untuk API URL. Validasi via `auth.check`.
  KT: token salah → pesan error; token benar → ke dashboard.

---

## Fase 4 — Fitur Frontend

- [x] **T4.1 `views/motors.js`** — daftar, tambah/edit (modal/form), hapus (confirm), update odometer, pilih motor aktif.
  KT: US-01 s.d. US-04 terpenuhi.

- [x] **T4.2 `views/record-form.js`** — create & edit (design §5.5).
  KT: US-05 s.d. US-07, US-10; total live sama dengan total dari server; tidak bisa double submit;
  error validasi server tampil di bawah field terkait.

- [x] **T4.3 `views/records-list.js` & `views/record-detail.js`**
  KT: US-08, US-09; filter bekerja; "Muat lagi" memakai `offset`; hapus mengembalikan ke daftar dengan toast.

- [x] **T4.4 `views/reminders.js`**
  KT: US-11 s.d. US-14; badge warna + teks status; edit interval langsung memperbarui status.

- [x] **T4.5 `views/dashboard.js`**
  KT: US-15; tombol cepat "Ganti Oli" membuka form dengan `type=GANTI_OLI` dan baris `OLI_MESIN` terisi.

- [x] **T4.6 `views/reports.js`**
  Bar chart CSS (tanpa library) untuk 12 bulan + tabel per kategori dengan pemilih tahun.
  KT: US-16; angka cocok dengan jumlah manual di spreadsheet.

- [x] **T4.7 `views/settings.js`**
  Kelola kategori, info versi frontend & backend, tombol Keluar.
  KT: US-17, US-18.

---

## Fase 5 — CI/CD

- [ ] **T5.1 `.github/workflows/ci.yml`** (design §6.4)
  KT: workflow hijau pada PR.

- [ ] **T5.2 `.github/workflows/deploy-pages.yml`** (design §6.2)
  KT: `config.js` hasil build berisi URL dari variable; file `config.js` di repo tetap `API_URL = ''`.

- [ ] **T5.3 `.github/workflows/deploy-backend.yml`** (design §6.3)
  Verifikasi perintah clasp dengan `npx clasp --help` sebelum menulis workflow.
  KT: push perubahan di `backend/` memperbarui deployment yang sama (URL `/exec` tidak berubah).

- [ ] **T5.4 👤 MANUAL — Secrets, variables, Pages**
  Instruksikan pemilik:
  1. Settings → Secrets and variables → Actions: tambah `CLASPRC_JSON` (isi file `$env:USERPROFILE\.clasprc.json`),
     `CLASP_SCRIPT_ID`, `GAS_DEPLOYMENT_ID`; tab Variables: `MOTOCARE_API_URL`.
  2. Settings → Pages → Source: **GitHub Actions**.
  3. Jalankan kedua workflow via "Run workflow".
  KT: kedua workflow hijau; situs terbuka di `https://<user>.github.io/<repo>/`.

---

## Fase 6 — Pengerasan

- [x] **T6.1 Audit keamanan**
  Cari di seluruh repo: token, `scriptId`, `refresh_token`, `access_token`. Pastikan tidak ada `innerHTML` dengan data
  pengguna tanpa escape. Pastikan log backend tidak memuat token/payload sensitif.
  KT: `git grep -nE "refresh_token|access_token|[A-Za-z0-9]{40,}" -- . ":!package-lock.json"` tidak menemukan
  secret (temuan selain secret, misalnya hash, boleh diabaikan dengan alasan tertulis),
  dan `git ls-files | Select-String "clasp.json$|clasprc"` hanya menampilkan `.clasp.json.example`.

- [x] **T6.2 Aksesibilitas & UX**
  Label semua input, fokus terlihat, urutan tab logis, tombol ≥ 44px, pesan error terbaca screen reader (`aria-live`).
  KT: Lighthouse Accessibility ≥ 90 di mode mobile.

- [ ] **T6.3 Performa**
  Uji dengan 1.000 catatan dummy (fungsi `dev_seedDummy()` di backend, tidak dipanggil otomatis).
  KT: `records.list` dan `dashboard.get` < 3 detik. Jika tidak, optimalkan baca sheet (kolom terbatas / CacheService)
  dan catat di design §9.

---

## Fase 7 — Dokumentasi & QA Akhir

- [x] **T7.1 README lengkap (Bahasa Indonesia, untuk non-developer)**
  Prasyarat (Node LTS, akun Google & GitHub), langkah setup dari nol (gabungan T0.3, T1.6, T5.4) dengan perintah PowerShell,
  cara ganti token (`rotateToken()`), cara menambah kategori, troubleshooting (CORS/`Failed to fetch`, `UNAUTHORIZED`,
  clasp token kedaluwarsa, lupa update deployment).
  KT: orang lain bisa setup dari nol hanya dengan README.

- [ ] **T7.2 Checklist E2E manual di URL GitHub Pages** (centang semua)
  - [ ] Login dengan token salah ditolak, token benar diterima.
  - [ ] Tambah 2 motor, ganti motor aktif, data per motor terpisah.
  - [ ] Catat `GANTI_OLI` → status pengingat OLI_MESIN menjadi OK dengan sisa km benar.
  - [ ] Update odometer melewati batas → status berubah ke SEGERA lalu TERLAMBAT.
  - [ ] Catat `SERVIS` hanya biaya jasa (tanpa item) berhasil.
  - [ ] Catat `BELANJA_PART` tanpa item ditolak.
  - [ ] Odometer lebih kecil dari catatan sebelumnya memunculkan konfirmasi.
  - [ ] Edit catatan: item berubah, total diperbarui di spreadsheet.
  - [ ] Hapus catatan: hilang dari UI, baris di sheet `deleted = TRUE`.
  - [ ] Laporan bulanan & per kategori cocok dengan spreadsheet.
  - [ ] Keluar → kembali ke login, token terhapus dari `localStorage`.
  - [ ] Tampilan rapi di HP (360px) dan desktop; dark mode terbaca.
  KT: semua tercentang; bug yang ditemukan diperbaiki sebelum MVP dinyatakan selesai.

- [ ] **T7.3 Rilis v1.0.0**
  Set `APP_VERSION = '1.0.0'` di backend & frontend, buat tag `v1.0.0`, ringkas perubahan di `CHANGELOG.md`.
  KT: PRD §10 Definition of Done terpenuhi semua.
