import { h, mount as mountEl } from './utils/dom.js';
import { formatKm } from './utils/format.js';
import { startRouter, matchRoute, navigate } from './router.js';
import { loadingView, errorState, emptyState, pageHead } from './ui/components.js';
// pageHead dipakai oleh MoreView di bawah.
import { getToken, loadMotors, loadSettings, getMotors, getActiveMotor, setActiveMotorId } from './state.js';

import * as LoginView from './views/login.js';
import * as DashboardView from './views/dashboard.js';
import * as RecordsListView from './views/records-list.js';
import * as RecordFormView from './views/record-form.js';
import * as RecordDetailView from './views/record-detail.js';
import * as MotorsView from './views/motors.js';
import * as RemindersView from './views/reminders.js';
import * as ReportsView from './views/reports.js';
import * as SettingsView from './views/settings.js';

const MoreView = {
  async render({ mount }) {
    const item = (href, icon, label, sub) =>
      h('li', null, h('a', { href }, h('span', { 'aria-hidden': 'true' }, icon), h('span', null, label, h('div', { class: 'list-sub' }, sub))));
    mount(
      pageHead('Lainnya'),
      h('div', { class: 'card' }, h('ul', { class: 'list menu-list' },
        item('#/motors', '🏍', 'Motor', 'Tambah, ubah, pilih motor aktif'),
        item('#/reports', '▤', 'Laporan', 'Biaya per bulan dan per kategori'),
        item('#/settings', '⚙', 'Pengaturan', 'Kategori, versi, keluar'),
      )),
    );
  },
};

const NotFoundView = {
  async render({ mount }) {
    mount(emptyState({ icon: '🧭', title: 'Halaman tidak ditemukan', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Ke beranda') }));
  },
};

const routes = [
  { path: '/login', view: LoginView, public: true },
  { path: '/', view: DashboardView, nav: 'home', needsMotor: true },
  { path: '/records', view: RecordsListView, nav: 'records', needsMotor: true },
  { path: '/records/new', view: RecordFormView, nav: 'new', needsMotor: true },
  { path: '/records/:id', view: RecordDetailView, nav: 'records' },
  { path: '/records/:id/edit', view: RecordFormView, nav: 'records' },
  { path: '/motors', view: MotorsView, nav: 'motors' },
  { path: '/reminders', view: RemindersView, nav: 'reminders', needsMotor: true },
  { path: '/reports', view: ReportsView, nav: 'reports', needsMotor: true },
  { path: '/settings', view: SettingsView, nav: 'settings' },
  { path: '/more', view: MoreView, nav: 'more' },
];

const appEl = document.getElementById('app');
const headerEl = document.getElementById('app-header');
const navEl = document.getElementById('app-nav');
const motorSelect = document.getElementById('motor-select');
const motorOdo = document.getElementById('motor-odo');

let renderSeq = 0;
let lastLocation = null;

function setChrome(visible, navKey) {
  headerEl.hidden = !visible;
  navEl.hidden = !visible;
  appEl.classList.toggle('with-nav', visible);
  appEl.classList.toggle('no-chrome', !visible);
  navEl.querySelectorAll('a[data-nav]').forEach((a) => {
    const isMore = a.dataset.nav === 'more' && ['motors', 'reports', 'settings'].includes(navKey);
    if (a.dataset.nav === navKey || isMore) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

export function updateHeader() {
  const motors = getMotors();
  const active = getActiveMotor();
  motorSelect.replaceChildren(
    ...(motors.length
      ? motors.map((m) => h('option', { value: m.id, selected: active && m.id === active.id }, m.name))
      : [h('option', { value: '' }, 'Belum ada motor')]),
  );
  motorSelect.disabled = motors.length <= 1;
  motorOdo.textContent = active ? formatKm(active.odometerCurrent) : '';
}

motorSelect.addEventListener('change', () => {
  setActiveMotorId(motorSelect.value);
  updateHeader();
  rerender();
});

export function rerender() {
  if (lastLocation) handleRoute(lastLocation);
}

async function handleRoute(loc) {
  lastLocation = loc;
  const seq = ++renderSeq;
  const isCurrent = () => seq === renderSeq;
  const mount = (...nodes) => {
    if (!isCurrent()) return false;
    mountEl(appEl, ...nodes);
    return true;
  };

  const matched = matchRoute(routes, loc.path);
  const route = matched ? matched.route : { view: NotFoundView };
  const params = matched ? matched.params : {};

  if (!route.public && !getToken()) {
    navigate('/login', { replace: true });
    return;
  }

  setChrome(!route.public, route.nav);
  mount(loadingView());

  try {
    let motor = null;
    if (!route.public) {
      await Promise.all([loadMotors(), loadSettings()]);
      if (!isCurrent()) return;
      updateHeader();
      motor = getActiveMotor();
      if (route.needsMotor && !motor) {
        mount(emptyState({
          icon: '🏍',
          title: 'Belum ada motor',
          text: 'Tambahkan motor pertama Anda untuk mulai mencatat servis dan belanja part.',
          action: h('a', { class: 'btn btn-primary', href: '#/motors?add=1' }, 'Tambah motor'),
        }));
        return;
      }
    }
    await route.view.render({ params, query: loc.query, motor, mount, isCurrent, refresh: rerender, updateHeader });
    if (isCurrent()) {
      const heading = appEl.querySelector('h1');
      if (heading && document.activeElement === document.body) heading.focus({ preventScroll: true });
    }
  } catch (err) {
    if (!isCurrent()) return;
    if (err && err.code === 'UNAUTHORIZED') return; // api.js sudah mengarahkan ke login
    console.error(err);
    mount(errorState(err, () => handleRoute(loc)));
  }
}

startRouter((loc) => {
  window.scrollTo(0, 0);
  handleRoute(loc);
});
