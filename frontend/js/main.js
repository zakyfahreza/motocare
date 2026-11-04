import { h, mount as mountEl } from './utils/dom.js';
import { formatNumber } from './utils/format.js';
import { startRouter, matchRoute, navigate } from './router.js';
import { loadingView, errorState, emptyState } from './ui/components.js';
import { icon } from './ui/icons.js';
import { applyTheme } from './theme.js';
import { getToken, loadBase, getMotors, getActiveMotor, setActiveMotorId, getBackendVersion } from './state.js';
import { APP_VERSION } from './version.js';
import { toast } from './ui/components.js';
import { onStale, prefetch, setCollector } from './api.js';
import { loadPhotos } from './photos.js';

import * as LoginView from './views/login.js';
import * as DashboardView from './views/dashboard.js';
import * as RecordsListView from './views/records-list.js';
import * as RecordFormView from './views/record-form.js';
import * as RecordDetailView from './views/record-detail.js';
import * as MotorsView from './views/motors.js';
import * as MotorFormView from './views/motor-form.js';
import * as RemindersView from './views/reminders.js';
import * as ReportsView from './views/reports.js';
import * as SettingsView from './views/settings.js';
import * as CategoriesView from './views/categories.js';
import * as MoreView from './views/more.js';
import * as HelpView from './views/help.js';

applyTheme();

const NotFoundView = {
  async render({ mount }) {
    mount(emptyState({ iconName: 'help', title: 'Halaman tidak ditemukan', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Ke beranda') }));
  },
};

/**
 * label = subjudul di header. full = halaman layar penuh (header dengan tombol kembali, tanpa navigasi bawah).
 */
const routes = [
  { path: '/login', view: LoginView, public: true },
  { path: '/', view: DashboardView, nav: 'home', label: 'Beranda', needsMotor: true },
  { path: '/records', view: RecordsListView, nav: 'records', label: 'Riwayat', needsMotor: true },
  { path: '/records/new', view: RecordFormView, nav: 'new', needsMotor: true, form: true, full: { title: 'Tambah Catatan', back: '#/' } },
  { path: '/records/:id', view: RecordDetailView, nav: 'records', label: 'Detail Catatan' },
  { path: '/records/:id/edit', view: RecordFormView, nav: 'records', form: true, full: { title: 'Edit Catatan', back: '#/records' } },
  { path: '/motors', view: MotorsView, nav: 'more', label: 'Garasi' },
  { path: '/motors/new', view: MotorFormView, nav: 'more', form: true, full: { title: 'Tambah Motor', back: '#/motors', close: true } },
  { path: '/motors/:id/edit', view: MotorFormView, nav: 'more', form: true, full: { title: 'Edit Motor', back: '#/motors', close: true } },
  { path: '/reminders', view: RemindersView, nav: 'reminders', label: 'Pengingat', needsMotor: true },
  { path: '/reports', view: ReportsView, nav: 'more', label: 'Laporan Pengeluaran', needsMotor: true },
  { path: '/settings', view: SettingsView, nav: 'more', label: 'Pengaturan' },
  { path: '/settings/categories', view: CategoriesView, nav: 'more', label: 'Kategori', full: { title: 'Kategori Item', back: '#/settings' } },
  { path: '/more', view: MoreView, nav: 'more', label: 'Lainnya' },
  { path: '/help', view: HelpView, nav: 'more', label: 'Bantuan', full: { title: 'Pusat Bantuan', back: '#/more' } },
];

const appEl = document.getElementById('app');
const headerEl = document.getElementById('app-header');
const navEl = document.getElementById('app-nav');

let renderSeq = 0;
let loadingTimer = null;
let lastLocation = null;
let currentRoute = null;

// ---------- Navigasi bawah ----------

function navItem(key, href, iconName, label) {
  return h('a', { class: 'nav-item', href, dataset: { nav: key } }, icon(iconName, 24), h('span', null, label));
}

navEl.appendChild(h('div', { class: 'nav-inner' },
  navItem('home', '#/', 'two_wheeler', 'Beranda'),
  navItem('records', '#/records', 'history', 'Riwayat'),
  h('a', { class: 'nav-add', href: '#/records/new', dataset: { nav: 'new' }, 'aria-label': 'Tambah catatan' },
    h('span', { class: 'nav-add-btn' }, icon('add', 30)),
    h('span', null, 'Tambah'),
  ),
  navItem('reminders', '#/reminders', 'notification_important', 'Pengingat'),
  navItem('more', '#/more', 'more_horiz', 'Lainnya'),
));

function setNav(key) {
  navEl.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------- Header ----------

let internalNavs = 0;

/** Kembali ke halaman sebelumnya di dalam aplikasi; jika dibuka langsung, ke fallback. */
function goBack(fallback) {
  if (internalNavs > 1) history.back();
  else navigate(fallback.replace(/^#/, ''), { replace: true });
}

export function updateHeader() {
  const route = currentRoute;
  if (!route || route.public) return;
  if (route.full) {
    headerEl.replaceChildren(h('div', { class: 'header-bar' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kembali', onclick: () => goBack(route.full.back) }, icon('arrow_back', 24)),
      h('img', { class: 'brand-mark', src: 'assets/logo-mark.png', alt: '', width: '36', height: '36' }),
      h('span', { class: 'page-title-center truncate' }, route.full.title),
      route.full.close
        ? h('a', { class: 'icon-btn', href: route.full.back, 'aria-label': 'Tutup' }, icon('close', 24))
        : h('a', { class: 'avatar', href: '#/settings', 'aria-label': 'Pengaturan' }, icon('person', 20)),
    ));
    return;
  }

  const motors = getMotors();
  const active = getActiveMotor();
  let pill = null;
  if (active) {
    const select = h('select', { 'aria-label': 'Pilih motor aktif' },
      motors.map((m) => h('option', { value: m.id, selected: m.id === active.id }, m.name)),
    );
    select.addEventListener('change', () => {
      setActiveMotorId(select.value);
      updateHeader();
      rerender();
    });
    pill = h('div', { class: 'motor-pill' },
      h('span', { class: 'motor-pill-name' }, h('span', null, active.name), icon('expand_more', 16)),
      h('span', { class: 'motor-pill-km' }, `${formatNumber(active.odometerCurrent)} km`),
      select,
    );
  }
  headerEl.replaceChildren(h('div', { class: 'header-bar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'MotoCare, ke beranda' },
      h('img', { class: 'brand-mark', src: 'assets/logo-mark.png', alt: '', width: '36', height: '36' }),
      h('span', { class: 'brand-text' },
        h('span', { class: 'brand-name' }, 'MotoCare'),
        h('span', { class: 'brand-sub truncate' }, route.label || ''),
      ),
    ),
    h('div', { class: 'header-actions' },
      pill,
      h('a', { class: 'avatar', href: '#/settings', 'aria-label': 'Pengaturan' }, icon('person', 20)),
    ),
  ));
}

function setChrome(route) {
  const chrome = !route.public;
  headerEl.hidden = !chrome;
  navEl.hidden = !chrome || Boolean(route.full);
  appEl.classList.toggle('no-chrome', !chrome);
  appEl.classList.toggle('no-nav', chrome && Boolean(route.full));
  setNav(route.nav);
}

export function rerender() {
  if (lastLocation) handleRoute(lastLocation, { silent: true });
}

// ---------- Kecepatan: gambar ulang diam-diam saat data di latar berubah, dan prefetch tab utama ----------

let currentKeys = new Set();
let staleTimer = null;
onStale((keys) => {
  if (!currentRoute || currentRoute.public || currentRoute.form) return;
  if (![...keys].some((k) => currentKeys.has(k))) return;
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    // Jangan ganggu pengguna yang sedang membuka dialog atau mengetik.
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (document.querySelector('dialog[open]') || typing) return;
    rerender();
  }, 150);
});

/** Peringatan sekali per sesi jika backend Apps Script lebih lama dari aplikasi (deployment belum diperbarui). */
let versionWarned = false;
function warnIfBackendOutdated() {
  if (versionWarned) return;
  const backend = getBackendVersion();
  if (!backend) return;
  const [a1, a2] = APP_VERSION.split('.').map(Number);
  const [b1, b2] = backend.split('.').map(Number);
  if (b1 < a1 || (b1 === a1 && b2 < a2)) {
    versionWarned = true;
    toast(`Backend Apps Script masih v${backend}, aplikasi v${APP_VERSION}. Fitur baru (foto Drive, Bensin, Ban) belum aktif sampai deployment diperbarui.`, 'error', 9000);
  }
}

let prefetchTimer = null;
function schedulePrefetch() {
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    const m = getActiveMotor();
    if (!m || !getToken()) return;
    const year = new Date().getFullYear();
    prefetch([
      ['dashboard.get', { motorId: m.id }],
      ['records.list', { motorId: m.id, limit: 20, offset: 0 }],
      ['reminders.list', { motorId: m.id }],
      ['motors.overview'],
      ['reports.summary', { motorId: m.id, year }],
      ['records.places', { motorId: m.id }],
      ['records.fuelHistory', { motorId: m.id }],
    ]);
    loadPhotos(getMotors()).catch(() => {});
  }, 600);
}

async function handleRoute(loc, { silent = false } = {}) {
  lastLocation = loc;
  const seq = ++renderSeq;
  const isCurrent = () => seq === renderSeq;
  const mount = (...nodes) => {
    if (!isCurrent()) return false;
    clearTimeout(loadingTimer);
    const scroll = silent ? window.scrollY : 0;
    mountEl(appEl, ...nodes);
    if (silent) window.scrollTo(0, scroll);
    return true;
  };

  const matched = matchRoute(routes, loc.path);
  const route = matched ? matched.route : { view: NotFoundView, label: '' };
  const params = matched ? matched.params : {};

  if (!route.public && !getToken()) {
    navigate('/login', { replace: true });
    return;
  }

  currentRoute = route;
  setChrome(route);
  updateHeader();
  // Tampilkan indikator memuat hanya jika data belum ada di perangkat (lebih dari 120 ms).
  clearTimeout(loadingTimer);
  if (!silent) loadingTimer = setTimeout(() => { if (isCurrent()) mountEl(appEl, loadingView()); }, 120);
  const keys = new Set();
  setCollector(keys);
  if (!silent) currentKeys = keys;

  try {
    let motor = null;
    if (!route.public) {
      await loadBase();
      if (!isCurrent()) return;
      warnIfBackendOutdated();
      updateHeader();
      motor = getActiveMotor();
      if (route.needsMotor && !motor) {
        mount(emptyState({
          iconName: 'two_wheeler',
          title: 'Belum ada motor',
          text: 'Tambahkan motor pertama Anda untuk mulai mencatat servis dan belanja part.',
          action: h('a', { class: 'btn btn-primary', href: '#/motors/new' }, icon('add', 20), 'Tambah motor'),
        }));
        return;
      }
    }
    await route.view.render({ params, query: loc.query, motor, mount, isCurrent, refresh: rerender, updateHeader });
    if (isCurrent()) {
      currentKeys = keys;
      const heading = appEl.querySelector('h1');
      if (!silent && heading && document.activeElement === document.body) heading.focus({ preventScroll: true });
      if (!route.public && !route.form) schedulePrefetch();
      else clearTimeout(prefetchTimer);
    }
  } catch (err) {
    if (!isCurrent()) return;
    if (err && err.code === 'UNAUTHORIZED') return; // api.js sudah mengarahkan ke login
    console.error(err);
    mount(errorState(err, () => handleRoute(loc)));
  } finally {
    if (isCurrent()) { setCollector(null); clearTimeout(loadingTimer); }
  }
}

startRouter((loc) => {
  internalNavs += 1;
  window.scrollTo(0, 0);
  handleRoute(loc);
});
