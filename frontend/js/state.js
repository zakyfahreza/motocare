import { API_URL } from './config.js';
import { read as readApi, readMany, clearReadCache } from './api.js';

const PREFIX = 'motocare_';

function read(key) {
  try { return localStorage.getItem(PREFIX + key) || ''; } catch { return ''; }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(PREFIX + key, value);
    else localStorage.removeItem(PREFIX + key);
  } catch { /* storage diblokir: abaikan */ }
}

// ---------- token & API URL ----------

export const getToken = () => read('token');
export const setToken = (t) => write('token', t);
export const clearToken = () => write('token', '');

export const getStoredApiUrl = () => read('api_url');
export const setStoredApiUrl = (u) => write('api_url', u);
export const getApiUrl = () => getStoredApiUrl() || API_URL;
export const getDefaultApiUrl = () => API_URL;

// ---------- cache per sesi ----------

// Salinan terakhir di memori agar header bisa dibaca secara sinkron.
// Sumber datanya cache baca di api.js (tersimpan di perangkat, diperbarui di latar).
const cache = { motors: null, categories: null, backendVersion: null, photoFolderUrl: '' };

export function resetCache() {
  cache.motors = null;
  cache.categories = null;
  cache.backendVersion = null;
  clearReadCache();
}

// Dipertahankan untuk kompatibilitas: setiap action tulis sudah mengosongkan cache di api.js.
export function invalidateMotors() {}
export function invalidateCategories() {}

function applySettings(s) {
  cache.categories = s.categories;
  cache.backendVersion = s.version;
  cache.photoFolderUrl = s.photoFolderUrl || '';
}

/** Motor + pengaturan dalam satu request (atau langsung dari cache). */
export async function loadBase() {
  const [motors, settings] = await readMany([['motors.list'], ['settings.get']]);
  cache.motors = motors;
  applySettings(settings);
}

export async function loadMotors() {
  cache.motors = await readApi('motors.list');
  return cache.motors;
}

export function getBackendVersion() {
  return cache.backendVersion || '';
}

export function getMotors() {
  return cache.motors || [];
}

export async function loadSettings() {
  applySettings(await readApi('settings.get'));
  return { categories: cache.categories, version: cache.backendVersion, photoFolderUrl: cache.photoFolderUrl };
}

export async function loadCategories() {
  return (await loadSettings()).categories;
}

const SYSTEM_LABELS = { JASA: 'Jasa Servis', BBM: 'Bahan Bakar (BBM)' };

export function categoryLabel(code) {
  if (SYSTEM_LABELS[code]) return SYSTEM_LABELS[code];
  const c = (cache.categories || []).find((x) => x.code === code);
  return c ? c.label : code;
}

// ---------- motor aktif ----------

export function getActiveMotorId() {
  return read('active_motor_id');
}

export function setActiveMotorId(id) {
  write('active_motor_id', id);
}

/** Motor aktif dari cache. Jika id tersimpan tidak valid, pakai motor pertama. */
export function getActiveMotor() {
  const motors = getMotors();
  if (!motors.length) return null;
  const found = motors.find((m) => m.id === getActiveMotorId());
  // Jangan menimpa pilihan tersimpan: daftar di memori bisa saja belum memuat motor yang baru dibuat.
  return found || motors[0];
}

export function signOut() {
  clearToken();
  resetCache();
}
