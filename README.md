# MotoCare

Web app pribadi untuk mencatat servis motor, ganti oli, dan belanja part, lengkap dengan pengingat
perawatan berdasarkan kilometer dan tanggal. Data tersimpan di Google Spreadsheet milik Anda, backend
memakai Google Apps Script, dan tampilan web di-hosting gratis di GitHub Pages.

```
Frontend (GitHub Pages)  ── POST JSON + token ──▶  Apps Script Web App  ──▶  Google Spreadsheet "MotoCare DB"
frontend/  (HTML/CSS/JS)                           backend/ (clasp)          (tetap privat)
```

Dokumen proyek: [prd.md](prd.md) (apa & kenapa) · [design.md](design.md) (bagaimana) · [task.md](task.md) (progres)

## Daftar isi

1. [Coba lokal tanpa akun Google](#1-coba-lokal-tanpa-akun-google)
2. [Prasyarat](#2-prasyarat)
3. [Siapkan repository GitHub](#3-siapkan-repository-github)
4. [Siapkan project Apps Script](#4-siapkan-project-apps-script)
5. [Jalankan setup() dan deploy web app pertama kali](#5-jalankan-setup-dan-deploy-web-app-pertama-kali)
6. [Isi GitHub Secrets & Variables, aktifkan Pages](#6-isi-github-secrets--variables-aktifkan-pages)
7. [Pakai aplikasi](#7-pakai-aplikasi)
8. [Perawatan: ganti token, kategori, update kode](#8-perawatan)
9. [Troubleshooting](#9-troubleshooting)
10. [Struktur folder & perintah](#10-struktur-folder--perintah)

Semua perintah di bawah ditulis untuk **PowerShell di Windows** dan dijalankan dari folder root repo.

---

## 1. Coba lokal tanpa akun Google

```powershell
npm install
npm run dev:mock
```

Buka http://localhost:5173, masukkan kode akses `demo`. Data contoh tersimpan di memori dan hilang saat server
dihentikan (Ctrl+C). Tambahkan `-- --empty` untuk mulai tanpa data contoh: `npm run dev:mock -- --empty`.

## 2. Prasyarat

- [Node.js](https://nodejs.org) versi LTS (20 atau lebih baru). Cek: `node --version`
- [Git](https://git-scm.com/download/win)
- Akun Google (untuk Spreadsheet & Apps Script) dan akun GitHub

## 3. Siapkan repository GitHub

1. Buat repository baru di GitHub, misalnya `motocare`. Pilih **Public**: GitHub Pages gratis hanya untuk repo publik.
   Ini aman karena repo tidak berisi token atau data Anda.
2. Hubungkan repo lokal lalu push:
   ```powershell
   git remote add origin https://github.com/USERNAME/motocare.git
   git push -u origin main
   ```
   Workflow deploy akan gagal pada push pertama karena secrets belum diisi. Itu normal, lanjutkan langkah berikutnya.

## 4. Siapkan project Apps Script

1. Aktifkan Apps Script API: buka https://script.google.com/home/usersettings → **Google Apps Script API** → On.
2. Install dependensi dan login clasp (browser akan terbuka, pilih akun Google Anda):
   ```powershell
   npm install
   npx clasp login
   ```
3. Buat project Apps Script dari folder `backend`:
   ```powershell
   Push-Location backend
   npx clasp create-script --type standalone --title "MotoCare API"
   Pop-Location
   ```
   Perintah ini membuat `backend/.clasp.json` (berisi Script ID). File ini sudah di-`.gitignore`, jangan di-commit.
   Jika clasp menimpa `backend/appsscript.json`, kembalikan dengan `git checkout backend/appsscript.json`.
4. Upload kode:
   ```powershell
   Push-Location backend; npx clasp push --force; Pop-Location
   ```

## 5. Jalankan setup() dan deploy web app pertama kali

1. Buka https://script.google.com, pilih project **MotoCare API**.
2. Di toolbar, pilih fungsi **setup** → klik **Run**. Setujui izin akses Spreadsheet (klik *Advanced* → *Go to MotoCare API* jika muncul peringatan, karena ini script milik Anda sendiri).
3. Buka **Execution log**. Salin dua hal:
   - URL spreadsheet "MotoCare DB" (database Anda)
   - **API_TOKEN**: ini kode akses aplikasi. Simpan di password manager.
4. Klik **Deploy → New deployment** → ikon roda gigi → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**, lalu salin **Deployment ID** dan **Web app URL** (berakhiran `/exec`).
5. Uji dari PowerShell (ganti nilainya):
   ```powershell
   $env:MOTOCARE_API_URL = "https://script.google.com/macros/s/XXXX/exec"
   $env:MOTOCARE_TOKEN   = "TOKEN_ANDA"
   $body = '{"action":"auth.check","token":"' + $env:MOTOCARE_TOKEN + '","payload":{}}'
   Invoke-RestMethod -Uri $env:MOTOCARE_API_URL -Method Post -ContentType "text/plain;charset=utf-8" -Body $body
   ```
   Hasil yang benar: `ok = True`. Uji semua fitur API sekaligus (membuat lalu menghapus motor "Smoke Test"):
   ```powershell
   powershell -ExecutionPolicy Bypass -File backend/scripts/smoke.ps1
   ```

> "Who has access: Anyone" diperlukan agar GitHub Pages bisa memanggil API. Spreadsheet tetap privat;
> setiap request wajib membawa API_TOKEN yang benar.

## 6. Isi GitHub Secrets & Variables, aktifkan Pages

Di GitHub: **Settings → Secrets and variables → Actions**.

| Nama | Tab | Isi |
|------|-----|-----|
| `CLASPRC_JSON` | Secrets | Seluruh isi file kredensial clasp. Salin dengan: `Get-Content $env:USERPROFILE\.clasprc.json -Raw \| Set-Clipboard` |
| `CLASP_SCRIPT_ID` | Secrets | Nilai `scriptId` di `backend/.clasp.json` |
| `GAS_DEPLOYMENT_ID` | Secrets | Deployment ID dari langkah 5.4 |
| `MOTOCARE_API_URL` | Variables | Web app URL `/exec` dari langkah 5.4 |

Lalu **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Jalankan kedua workflow sekali: tab **Actions** → *Deploy frontend (GitHub Pages)* → **Run workflow**,
lalu *Deploy backend (Apps Script)* → **Run workflow**. Setelah hijau, aplikasi tersedia di
`https://USERNAME.github.io/motocare/`.

Selanjutnya setiap push ke `main`:
- perubahan di `frontend/` → deploy ulang GitHub Pages
- perubahan di `backend/` → test, `clasp push`, lalu memperbarui deployment yang sama (URL `/exec` tidak berubah)

> `CLASPRC_JSON` berisi refresh token akun Google Anda. Jangan bagikan. Jika bocor, jalankan `npx clasp logout`,
> cabut akses "clasp" di https://myaccount.google.com/permissions, lalu login ulang dan perbarui secret.

## 7. Pakai aplikasi

1. Buka URL GitHub Pages di HP, masukkan API_TOKEN. Tambahkan ke layar utama lewat menu browser agar terasa seperti aplikasi.
2. Tambahkan motor (nama + odometer awal). Motor baru otomatis mendapat 7 jadwal perawatan default (oli mesin tiap 2.000 km / 60 hari, dst.).
3. Catat **Ganti Oli**, **Servis**, atau **Belanja Part** lewat tombol ＋. Total dihitung otomatis.
4. Beranda menampilkan status pengingat: **OK**, **Segera** (sisa ≤ 10% interval km atau ≤ 7 hari), **Terlambat**.
5. Perbarui odometer kapan saja lewat tombol **Update km** agar pengingat akurat.

6. **Garasi** (Lainnya → Motor) menampilkan semua motor, spesifikasi (tangki, oli, ban), dan pengingat paling mendesak per motor.
   **Foto motor**: tekan "Tambah foto" di kartu motor, atau buka Edit motor → Foto motor kesayangan → Galeri/Kamera. Foto dikompres otomatis dan disimpan di sheet `motor_photos`.
7. **Laporan** menampilkan total biaya per tahun, perbandingan dengan tahun lalu, grafik bulanan, kelompok biaya, dan biaya per km.
8. **Cadangan & ekspor**: Lainnya → Cadangkan Data (file JSON), atau Riwayat/Laporan → Ekspor (CSV untuk Excel).
9. **Tema** terang/gelap bisa diganti di Pengaturan.

Data juga bisa dilihat langsung di spreadsheet "MotoCare DB". Hapus di aplikasi hanya menandai `deleted = TRUE`,
datanya tidak hilang. Hindari mengubah baris header (baris 1) di spreadsheet.

## 8. Perawatan

- **Ganti token**: di editor Apps Script jalankan `rotateToken()`, salin token baru dari Execution log, lalu masuk ulang di aplikasi. Token lama langsung tidak berlaku.
- **Lupa token**: editor Apps Script → **Project Settings** → **Script properties** → `API_TOKEN`.
- **Tambah kategori**: aplikasi → Lainnya → Pengaturan → ＋ Kategori.
- **Update kode backend manual** (tanpa GitHub Actions): `Push-Location backend; npx clasp push --force; npx clasp update-deployment DEPLOYMENT_ID; Pop-Location`.
  Tanpa `update-deployment`, web app tetap menjalankan versi lama.
- **Update dari versi lama**: kolom baru di spreadsheet (misalnya spesifikasi motor di v0.2) ditambahkan otomatis saat aplikasi pertama kali membaca sheet. `setup()` tidak perlu dijalankan ulang.
- **Uji performa** (opsional): jalankan `dev_seedDummy()` lalu `dev_benchmark()` di editor Apps Script. Hapus motor "Motor Uji" setelahnya.

## 9. Troubleshooting

| Gejala | Penyebab & solusi |
|--------|-------------------|
| "Tidak bisa terhubung ke server" / `Failed to fetch` | API URL salah atau bukan URL `/exec`. Cek di layar login → Pengaturan lanjutan, atau variable `MOTOCARE_API_URL`. Jangan pakai URL `/dev`. |
| "Respons server tidak valid" | Web app belum di-deploy dengan akses **Anyone**, atau Apps Script meminta login. Ulangi langkah 5.4. |
| "Kode akses salah" / `UNAUTHORIZED` | Token salah atau sudah di-rotate. Cek Script properties. |
| "Database belum di-setup" | `setup()` belum dijalankan. Lihat langkah 5.2. |
| Perubahan backend tidak muncul | Deployment belum diperbarui. Jalankan workflow backend atau `clasp update-deployment`. |
| Workflow backend gagal `invalid_grant` / login | Kredensial clasp kedaluwarsa. `npx clasp login` lagi, lalu perbarui secret `CLASPRC_JSON`. |
| Workflow backend gagal "Secret belum diisi" | Lengkapi secrets di langkah 6. |
| Halaman Pages 404 | Source Pages belum diset ke **GitHub Actions**, atau workflow frontend belum berjalan. |

## 10. Struktur folder & perintah

```
backend/      Apps Script (clasp). src/ diunggah, test/ dan scripts/ tidak.
frontend/     Situs statis untuk GitHub Pages (tanpa build step).
scripts/      mock-server.js untuk mencoba lokal.
.github/      Workflow CI dan deploy.
```

| Perintah | Fungsi |
|----------|--------|
| `npm test` | Unit test logika + uji integrasi API di atas mock Apps Script |
| `npm run dev:mock` | Jalankan frontend + backend mock di http://localhost:5173 |
| `npm run push` | `clasp push --force` dari folder backend |
