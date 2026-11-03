import { API_URL } from './config.js';
import { call } from './api.js';

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

const cache = { motors: null, categories: null, backendVersion: null };

export function resetCache() {
  cache.motors = null;
  cache.categories = null;
  cache.backendVersion = null;
}

export function invalidateMotors() {
  cache.motors = null;
}

export function invalidateCategories() {
  cache.categories = null;
}

export async function loadMotors(force = false) {
  if (!cache.motors || force) cache.motors = await call('motors.list');
  return cache.motors;
}

export function getMotors() {
  return cache.motors || [];
}

export async function loadSettings(force = false) {
  if (!cache.categories || force) {
    const s = await call('settings.get');
    cache.categories = s.categories;
    cache.backendVersion = s.version;
  }
  return { categories: cache.categories, version: cache.backendVersion };
}

export async function loadCategories(force = false) {
  return (await loadSettings(force)).categories;
}

export function categoryLabel(code) {
  if (code === 'JASA') return 'Jasa Servis';
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
  if (found) return found;
  setActiveMotorId(motors[0].id);
  return motors[0];
}

export function signOut() {
  clearToken();
  resetCache();
}
