import { getApiUrl, getToken, clearToken } from './state.js';

const TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor({ code = 'INTERNAL_ERROR', message = 'Terjadi kesalahan.', fields = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

/** Action yang hanya membaca data. Semua action lain dianggap menulis dan mengosongkan cache. */
const READ_ACTIONS = new Set([
  'auth.check', 'settings.get', 'motors.list', 'motors.overview', 'records.list', 'records.get', 'records.places',
  'records.export', 'records.fuelHistory', 'reminders.list', 'dashboard.get', 'reports.monthly', 'reports.byCategory',
  'reports.summary', 'backup.export', 'photos.get', 'batch',
]);
/** Action baca yang hasilnya boleh disimpan di cache perangkat. */
const CACHEABLE = new Set([
  'settings.get', 'motors.list', 'motors.overview', 'records.list', 'records.get', 'records.places', 'records.fuelHistory',
  'reminders.list', 'dashboard.get', 'reports.monthly', 'reports.byCategory', 'reports.summary',
]);
const BATCH_MAX = 12;

/**
 * Panggil backend Apps Script.
 * PENTING: Content-Type text/plain agar browser tidak mengirim preflight OPTIONS
 * (Apps Script tidak mendukung CORS preflight). Jangan tambah header lain.
 */
export async function call(action, payload = {}, { token } = {}) {
  const url = getApiUrl();
  if (!url) {
    throw new ApiError({ code: 'NO_API_URL', message: 'API URL belum diatur. Buka Pengaturan lanjutan di layar login.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: token ?? getToken(), payload }),
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError({ code: 'TIMEOUT', message: 'Server terlalu lama merespons. Periksa koneksi lalu coba lagi.' });
    }
    throw new ApiError({ code: 'NETWORK', message: 'Tidak bisa terhubung ke server. Periksa koneksi internet atau API URL.' });
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError({
      code: 'BAD_RESPONSE',
      message: 'Respons server tidak valid. Pastikan API URL berakhiran /exec dan web app di-deploy dengan akses "Anyone".',
    });
  }

  if (!json.ok) {
    const error = new ApiError(json.error || {});
    if (error.code === 'UNAUTHORIZED' && token === undefined) {
      clearToken();
      clearReadCache();
      if (!location.hash.startsWith('#/login')) location.hash = '#/login';
    }
    throw error;
  }
  if (!READ_ACTIONS.has(action)) clearReadCache();
  return json.data;
}

// =====================================================================
// Cache baca (stale-while-revalidate)
// Data yang pernah dimuat langsung ditampilkan dari perangkat, lalu diperbarui di latar.
// Jika hasil baru berbeda, listener onStale dipanggil agar halaman digambar ulang.
// Setiap action tulis mengosongkan cache sehingga data tidak pernah basi setelah Anda mengubahnya.
// =====================================================================

const STORE_KEY = 'motocare_cache_v1';
const MAX_STORE_CHARS = 1500000;
const FRESH_MS = 20000;

let store = loadStore();
let generation = 0;
let collector = null;
let persistTimer = null;
const inflight = new Map();
const staleListeners = new Set();

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      let entries = Object.entries(store).sort((a, b) => b[1].t - a[1].t);
      let text = JSON.stringify(Object.fromEntries(entries));
      while (text.length > MAX_STORE_CHARS && entries.length > 1) {
        entries = entries.slice(0, Math.floor(entries.length * 0.7));
        text = JSON.stringify(Object.fromEntries(entries));
      }
      localStorage.setItem(STORE_KEY, text);
    } catch {
      try { localStorage.removeItem(STORE_KEY); } catch { /* abaikan */ }
    }
  }, 400);
}

function clean(payload) {
  const out = {};
  Object.keys(payload || {}).sort().forEach((k) => {
    const v = payload[k];
    if (v === undefined || v === null || v === '') return;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? clean(v) : v;
  });
  return out;
}

function keyOf(action, payload) {
  return `${action} ${JSON.stringify(clean(payload))}`;
}

const clone = (d) => (d === undefined ? d : structuredClone(d));

export function clearReadCache() {
  store = {};
  generation += 1;
  inflight.clear();
  try { localStorage.removeItem(STORE_KEY); } catch { /* abaikan */ }
}

/** Kumpulkan key yang dibaca selama satu render (dipakai main.js untuk tahu kapan perlu gambar ulang). */
export function setCollector(set) {
  collector = set;
}

export function onStale(fn) {
  staleListeners.add(fn);
  return () => staleListeners.delete(fn);
}

function emitStale(keys) {
  if (!keys.size) return;
  staleListeners.forEach((fn) => { try { fn(keys); } catch (e) { console.error(e); } });
}

function storeResult(key, data, gen) {
  if (gen !== generation) return false; // cache sudah dikosongkan sejak permintaan dimulai
  const prev = store[key];
  const changed = !prev || JSON.stringify(prev.d) !== JSON.stringify(data);
  store[key] = { t: Date.now(), d: data };
  persist();
  return changed && Boolean(prev);
}

function fetchInto(action, payload, key) {
  if (inflight.has(key)) return inflight.get(key);
  const gen = generation;
  const p = call(action, payload)
    .then((data) => {
      const changed = storeResult(key, data, gen);
      if (changed) emitStale(new Set([key]));
      return data;
    })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/**
 * Baca data dengan cache. Jika ada di cache: kembali seketika dan perbarui di latar bila sudah > 20 detik.
 * Jika belum: ambil dari server.
 */
export async function read(action, payload = {}, { fresh = FRESH_MS } = {}) {
  if (!CACHEABLE.has(action)) return call(action, payload);
  const key = keyOf(action, payload);
  if (collector) collector.add(key);
  const entry = store[key];
  if (entry) {
    if (Date.now() - entry.t > fresh) fetchInto(action, payload, key).catch(() => {});
    return clone(entry.d);
  }
  return clone(await fetchInto(action, payload, key));
}

/**
 * Baca beberapa action sekaligus: yang ada di cache langsung, sisanya dalam SATU request batch.
 * calls = [[action, payload], ...] → array data sesuai urutan.
 */
export async function readMany(calls) {
  const results = new Array(calls.length);
  const missing = [];
  calls.forEach(([action, payload = {}], i) => {
    const key = keyOf(action, payload);
    if (CACHEABLE.has(action)) {
      if (collector) collector.add(key);
      const entry = store[key];
      if (entry) {
        results[i] = clone(entry.d);
        if (Date.now() - entry.t > FRESH_MS) missing.push({ i, action, payload, key, background: true });
        return;
      }
      if (inflight.has(key)) { missing.push({ i, action, payload, key, pending: inflight.get(key) }); return; }
    }
    missing.push({ i, action, payload, key });
  });

  const background = missing.filter((m) => m.background);
  const pending = missing.filter((m) => m.pending);
  const needed = missing.filter((m) => !m.background && !m.pending);
  if (background.length) runBatch(background).catch(() => {});

  await Promise.all([
    ...pending.map(async (m) => { results[m.i] = clone(await m.pending); }),
    needed.length ? runBatch(needed).then((out) => {
      needed.forEach((m, j) => {
        if (!out[j].ok) throw new ApiError(out[j].error);
        results[m.i] = clone(out[j].data);
      });
    }) : null,
  ]);
  return results;
}

// Backend lama (< v0.4) belum punya action "batch": jatuh ke panggilan satu per satu.
let batchSupported = true;

async function callOne(c) {
  try {
    return { ok: true, data: await call(c.action, c.payload) };
  } catch (err) {
    if (!(err instanceof ApiError) || ['NETWORK', 'TIMEOUT', 'BAD_RESPONSE', 'NO_API_URL', 'UNAUTHORIZED'].includes(err.code)) throw err;
    return { ok: false, error: { code: err.code, message: err.message, fields: err.fields } };
  }
}

async function runBatch(list) {
  const gen = generation;
  const all = [];
  for (let s = 0; s < list.length; s += BATCH_MAX) {
    const chunk = list.slice(s, s + BATCH_MAX);
    let out = null;
    if (chunk.length > 1 && batchSupported) {
      try {
        out = await call('batch', { calls: chunk.map((c) => ({ action: c.action, payload: c.payload })) });
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== 'UNKNOWN_ACTION') throw err;
        batchSupported = false;
        console.warn('Backend belum mendukung action "batch" (versi lama). Memakai panggilan terpisah.');
      }
    }
    if (!out) out = await Promise.all(chunk.map(callOne));
    all.push(...out);
  }
  const changed = new Set();
  list.forEach((m, i) => {
    if (all[i].ok && CACHEABLE.has(m.action) && storeResult(m.key, all[i].data, gen)) changed.add(m.key);
  });
  emitStale(changed);
  return all;
}

/** Muat data beberapa halaman di latar (satu request) agar pindah tab terasa instan. */
export function prefetch(calls) {
  const list = calls
    .map(([action, payload = {}]) => ({ action, payload, key: keyOf(action, payload) }))
    .filter((m) => CACHEABLE.has(m.action) && !inflight.has(m.key) && !(store[m.key] && Date.now() - store[m.key].t < FRESH_MS));
  if (!list.length) return Promise.resolve();
  return runBatch(list).catch(() => {});
}
