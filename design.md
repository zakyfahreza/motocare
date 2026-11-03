# Design — MotoCare

> **Untuk AI agent:** Dokumen ini menjelaskan *bagaimana* MotoCare dibangun. Ikuti struktur folder,
> skema data, dan kontrak API di sini secara persis. Jika kamu perlu menyimpang (misalnya API clasp
> berubah), catat alasannya di bagian "Catatan Perubahan" di akhir dokumen ini sebelum melanjutkan.
> Scope fitur ada di `prd.md`. Urutan kerja ada di `task.md`.

---

## 1. Arsitektur

```
┌──────────────────────────┐   HTTPS POST (text/plain, JSON body)   ┌──────────────────────────┐
│ Frontend (GitHub Pages)  │ ─────────────────────────────────────▶ │ Apps Script Web App      │
│ HTML + CSS + JS (ESM)    │ ◀───────────────────────────────────── │ doPost → router → service│
│ token di localStorage    │        JSON { ok, data | error }       │ (executeAs: pemilik)     │
└──────────────────────────┘                                        └────────────┬─────────────┘
                                                                                 │ SpreadsheetApp
                                                                    ┌────────────▼─────────────┐
                                                                    │ Google Spreadsheet       │
                                                                    │ "MotoCare DB" (privat)   │
                                                                    └──────────────────────────┘

GitHub repo (main) ──▶ Actions: deploy-pages.yml   ──▶ GitHub Pages (folder frontend/)
                   └─▶ Actions: deploy-backend.yml ──▶ clasp push + clasp deploy (deployment ID tetap)
```

### 1.1 Keputusan arsitektur (ADR singkat)

| Opsi | Kelebihan | Kekurangan | Keputusan |
|------|-----------|------------|-----------|
| A. Apps Script `HtmlService` (frontend dilayani Apps Script) | Login Google bawaan, tanpa token, tanpa CORS | Tidak di-hosting di GitHub, UI dalam iframe, deploy frontend lewat clasp | Tidak dipilih |
| **B. Frontend di GitHub Pages + Apps Script sebagai JSON API** | Sesuai permintaan "deploy ke GitHub", URL bersih, frontend bebas | Perlu token sendiri, perlu trik CORS | **Dipilih** |

Jika pemilik proyek nanti ingin pindah ke opsi A, layer `services/` backend tetap bisa dipakai ulang;
hanya `main.js` dan frontend yang berubah.

### 1.2 Batasan Apps Script yang wajib dipahami
1. **Tidak ada CORS preflight.** Apps Script tidak menjawab `OPTIONS`. Karena itu frontend **wajib**
   mengirim `POST` dengan header `Content-Type: text/plain;charset=utf-8` (simple request), body berisi
   string JSON. Jangan pakai `application/json` dan jangan tambah header custom (misal `Authorization`).
2. **Redirect.** Respons `/exec` melakukan 302 ke `script.googleusercontent.com`. `fetch` mengikutinya
   otomatis (`redirect: 'follow'`). CSP `connect-src` harus mengizinkan kedua domain.
3. **Status HTTP selalu 200.** Bedakan sukses/gagal lewat field `ok` di body JSON.
4. **Tanggal di Sheets.** Sel yang terlihat seperti tanggal otomatis jadi objek `Date` saat `getValues()`.
   Semua kolom tanggal/timestamp diset format teks `@` saat `setup()` dan ditulis sebagai string ISO.
5. **Scope global.** Semua file `.js` backend berbagi satu namespace global (tanpa `import`). Beri prefix
   atau gunakan objek namespace (`MotorService`, `RecordService`, dst.) untuk menghindari bentrok nama.
6. **`/dev` URL tidak bisa dipakai** dari GitHub Pages (butuh login). Selalu pakai URL `/exec` dari deployment.

---

## 2. Struktur Repository

```
motocare/
├─ prd.md
├─ design.md
├─ task.md
├─ README.md                      # panduan setup dari nol (Bahasa Indonesia)
├─ .gitignore
├─ package.json                   # devDependencies: @google/clasp; script test & push
├─ backend/
│  ├─ appsscript.json
│  ├─ .claspignore                # kecualikan test/ dan file non-backend
│  ├─ .clasp.json.example         # contoh; .clasp.json asli di-.gitignore, dibuat CI dari secret
│  ├─ src/
│  │  ├─ main.js                  # doGet, doPost
│  │  ├─ router.js                # peta action → handler
│  │  ├─ auth.js                  # verifikasi token
│  │  ├─ response.js              # ok(), fail(), AppError
│  │  ├─ config.js                # APP_VERSION, nama sheet, kategori & jadwal default
│  │  ├─ db.js                    # Repo generik berbasis header
│  │  ├─ validators.js
│  │  ├─ logic.js                 # FUNGSI MURNI: total, status pengingat, agregasi laporan
│  │  ├─ setup.js                 # setup(), rotateToken()
│  │  └─ services/
│  │     ├─ motors.js
│  │     ├─ records.js
│  │     ├─ reminders.js
│  │     ├─ dashboard.js
│  │     ├─ reports.js
│  │     └─ settings.js
│  └─ test/
│     └─ logic.test.js            # node --test, menguji logic.js
├─ frontend/
│  ├─ index.html
│  ├─ css/styles.css
│  ├─ assets/icon.svg
│  └─ js/
│     ├─ main.js                  # bootstrap + daftar route
│     ├─ config.js                # export const API_URL = ''  (ditimpa CI)
│     ├─ api.js
│     ├─ state.js
│     ├─ router.js                # hash router
│     ├─ ui/components.js         # toast, modal, confirm, loading, empty state
│     ├─ utils/format.js          # rupiah, tanggal, km
│     ├─ utils/dom.js             # h() helper, escapeHtml
│     ├─ utils/validate.js
│     └─ views/
│        ├─ login.js
│        ├─ dashboard.js
│        ├─ records-list.js
│        ├─ record-form.js        # create & edit
│        ├─ record-detail.js
│        ├─ motors.js
│        ├─ reminders.js
│        ├─ reports.js
│        └─ settings.js
└─ .github/workflows/
   ├─ deploy-pages.yml
   ├─ deploy-backend.yml
   └─ ci.yml                      # jalankan test logic di setiap PR/push
```

`logic.js` harus bisa di-load di Node untuk test. Di akhir file:
```js
if (typeof module !== 'undefined') { module.exports = { /* fungsi murni */ }; }
```

---

## 3. Skema Data (Google Spreadsheet)

Baris 1 setiap sheet = header. Nama header = nama field di API (camelCase). `db.js` memetakan kolom
**berdasarkan nama header**, bukan posisi, sehingga urutan kolom boleh berubah.

Konvensi umum:
- `id`: `Utilities.getUuid()`.
- `createdAt`, `updatedAt`: string ISO 8601 (`new Date().toISOString()`).
- `date`: string `YYYY-MM-DD` (zona `Asia/Jakarta`).
- `deleted`: boolean `TRUE/FALSE`. Semua query default mengabaikan baris `deleted = TRUE`.
- Uang: integer Rupiah. Odometer: integer km.

### 3.1 `motors`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| name | string | contoh "Vario Harian" |
| brand | string | Honda, Yamaha, ... |
| model | string | Vario 125 |
| year | int | |
| plate | string | B 1234 XYZ |
| odometerStart | int | km saat mulai dicatat |
| odometerCurrent | int | max(odometerStart, odometer catatan, update manual) |
| odometerUpdatedAt | string ISO | |
| createdAt, updatedAt | string ISO | |
| deleted | bool | |

### 3.2 `records`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| motorId | string | FK → motors.id |
| date | string `YYYY-MM-DD` | |
| type | enum | `SERVIS` \| `GANTI_OLI` \| `BELANJA_PART` |
| odometer | int | |
| place | string | bengkel/toko |
| serviceFee | int | biaya jasa |
| itemsTotal | int | dihitung server: Σ subtotal item |
| grandTotal | int | itemsTotal + serviceFee |
| notes | string | |
| createdAt, updatedAt | string ISO | |
| deleted | bool | |

### 3.3 `record_items`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| recordId | string | FK → records.id |
| motorId | string | denormalisasi untuk query pengingat |
| category | string | kode kategori (lihat 3.5) |
| name | string | contoh "Yamalube Matic 0.8L" |
| brand | string | |
| qty | number | |
| unitPrice | int | |
| subtotal | int | qty × unitPrice, dibulatkan |
| createdAt | string ISO | |
| deleted | bool | |

### 3.4 `reminders`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | string | PK |
| motorId | string | FK |
| category | string | unik per motor (selama tidak deleted) |
| intervalKm | int \| kosong | |
| intervalDays | int \| kosong | minimal salah satu interval terisi |
| active | bool | |
| createdAt, updatedAt | string ISO | |
| deleted | bool | |

### 3.5 `categories`
| Kolom | Tipe |
|-------|------|
| code | string, PK, `UPPER_SNAKE` |
| label | string, contoh "Oli Mesin" |
| sortOrder | int |
| active | bool |

### 3.6 `meta`
| key | value |
|-----|-------|
| schemaVersion | `1` |

### 3.7 Script Properties (bukan di sheet)
| Key | Isi |
|-----|-----|
| `SPREADSHEET_ID` | ID spreadsheet "MotoCare DB" (diisi otomatis oleh `setup()`) |
| `API_TOKEN` | string acak ≥ 32 karakter (dibuat oleh `setup()` / `rotateToken()`) |

---

## 4. Backend

### 4.1 `appsscript.json`
```json
{
  "timeZone": "Asia/Jakarta",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets"],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

### 4.2 `setup()` (dijalankan manual sekali dari editor Apps Script)
1. Jika `SPREADSHEET_ID` kosong → `SpreadsheetApp.create('MotoCare DB')`, simpan ID.
2. Untuk setiap sheet di §3: buat jika belum ada, tulis header jika baris 1 kosong, freeze baris 1.
3. Set format teks `@` untuk kolom `id`, `date`, `createdAt`, `updatedAt`, `odometerUpdatedAt`.
4. Isi `categories` default (lihat `prd.md` §7.2) jika sheet kosong. Isi `meta.schemaVersion`.
5. Jika `API_TOKEN` kosong → buat token (`Utilities.getUuid()` digabung 2×, tanpa `-`), simpan.
6. `Logger.log` URL spreadsheet dan token **satu kali** agar pemilik bisa menyalinnya.
7. Idempoten: aman dijalankan berulang tanpa menduplikasi data.

`rotateToken()`: buat token baru, simpan, log. Token lama langsung tidak berlaku.

### 4.3 Alur request
```
doPost(e)
 └─ parse e.postData.contents → { action, token, payload }
 └─ Auth.verify(token)               → gagal: UNAUTHORIZED
 └─ handler = ROUTES[action]          → tidak ada: UNKNOWN_ACTION
 └─ handler.write ? withLock(fn) : fn → LockService.getScriptLock().waitLock(10000)
 └─ return ok(data) | fail(error)     → ContentService JSON
```
`doGet(e)` hanya mengembalikan `{ ok: true, data: { app: 'motocare', version } }` tanpa data pengguna
(untuk health check). Semua operasi data lewat `doPost`.

Seluruh handler dibungkus `try/catch`. `AppError(code, message, fields?)` → dikirim apa adanya.
Error lain → `INTERNAL_ERROR` dengan pesan umum; detail ditulis ke `console.error` (bukan ke respons).
**Jangan pernah menulis token ke log.**

Perbandingan token: bandingkan panjang lalu XOR per karakter (hindari early return).

### 4.4 `db.js` — Repo generik
```js
const Repo = {
  all(sheetName, { includeDeleted = false } = {}),   // → array objek
  findById(sheetName, id),
  insert(sheetName, obj),                            // isi id/createdAt/updatedAt/deleted otomatis
  insertMany(sheetName, objs),                       // satu setValues() untuk banyak baris
  update(sheetName, id, patch),                      // set updatedAt
  softDelete(sheetName, id),
  softDeleteWhere(sheetName, predicate),
};
```
- Baca: `getDataRange().getValues()` sekali per sheet per request; memo dalam objek request
  (invalidate memo setelah write ke sheet yang sama).
- Tulis: `setValues` per baris/blok, bukan `setValue` per sel.

### 4.5 `logic.js` — fungsi murni (wajib di-unit test)
```js
calcItemSubtotal(qty, unitPrice)                → int
calcRecordTotals(items, serviceFee)              → { itemsTotal, grandTotal }
findLastDone(records, items, category)           → { date, odometer, recordId } | null
computeReminderStatus(rule, lastDone, currentOdometer, todayISO) → {
  status: 'OK' | 'SEGERA' | 'TERLAMBAT' | 'BELUM_ADA_DATA',
  lastDate, lastOdometer, nextKm, nextDate, remainingKm, remainingDays
}
aggregateMonthly(records, months, todayISO)      → [{ month: 'YYYY-MM', total }]  // terisi 0 untuk bulan kosong
aggregateByCategory(records, items, year)        → [{ category, total }]        // serviceFee masuk kategori 'JASA'
daysBetween(aISO, bISO)                          → int
addDays(iso, n)                                  → 'YYYY-MM-DD'
```

Aturan `computeReminderStatus`:
```
if !lastDone → BELUM_ADA_DATA
nextKm   = intervalKm   ? lastOdometer + intervalKm   : null
nextDate = intervalDays ? addDays(lastDate, intervalDays) : null
remainingKm   = nextKm   != null ? nextKm - currentOdometer   : null
remainingDays = nextDate != null ? daysBetween(today, nextDate) : null
TERLAMBAT jika remainingKm <= 0 ATAU remainingDays <= 0
SEGERA    jika remainingKm <= ceil(0.1 × intervalKm) ATAU remainingDays <= 7
selain itu OK
```
`findLastDone`: ambil item non-deleted dengan kategori tsb yang record-nya non-deleted, urutkan
`date` desc lalu `odometer` desc, ambil pertama.

### 4.6 Kontrak API

**Request**
```http
POST {API_URL}
Content-Type: text/plain;charset=utf-8

{"action":"records.create","token":"<API_TOKEN>","payload":{ ... }}
```

**Response sukses**: `{ "ok": true, "data": <any> }`
**Response gagal**: `{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Odometer wajib diisi", "fields": { "odometer": "wajib" } } }`

**Kode error**: `UNAUTHORIZED`, `BAD_REQUEST`, `UNKNOWN_ACTION`, `VALIDATION_ERROR`, `NOT_FOUND`,
`ODOMETER_LOWER` (bisa dilewati dengan `confirmOdometer: true`), `DUPLICATE`, `LOCK_TIMEOUT`, `INTERNAL_ERROR`.

| Action | Write | Payload | Data respons |
|--------|:-----:|---------|--------------|
| `auth.check` | | – | `{ version }` |
| `settings.get` | | – | `{ version, categories: [...] }` |
| `settings.saveCategory` | ✔ | `{ code, label, sortOrder, active }` | category |
| `motors.list` | | – | `Motor[]` |
| `motors.create` | ✔ | `{ name, brand, model, year, plate, odometerStart }` | Motor (+ buat reminders default) |
| `motors.update` | ✔ | `{ id, ...field }` | Motor |
| `motors.delete` | ✔ | `{ id }` | `{ id }` |
| `motors.updateOdometer` | ✔ | `{ id, odometer }` | Motor (tolak jika < odometerCurrent → `ODOMETER_LOWER`) |
| `records.list` | | `{ motorId, type?, category?, from?, to?, limit=20, offset=0 }` | `{ items: RecordSummary[], total }` |
| `records.get` | | `{ id }` | `Record & { items: Item[] }` |
| `records.create` | ✔ | `{ motorId, date, type, odometer, place, serviceFee, notes, items: ItemInput[], confirmOdometer? }` | Record lengkap |
| `records.update` | ✔ | `{ id, ...sama seperti create }` | Record lengkap (item lama di-soft-delete, item baru di-insert) |
| `records.delete` | ✔ | `{ id }` | `{ id }` (item ikut di-soft-delete) |
| `records.places` | | `{ motorId? }` | `string[]` tempat unik, untuk autocomplete |
| `reminders.list` | | `{ motorId }` | `ReminderWithStatus[]` urut: TERLAMBAT, SEGERA, OK, BELUM_ADA_DATA |
| `reminders.upsert` | ✔ | `{ id?, motorId, category, intervalKm?, intervalDays?, active }` | Reminder |
| `reminders.delete` | ✔ | `{ id }` | `{ id }` |
| `dashboard.get` | | `{ motorId }` | lihat di bawah |
| `reports.monthly` | | `{ motorId, months=12 }` | `[{ month, total }]` |
| `reports.byCategory` | | `{ motorId, year }` | `[{ category, label, total }]` |

`RecordSummary` = Record + `itemCount` + `categories: string[]`.
`dashboard.get` →
```json
{
  "motor": { "...": "..." },
  "lastRecord": { "...": "..." },
  "reminders": [ { "category": "OLI_MESIN", "status": "SEGERA", "remainingKm": 150, "remainingDays": 12 } ],
  "spend": { "thisMonth": 185000, "thisYear": 2450000 }
}
```

Efek samping `records.create/update`: jika `odometer > motor.odometerCurrent`, update `odometerCurrent`
dan `odometerUpdatedAt`. `odometerCurrent` **tidak pernah turun otomatis** (misalnya saat catatan dihapus);
pengguna mengoreksinya lewat `motors.update`.

Validasi `records.create`:
- `GANTI_OLI` wajib ≥ 1 item dengan kategori `OLI_MESIN` atau `OLI_GARDAN`.
- `BELANJA_PART` wajib ≥ 1 item.
- Kategori item harus ada di sheet `categories` dan aktif.
- `ODOMETER_LOWER` jika `odometer` < odometer catatan aktif lain dengan `date` lebih awal, kecuali `confirmOdometer`.

---

## 5. Frontend

### 5.1 Prinsip
- HTML/CSS/JS murni, ES modules, **tanpa framework dan tanpa build step**. Tanpa dependensi CDN.
- Hash routing (`#/...`) agar GitHub Pages tidak butuh 404 fallback.
- Semua teks pengguna dirender via `textContent` atau `escapeHtml()`. Dilarang `innerHTML` dengan data mentah.
- CSP melarang atribut `style="..."` di HTML. Untuk nilai dinamis (misal lebar bar chart) pakai `el.style.width = ...` dari JS.
- Bahasa Indonesia untuk semua label.

### 5.2 Route
| Hash | View | Keterangan |
|------|------|------------|
| `#/login` | login | input token (+ opsi lanjutan: API URL) → `auth.check` |
| `#/` | dashboard | |
| `#/records` | records-list | filter tipe/kategori/tanggal, infinite "Muat lagi" |
| `#/records/new?type=GANTI_OLI` | record-form | `type` opsional |
| `#/records/:id` | record-detail | tombol Edit, Hapus |
| `#/records/:id/edit` | record-form | |
| `#/motors` | motors | daftar, tambah, edit, hapus, update odometer |
| `#/reminders` | reminders | daftar status + edit interval |
| `#/reports` | reports | bar chart CSS bulanan + tabel per kategori |
| `#/settings` | settings | kategori, info versi, tombol Keluar |

Guard: jika tidak ada token → redirect `#/login`. Jika belum ada motor → arahkan ke `#/motors` dengan empty state.

### 5.3 `api.js`
```js
export async function call(action, payload = {}) {
  const res = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: getToken(), payload }),
    redirect: 'follow',
  });
  const json = await res.json();
  if (!json.ok) throw new ApiError(json.error);   // code, message, fields
  return json.data;
}
```
- Timeout 20 detik via `AbortController`.
- `UNAUTHORIZED` → hapus token, redirect `#/login`.
- `ODOMETER_LOWER` → tampilkan confirm; jika ya, kirim ulang dengan `confirmOdometer: true`.
- `getApiUrl()`: `localStorage.motocare_api_url` jika ada, else `API_URL` dari `config.js`.

### 5.4 `state.js`
Menyimpan di `localStorage` dengan prefix `motocare_`: `token`, `api_url`, `active_motor_id`.
Cache di memori (per sesi): `motors`, `categories`. Invalidasi setelah write terkait.

### 5.5 Layout & UI
- **Header**: nama app + dropdown pemilih motor aktif + odometer terkini.
- **Bottom nav (mobile)** / sidebar (≥ 768px): Beranda, Riwayat, **＋ Tambah** (tombol tengah menonjol),
  Pengingat, Lainnya (Motor, Laporan, Pengaturan).
- **Dashboard**: kartu odometer (tombol "Update km"), kartu pengingat (badge warna status),
  kartu biaya bulan ini / tahun ini, kartu catatan terakhir, tombol cepat "Ganti Oli" & "Servis".
- **Form catatan**: segmented control tipe; tanggal default hari ini; odometer default `odometerCurrent`;
  tempat dengan `<datalist>` dari `records.places`; baris item dinamis (kategori, nama, merk, qty, harga,
  subtotal, hapus baris); total live; tipe `GANTI_OLI` otomatis menambah 1 baris `OLI_MESIN`.
  Tombol simpan disable + spinner saat submit (cegah double submit).
- **Status warna**: OK = hijau, SEGERA = kuning/oranye, TERLAMBAT = merah, BELUM_ADA_DATA = abu-abu.
  Selalu sertakan teks status, bukan hanya warna.
- **Tema**: CSS custom properties di `:root`; dukung `prefers-color-scheme: dark`.
- Input angka: `inputmode="numeric"`, tampilan ribuan saat blur.

### 5.6 `index.html` keamanan
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; img-src 'self' data:; style-src 'self';
           script-src 'self'; connect-src https://script.google.com https://script.googleusercontent.com;">
<meta name="referrer" content="no-referrer">
```

---

## 6. CI/CD

### 6.1 Secrets & variables GitHub (diisi manual oleh pemilik)
| Nama | Jenis | Isi |
|------|-------|-----|
| `CLASPRC_JSON` | secret | isi file `~/.clasprc.json` setelah `clasp login` |
| `CLASP_SCRIPT_ID` | secret | Script ID project Apps Script |
| `GAS_DEPLOYMENT_ID` | secret | ID deployment web app (dibuat manual pertama kali) |
| `MOTOCARE_API_URL` | variable | URL `/exec` web app |

### 6.2 `deploy-pages.yml`
- Trigger: push ke `main` dengan perubahan di `frontend/**`, plus `workflow_dispatch`.
- Langkah: checkout → tulis `frontend/js/config.js` berisi `export const API_URL = '${{ vars.MOTOCARE_API_URL }}';`
  → `actions/configure-pages` → `actions/upload-pages-artifact` (path `frontend`) → `actions/deploy-pages`.
- Permissions: `pages: write`, `id-token: write`, `contents: read`. Environment `github-pages`.
- Gunakan versi major terbaru dari action resmi tersebut (cek di GitHub Marketplace saat implementasi).

### 6.3 `deploy-backend.yml`
- Trigger: push ke `main` dengan perubahan di `backend/**`, plus `workflow_dispatch`.
- Langkah:
  1. checkout, setup Node LTS, `npm ci`.
  2. `npm test` (gagal → stop).
  3. Tulis `~/.clasprc.json` dari `secrets.CLASPRC_JSON`.
  4. Tulis `backend/.clasp.json`: `{ "scriptId": "<CLASP_SCRIPT_ID>", "rootDir": "." }`.
  5. `npx clasp push -f` (dari folder `backend`).
  6. `npx clasp deploy --deploymentId "$GAS_DEPLOYMENT_ID" --description "CI ${GITHUB_SHA::7}"`
     → memperbarui deployment yang sama sehingga URL `/exec` tidak berubah.
- **Verifikasi nama perintah/flag dengan `npx clasp --help`** untuk versi clasp yang terpasang;
  beberapa versi mengganti nama perintah deployment. Sesuaikan dan catat di "Catatan Perubahan".

### 6.4 `ci.yml`
- Trigger: `pull_request` dan push ke branch selain `main`. Jalankan `npm ci && npm test`.

### 6.5 `package.json` (root)
```json
{
  "name": "motocare",
  "private": true,
  "scripts": {
    "test": "node --test \"backend/test/**/*.test.js\"",
    "push": "cd backend && clasp push --force",
    "dev:mock": "node scripts/mock-server.js"
  },
  "devDependencies": { "@google/clasp": "<versi terbaru>" }
}
```

### 6.6 `.gitignore`
```
node_modules/
.clasprc.json
backend/.clasp.json
.env
*.local.*
.DS_Store
```

---

## 7. Keamanan (ringkasan)
- Spreadsheet tidak pernah dibagikan publik; hanya Apps Script (sebagai pemilik) yang mengaksesnya.
- Token hanya di Script Properties dan `localStorage` perangkat pengguna. Tidak di repo, tidak di log.
- Semua input divalidasi ulang di backend (tipe, panjang, enum, angka ≥ 0).
- Cegah formula injection: jika string diawali `=`, `+`, `-`, `@`, tambahkan prefix `'` sebelum ditulis ke sheet.
- Output frontend selalu di-escape. CSP ketat tanpa inline script/style.

## 8. Pengujian
- **Unit (otomatis):** `backend/test/logic.test.js` dengan `node:test` + `node:assert` untuk semua fungsi di `logic.js`,
  termasuk kasus batas: tepat di batas km, tepat di batas hari, hanya interval km, hanya interval hari, tanpa data.
- **Manual E2E:** checklist di `task.md` fase 7, dijalankan pada URL GitHub Pages sungguhan.

## 9. Catatan Perubahan
> Agent: tambahkan entri di sini jika menyimpang dari desain. Format: `YYYY-MM-DD — apa — kenapa`.

- 2026-11-03 — Script `test` memakai glob `"backend/test/**/*.test.js"` — Node 22+ tidak menerima path folder untuk `node --test`.
- 2026-11-03 — Tambah `backend/src/util.js` (`nowISO_`, `todayISO_`, `newId_`) — helper yang butuh layanan Apps Script dipisah dari `logic.js` agar `logic.js` tetap murni.
- 2026-11-03 — Tambah `backend/src/dev.js` (`dev_seedDummy`, `dev_benchmark`) — untuk task T6.3; tidak terdaftar di router sehingga tidak bisa dipanggil lewat API.
- 2026-11-03 — Tambah `backend/test/gas-mock.js` + `api.test.js` — mock minimal SpreadsheetApp/PropertiesService/dll. agar seluruh API bisa diuji di Node dan CI tanpa akun Google.
- 2026-11-03 — Tambah `scripts/mock-server.js` (`npm run dev:mock`, kode akses `demo`) — mencoba frontend lokal tanpa Google; CSP `connect-src` dilonggarkan hanya di server ini.
- 2026-11-03 — Status pengingat tambahan `NONAKTIF` untuk aturan dengan `active = FALSE` — diurutkan paling akhir, tidak ditampilkan di dashboard.
- 2026-11-03 — Respons tambahan: `RecordSummary.itemNames` (maks 5 nama item), `dashboard.get` menambah `recordCount` dan `today`, `ReminderWithStatus` menambah `label` dan `lastRecordId` — dibutuhkan UI.
- 2026-11-03 — Konfirmasi `ODOMETER_LOWER` ditangani di `views/record-form.js`, bukan `api.js` — konfirmasi butuh konteks form untuk mengirim ulang payload.
- 2026-11-03 — Tambah route `#/more` (menu Motor/Laporan/Pengaturan di mobile) dan `frontend/js/version.js` (`APP_VERSION` frontend) — `config.js` ditimpa CI sehingga versi tidak boleh disimpan di sana.
- 2026-11-03 — `motors.update` menerima `odometerCurrent` opsional — jalur koreksi odometer sesuai §4.6.
- 2026-11-03 — clasp 3.x: perintah `create-script`, `push --force`, `update-deployment <id>` (pengganti `deploy -i`). Versi action: checkout@v7, setup-node@v7, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5.
- 2026-11-03 — Warna primer mode terang diubah ke `#c2410c` — `#d9480f` gagal kontras WCAG AA (axe-core).
