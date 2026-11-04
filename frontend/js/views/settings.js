import { h } from '../utils/dom.js';
import { APP_VERSION } from '../version.js';
import { pageHead, confirmDialog, toast, toastError } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { loadSettings, getApiUrl, signOut, resetCache, getActiveMotor } from '../state.js';
import { getTheme, setTheme } from '../theme.js';
import { navigate } from '../router.js';
import { exportBackup, lastBackupText } from './more.js';
import { clearPhotoCache } from '../photos.js';

export async function render({ mount, refresh }) {
  const { categories, version, photoFolderUrl } = await loadSettings();
  const motor = getActiveMotor();

  const apiUrl = getApiUrl();
  const maskedUrl = apiUrl ? apiUrl.replace(/(\/s\/)(.{6}).+(.{4}\/exec)$/, '$1$2…$3') : '—';

  const row = ({ iconName, title, sub, value, href, onClick, right, danger }) => {
    const content = [
      h('span', { class: ['tile-icon sm', danger && 'tone-late'] }, icon(iconName, 20)),
      h('span', { class: 'stack grow' }, h('span', { class: ['t-title', danger && 'c-late'] }, title), sub && h('span', { class: 't-sm c-2' }, sub)),
      value && h('span', { class: 'value' }, value),
      right !== undefined ? right : (href || onClick) && h('span', { class: 'c-3' }, icon('chevron_right', 20)),
    ];
    if (href) return h('a', { class: 'setting-row', href }, content);
    if (onClick) return h('button', { type: 'button', class: 'setting-row', onclick: onClick }, content);
    return h('div', { class: 'setting-row', style: { cursor: 'default' } }, content);
  };
  const group = (label, ...rows) => h('section', { class: 'stack gap-8' },
    h('h2', { class: 'section-label' }, label),
    h('div', { class: 'card settings-group' }, rows),
  );

  // Tema
  const theme = getTheme();
  const themeBtn = (value, iconName, label) => h('button', {
    type: 'button', 'aria-pressed': String(theme === value),
    onclick: () => { setTheme(value); refresh(); },
  }, icon(iconName, 16), label);
  const themeSwitch = h('div', { class: 'theme-switch', role: 'group', 'aria-label': 'Tema aplikasi' }, themeBtn('light', 'light_mode', 'Terang'), themeBtn('dark', 'dark_mode', 'Gelap'));

  const backupSub = lastBackupText();
  const activeCats = categories.filter((c) => c.active).length;

  mount(
    pageHead('Pengaturan', {
      subtitle: 'Preferensi aplikasi, data, dan akses',
      actions: [h('a', { class: 'tile-icon', href: '#/settings/categories', 'aria-label': 'Kelola kategori' }, icon('tune', 22))],
    }),
    h('section', { class: 'card card-pad' },
      h('div', { class: 'row gap-12' },
        h('span', { class: 'avatar', style: { width: '56px', height: '56px', position: 'relative' } }, icon('key', 26),
          h('span', { style: { position: 'absolute', right: '-2px', bottom: '-2px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--ok)', border: '2px solid var(--card)', display: 'grid', placeItems: 'center', color: '#fff' } }, icon('check', 12))),
        h('div', { class: 'stack grow' },
          h('span', { class: 'row gap-8' }, h('span', { class: 't-h3' }, 'Perangkat ini'), h('span', { class: 'badge badge-primary' }, icon('verified', 14), 'Terhubung')),
          h('span', { class: 't-sm c-2 truncate' }, motor ? `Motor aktif: ${motor.name}` : 'Belum ada motor'),
          h('span', { class: 'badge badge-ok mt-4', style: { alignSelf: 'flex-start' } }, 'Kode akses valid'),
        ),
      ),
      h('div', { class: 'card-tint row-between mt-12', style: { padding: '10px 12px' } },
        h('span', { class: 'row gap-8 t-sm c-2 truncate' }, icon('database', 16), 'Google Sheets via Apps Script'),
        h('span', { class: 't-sm', style: { fontWeight: '700' } }, `Backend v${version || '—'}`),
      ),
    ),
    group('Kendaraan & data',
      row({ iconName: 'notifications_active', title: 'Jadwal pengingat', sub: 'Interval km & hari per kategori', href: '#/reminders' }),
      row({ iconName: 'category', title: 'Kelola kategori item', sub: `${activeCats} kategori aktif · Oli, part, aksesoris`, href: '#/settings/categories' }),
      row({ iconName: 'two_wheeler', title: 'Garasi motor', sub: 'Tambah, ubah, pilih motor aktif', href: '#/motors' }),
    ),
    group('Tampilan',
      row({ iconName: 'palette', title: 'Tema aplikasi', sub: theme === 'dark' ? 'Gelap, nyaman di malam hari' : 'Biru cerah, mudah dibaca siang hari', right: themeSwitch }),
      row({ iconName: 'straighten', title: 'Satuan & mata uang', sub: 'Kilometer (km) · Rupiah (IDR)', right: null }),
    ),
    group('Data & keamanan',
      row({
        iconName: 'backup', title: 'Cadangkan data', sub: backupSub,
        onClick: async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          try { await exportBackup(); toast('File cadangan diunduh', 'success'); refresh(); } catch (err) { toastError(err); } finally { btn.disabled = false; }
        },
      }),
      row({ iconName: 'description', title: 'Ekspor riwayat (CSV)', sub: 'Buka di Excel atau Google Sheets', href: '#/records' }),
      photoFolderUrl
        ? h('a', { class: 'setting-row', href: photoFolderUrl, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'tile-icon sm' }, icon('folder_open', 20)),
          h('span', { class: 'stack grow' }, h('span', { class: 't-title' }, 'Folder foto Google Drive'), h('span', { class: 't-sm c-2' }, 'Foto motor, nota, dan struk tersimpan di "MotoCare Foto"')),
          h('span', { class: 'c-3' }, icon('open_in_new', 20)))
        : row({ iconName: 'folder_open', title: 'Folder foto Google Drive', sub: 'Dibuat otomatis saat foto pertama disimpan', right: null }),
      row({ iconName: 'cleaning_services', title: 'Muat ulang data', sub: 'Hapus cache di perangkat ini lalu ambil data terbaru', onClick: () => { resetCache(); toast('Cache dibersihkan', 'success'); refresh(); } }),
    ),
    group('Info aplikasi & bantuan',
      row({ iconName: 'help_center', title: 'Pusat bantuan & FAQ', href: '#/help' }),
      row({ iconName: 'info', title: 'Versi aplikasi', value: `MotoCare v${APP_VERSION}`, right: null }),
      row({ iconName: 'link', title: 'API URL', value: maskedUrl, right: null }),
    ),
    h('button', {
      type: 'button', class: 'btn btn-danger btn-block btn-lg',
      onclick: async () => {
        if (!(await confirmDialog('Keluar dari perangkat ini? Kode akses akan dihapus dari perangkat.', { title: 'Keluar', okText: 'Keluar', danger: true }))) return;
        signOut();
        await clearPhotoCache();
        navigate('/login', { replace: true });
      },
    }, icon('logout', 20), 'Keluar dari perangkat'),
    h('p', { class: 'footer-note' }, 'Dirawat dengan cinta untuk komuter & pencinta roda dua Indonesia'),
  );
}
