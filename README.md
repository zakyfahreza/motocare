# MotoCare

Web app pribadi untuk mencatat servis motor, ganti oli, dan belanja part.
Data tersimpan di Google Spreadsheet milik Anda, backend memakai Google Apps Script,
dan tampilan web di-hosting gratis di GitHub Pages.

## Arsitektur

```
Frontend (GitHub Pages)  ── POST JSON ──▶  Apps Script Web App  ──▶  Google Spreadsheet "MotoCare DB"
HTML + CSS + JS              (token)       doPost → router → service      (privat)
```

Dokumen proyek: [prd.md](prd.md) · [design.md](design.md) · [task.md](task.md)

## Daftar isi setup

1. Prasyarat
2. Siapkan repository GitHub
3. Siapkan project Apps Script (clasp)
4. Jalankan `setup()` dan deploy web app pertama kali
5. Isi GitHub Secrets & Variables, aktifkan Pages
6. Pakai aplikasi
7. Ganti token
8. Troubleshooting

_(Isi lengkap ditulis di task T7.1.)_
