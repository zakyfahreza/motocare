import { call } from './api.js';
import { h } from './utils/dom.js';
import { icon } from './ui/icons.js';
import { toastError } from './ui/components.js';

/**
 * Foto disimpan sebagai file di Google Drive (lewat backend).
 * Setiap foto punya ID file yang tidak pernah berubah, jadi aman disimpan permanen di perangkat (IndexedDB)
 * → setelah dimuat sekali, foto tampil instan tanpa memanggil server lagi.
 */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PROFILES = {
  motor: { maxChars: 300000, sizes: [1280, 1024, 860, 720], qualities: [0.82, 0.72, 0.62] },
  // Nota perlu tetap terbaca: resolusi lebih besar.
  nota: { maxChars: 600000, sizes: [1800, 1600, 1280, 1024], qualities: [0.8, 0.7, 0.6] },
};
const FETCH_CHUNK = 10;

// ---------- cache perangkat ----------

const memory = new Map();
const DB_NAME = 'motocare';
const DB_STORE = 'photos';
let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

async function idbGetMany(ids) {
  const db = await openDb();
  if (!db) return {};
  return new Promise((resolve) => {
    const out = {};
    const tx = db.transaction(DB_STORE, 'readonly');
    const st = tx.objectStore(DB_STORE);
    ids.forEach((id) => {
      const r = st.get(id);
      r.onsuccess = () => { if (r.result) out[id] = r.result; };
    });
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => resolve(out);
  });
}

async function idbPut(map) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    Object.entries(map).forEach(([k, v]) => tx.objectStore(DB_STORE).put(v, k));
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

/** Hapus semua foto tersimpan di perangkat (dipanggil saat keluar). */
export async function clearPhotoCache() {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

export function cachedPhotoById(id) {
  return id ? memory.get(id) || null : null;
}

/** Ambil foto berdasarkan ID file Drive: memori → IndexedDB → server. Mengembalikan { id: dataUrl }. */
export async function loadPhotoIds(ids) {
  const want = Array.from(new Set((ids || []).filter(Boolean)));
  const out = {};
  const missing = [];
  want.forEach((id) => { if (memory.has(id)) out[id] = memory.get(id); else missing.push(id); });
  if (missing.length) {
    const stored = await idbGetMany(missing);
    Object.entries(stored).forEach(([id, url]) => { memory.set(id, url); out[id] = url; });
  }
  const remote = missing.filter((id) => !out[id]);
  for (let i = 0; i < remote.length; i += FETCH_CHUNK) {
    const res = await call('photos.get', { ids: remote.slice(i, i + FETCH_CHUNK) });
    Object.entries(res).forEach(([id, url]) => { memory.set(id, url); out[id] = url; });
    idbPut(res);
  }
  return out;
}

/** Foto motor: { motorId: dataUrl } untuk motor yang punya foto. */
export async function loadPhotos(motors) {
  const list = (motors || []).filter((m) => m && m.photoFileId);
  const byFile = await loadPhotoIds(list.map((m) => m.photoFileId));
  const out = {};
  list.forEach((m) => { if (byFile[m.photoFileId]) out[m.id] = byFile[m.photoFileId]; });
  return out;
}

/** Foto motor yang sudah ada di memori (tanpa menunggu). */
export function cachedPhoto(motor) {
  return motor && motor.photoFileId ? cachedPhotoById(motor.photoFileId) : null;
}

export async function savePhoto(motorId, dataUrl) {
  const res = await call('motors.setPhoto', { id: motorId, dataUrl });
  memory.set(res.photoFileId, dataUrl);
  idbPut({ [res.photoFileId]: dataUrl });
  return res;
}

export async function deletePhoto(motorId) {
  await call('motors.removePhoto', { id: motorId });
}

/** Simpan foto yang baru diunggah ke cache perangkat (dipanggil setelah catatan tersimpan). */
export function rememberPhotos(map) {
  Object.entries(map).forEach(([id, url]) => memory.set(id, url));
  idbPut(map);
}

// ---------- kompresi ----------

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.')); };
    img.src = url;
  });
}

/** Kompres file gambar menjadi data URL JPEG. profile: 'motor' | 'nota'. */
export async function compressImage(file, profile = 'motor') {
  const cfg = PROFILES[profile] || PROFILES.motor;
  if (!file) throw new Error('Tidak ada foto yang dipilih.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('File yang dipilih bukan gambar.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Ukuran foto maksimal 25 MB.');
  const img = await loadImage(file);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error('Foto tidak bisa dibaca.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  for (const size of cfg.sizes) {
    const scale = Math.min(1, size / Math.max(w0, h0));
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of cfg.qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      if (dataUrl.length <= cfg.maxChars) return dataUrl;
    }
  }
  throw new Error('Foto terlalu rumit untuk dikompres. Coba foto lain.');
}

/** Input file tersembunyi untuk galeri dan kamera. */
export function fileInputs(onFile) {
  const make = (capture) => {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true, capture: capture ? 'environment' : null, tabindex: '-1', 'aria-hidden': 'true' });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) onFile(file);
    });
    return input;
  };
  return { gallery: make(false), camera: make(true) };
}

/** Pemilih foto motor untuk form motor. state(): { action: 'keep' | 'set' | 'remove', dataUrl } */
export function photoPicker({ url = null } = {}) {
  let current = url;
  let action = 'keep';
  let pending = null;

  const img = h('img', { alt: 'Foto motor', hidden: !current });
  if (current) img.src = current;
  const status = h('span', { class: 't-sm', role: 'status', 'aria-live': 'polite' });
  const inputs = fileInputs(async (file) => {
    status.textContent = 'Memproses foto…';
    root.classList.add('is-busy');
    try {
      const dataUrl = await compressImage(file, 'motor');
      pending = dataUrl;
      action = 'set';
      current = dataUrl;
      render();
      status.textContent = `Foto siap (${Math.round((dataUrl.length * 0.75) / 1024)} KB). Disimpan ke Google Drive saat Anda menekan Simpan.`;
    } catch (err) {
      status.textContent = '';
      toastError(err);
    } finally {
      root.classList.remove('is-busy');
    }
  });

  const galleryBtn = h('button', { type: 'button', class: 'btn btn-sm photo-btn', onclick: () => inputs.gallery.click() }, icon('photo_library', 18), 'Galeri');
  const cameraBtn = h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => inputs.camera.click() }, icon('photo_camera', 18), 'Kamera');
  const removeBtn = h('button', {
    type: 'button', class: 'btn btn-sm photo-btn c-late',
    onclick: () => { current = null; pending = null; action = url ? 'remove' : 'keep'; render(); status.textContent = url ? 'Foto akan dihapus saat Anda menekan Simpan.' : ''; },
  }, icon('delete', 18), 'Hapus');

  const empty = h('div', { class: 'photo-empty' },
    h('span', { class: 'photo-empty-icon' }, icon('add_a_photo', 28)),
    h('span', { class: 't-label' }, 'Pilih foto atau jepret langsung'),
    h('span', { class: 't-sm' }, 'Disimpan di folder Google Drive Anda'),
  );
  const actions = h('div', { class: 'photo-actions' }, galleryBtn, cameraBtn, removeBtn);
  const root = h('div', { class: 'photo-picker' }, img, empty, h('div', { class: 'photo-spinner', 'aria-hidden': 'true' }, h('span', { class: 'spinner' })), actions, inputs.gallery, inputs.camera);

  function render() {
    const has = Boolean(current);
    img.hidden = !has;
    if (has) img.src = current; else img.removeAttribute('src');
    empty.hidden = has;
    removeBtn.hidden = !has;
    galleryBtn.lastChild.textContent = has ? 'Ganti' : 'Galeri';
    root.classList.toggle('has-photo', has);
  }
  render();

  return {
    el: h('div', null, root, h('div', { class: 'mt-8 c-2' }, status)),
    state: () => ({ action, dataUrl: pending }),
  };
}

/**
 * Lampiran foto nota/part (maks `max`). existing = [{ id, url }].
 * value(): [{ id }] untuk foto lama yang dipertahankan, [{ dataUrl }] untuk foto baru.
 */
export function attachmentPicker({ existing = [], max = 2, hint = '' } = {}) {
  const list = existing.map((e) => ({ id: e.id, url: e.url }));
  const grid = h('div', { class: 'attach-grid' });
  const status = h('div', { class: 't-sm c-2', role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true, multiple: true, tabindex: '-1', 'aria-hidden': 'true' });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []).slice(0, max - list.length);
    input.value = '';
    if (!files.length) return;
    status.textContent = 'Memproses foto…';
    for (const file of files) {
      try {
        const dataUrl = await compressImage(file, 'nota');
        list.push({ dataUrl, url: dataUrl });
      } catch (err) { toastError(err); }
    }
    status.textContent = '';
    render();
  });

  function render() {
    const tiles = list.map((p, i) => h('div', { class: 'attach-tile' },
      h('img', { src: p.url || '', alt: `Foto ${i + 1}` }),
      !p.url ? h('span', { class: 'attach-loading' }, h('span', { class: 'spinner' })) : null,
      h('button', { type: 'button', class: 'attach-remove', 'aria-label': `Hapus foto ${i + 1}`, onclick: () => { list.splice(i, 1); render(); } }, icon('close', 16)),
    ));
    const add = list.length < max
      ? h('button', { type: 'button', class: 'attach-add', onclick: () => input.click() }, icon('add_a_photo', 24), h('span', null, 'Tambah'))
      : null;
    grid.replaceChildren(add, ...tiles, hint && list.length === 0 ? h('div', { class: 'attach-hint' }, icon('receipt', 20), h('span', null, hint)) : '');
  }
  render();

  // Muat gambar foto lama (dari cache perangkat atau Drive).
  const pendingIds = list.filter((p) => p.id && !p.url).map((p) => p.id);
  if (pendingIds.length) {
    loadPhotoIds(pendingIds).then((map) => {
      list.forEach((p) => { if (p.id && map[p.id]) p.url = map[p.id]; });
      render();
    }).catch(() => {});
  }

  return {
    el: h('div', null, grid, status, input),
    value: () => list.map((p) => (p.id ? { id: p.id } : { dataUrl: p.dataUrl })),
    newPhotos: () => list.filter((p) => !p.id).map((p) => p.dataUrl),
  };
}
