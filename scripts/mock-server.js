/**
 * Server lokal untuk mencoba frontend TANPA akun Google.
 * Backend dijalankan di atas mock Apps Script (data di memori, hilang saat server berhenti).
 *
 *   npm run dev:mock          → http://localhost:5173  (kode akses: demo)
 *   npm run dev:mock -- --empty   → tanpa data contoh
 *
 * Hanya untuk pengembangan. CSP index.html dilonggarkan agar fetch ke /api (localhost) diizinkan.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createGasContext } = require('../backend/test/gas-mock.js');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = path.join(__dirname, '..', 'frontend');
const TOKEN = 'demo';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const app = createGasContext();
app.ctx.setup();
app.props.API_TOKEN = TOKEN;

function seed() {
  const call = (action, payload) => {
    const res = app.call(action, payload);
    if (!res.ok) throw new Error(action + ': ' + JSON.stringify(res.error));
    return res.data;
  };
  const shift = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const m = call('motors.create', { name: 'Vario Harian', brand: 'Honda', model: 'Vario 125', year: 2021, plate: 'B 1234 XYZ', odometerStart: 15000 });
  call('motors.create', { name: 'NMAX Touring', brand: 'Yamaha', model: 'NMAX 155', year: 2023, plate: 'D 4321 ABC', odometerStart: 5000 });
  call('records.create', {
    motorId: m.id, date: shift(150), type: 'SERVIS', odometer: 16000, place: 'AHASS Sudirman', serviceFee: 45000,
    items: [{ category: 'FILTER_UDARA', name: 'Filter udara Vario', brand: 'Honda', qty: 1, unitPrice: 65000 }, { category: 'BUSI', name: 'Busi NGK CPR9EA-9', brand: 'NGK', qty: 1, unitPrice: 25000 }],
  });
  call('records.create', {
    motorId: m.id, date: shift(70), type: 'GANTI_OLI', odometer: 17200, place: 'Bengkel Jaya Motor', serviceFee: 0,
    items: [{ category: 'OLI_MESIN', name: 'AHM MPX2 0.8L', brand: 'AHM', qty: 1, unitPrice: 55000 }, { category: 'OLI_GARDAN', name: 'AHM Gear Oil', brand: 'AHM', qty: 1, unitPrice: 17000 }],
  });
  call('records.create', {
    motorId: m.id, date: shift(20), type: 'BELANJA_PART', odometer: 18800, place: 'Tokopedia',
    items: [{ category: 'KAMPAS_REM_DEPAN', name: 'Kampas rem depan', brand: 'Aspira', qty: 1, unitPrice: 48000 }],
    notes: 'Dipasang sendiri',
  });
  call('motors.updateOdometer', { id: m.id, odometer: 19050 });
}

if (!process.argv.includes('--empty')) seed();

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      const out = app.ctx.doPost({ postData: { contents: body } });
      // Simulasi latensi Apps Script agar state loading terlihat.
      setTimeout(() => send(res, 200, out.getContent(), 'application/json'), 250);
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');

  if (url.pathname === '/js/config.js') {
    return send(res, 200, "export const API_URL = '/api';\n", MIME['.js']);
  }

  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(file);
    if (ext === '.html') {
      data = data.toString('utf8').replace(/connect-src [^;"]+/, "connect-src 'self'");
    }
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
});

server.listen(PORT, () => {
  console.log(`MotoCare mock berjalan di http://localhost:${PORT}  (kode akses: ${TOKEN})`);
});
