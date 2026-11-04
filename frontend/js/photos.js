import { call } from './api.js';
import { h } from './utils/dom.js';
import { icon } from './ui/icons.js';
import { toastError } from './ui/components.js';

/**
 * Foto motor: dikompres di perangkat (JPEG) lalu disimpan lewat API ke spreadsheet.
 * Batas server 240.000 karakter data URL (~175 KB gambar). Target di bawahnya agar aman.
 */
const MAX_CHARS = 230000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SIZES = [1280, 1024, 860, 720, 560];
const QUALITIES = [0.82, 0.72, 0.62, 0.52];

const cache = new Map(); // motorId → { v: photoUpdatedAt, url }

export function cachedPhoto(motor) {
  if (!motor || !motor.photoUpdatedAt) return null;
  const c = cache.get(motor.id);
  return c && c.v === motor.photoUpdatedAt ? c.url : null;
}

/** Ambil foto motor yang belum ada di cache. Mengembalikan { motorId: dataUrl }. */
export async function loadPhotos(motors) {
  const list = (motors || []).filter(Boolean);
  const need = list.filter((m) => m.photoUpdatedAt && !cachedPhoto(m)).map((m) => m.id);
  if (need.length) {
    const res = await call('motors.getPhotos', { ids: need });
    list.forEach((m) => { if (res[m.id]) cache.set(m.id, { v: m.photoUpdatedAt, url: res[m.id] }); });
  }
  const out = {};
  list.forEach((m) => { const url = cachedPhoto(m); if (url) out[m.id] = url; });
  return out;
}

export async function savePhoto(motorId, dataUrl) {
  const res = await call('motors.setPhoto', { id: motorId, dataUrl });
  cache.set(motorId, { v: res.photoUpdatedAt, url: dataUrl });
  return res;
}

export async function deletePhoto(motorId) {
  await call('motors.removePhoto', { id: motorId });
  cache.delete(motorId);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.')); };
    img.src = url;
  });
}

/** Kompres file gambar menjadi data URL JPEG ≤ MAX_CHARS. Orientasi EXIF diikuti oleh browser. */
export async function compressImage(file) {
  if (!file) throw new Error('Tidak ada foto yang dipilih.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('File yang dipilih bukan gambar.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Ukuran foto maksimal 25 MB.');
  const img = await loadImage(file);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error('Foto tidak bisa dibaca.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  for (const size of SIZES) {
    const scale = Math.min(1, size / Math.max(w0, h0));
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    ctx.fillStyle = '#ffffff'; // latar putih untuk PNG transparan
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of QUALITIES) {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      if (dataUrl.length <= MAX_CHARS) return dataUrl;
    }
  }
  throw new Error('Foto terlalu rumit untuk dikompres. Coba foto lain.');
}

/** Tombol tersembunyi untuk memilih file (galeri) atau kamera. */
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

/**
 * Komponen pemilih foto untuk form motor.
 * state(): { action: 'keep' | 'set' | 'remove', dataUrl }
 */
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
      const dataUrl = await compressImage(file);
      pending = dataUrl;
      action = 'set';
      current = dataUrl;
      render();
      status.textContent = `Foto siap (${Math.round((dataUrl.length * 0.75) / 1024)} KB). Tersimpan saat Anda menekan Simpan.`;
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
    h('span', { class: 't-sm' }, 'JPG, PNG, atau WEBP · dikompres otomatis'),
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
