import { getApiUrl, getToken, clearToken } from './state.js';

const TIMEOUT_MS = 20000;

export class ApiError extends Error {
  constructor({ code = 'INTERNAL_ERROR', message = 'Terjadi kesalahan.', fields = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

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
      if (!location.hash.startsWith('#/login')) location.hash = '#/login';
    }
    throw error;
  }
  return json.data;
}
