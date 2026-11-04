/**
 * Menulis frontend/js/config.js dari environment variable MOTOCARE_API_URL.
 * Dipakai sebagai "Build Command" di Vercel (lihat vercel.json).
 * Jangan jalankan di repo lokal kecuali untuk uji; file config.js di repo harus tetap API_URL = ''.
 */
const fs = require('node:fs');
const path = require('node:path');

const url = (process.env.MOTOCARE_API_URL || '').trim();
const target = path.join(__dirname, '..', 'frontend', 'js', 'config.js');

if (!url) {
  console.warn('PERINGATAN: MOTOCARE_API_URL kosong. Pengguna harus mengisi API URL di layar login → Pengaturan lanjutan.');
} else if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
  console.error(`MOTOCARE_API_URL tidak valid: "${url}". Harus berbentuk https://script.google.com/macros/s/<ID>/exec`);
  process.exit(1);
}

fs.writeFileSync(target, `// Dibuat otomatis saat build (scripts/write-config.js)\nexport const API_URL = ${JSON.stringify(url)};\n`);
console.log(`config.js ditulis. API_URL = ${url ? url.replace(/(\/s\/.{6}).+(.{4}\/exec)$/, '$1…$2') : '(kosong)'}`);
