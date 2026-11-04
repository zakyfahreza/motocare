import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatNumber, formatTimestamp, todayISO } from '../utils/format.js';
import { pageHead, toast, toastError, downloadFile } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { initials } from '../ui/meta.js';
import { getActiveMotor, loadSettings } from '../state.js';
import { APP_VERSION } from '../version.js';

const BACKUP_KEY = 'motocare_last_backup';

export async function exportBackup() {
  const data = await call('backup.export');
  downloadFile(`motocare-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch { /* abaikan */ }
  return data;
}

export function lastBackupText() {
  let iso = '';
  try { iso = localStorage.getItem(BACKUP_KEY) || ''; } catch { /* abaikan */ }
  if (!iso) return 'Belum pernah dicadangkan dari perangkat ini';
  return `Terakhir dicadangkan ${formatTimestamp(iso)}`;
}

export async function render({ mount }) {
  const motor = getActiveMotor();
  await loadSettings();

  const menuRow = (href, iconName, title, sub) => h('a', { class: 'list-row', href },
    h('span', { class: 'tile-icon lg round' }, icon(iconName, 24)),
    h('span', { class: 'stack grow' }, h('span', { class: 'list-title' }, title), h('span', { class: 'list-sub' }, sub)),
    h('span', { class: 'chev' }, icon('chevron_right', 22)),
  );

  const backupSub = h('span', { class: 'list-sub' }, lastBackupText());
  const backupBtn = h('button', { type: 'button', class: 'list-row' },
    h('span', { class: 'tile-icon lg round' }, icon('backup', 24)),
    h('span', { class: 'stack grow' }, h('span', { class: 'list-title' }, 'Cadangkan Data'), backupSub),
    h('span', { class: 'chev' }, icon('download', 22)),
  );
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    backupSub.textContent = 'Menyiapkan file cadangan…';
    try {
      const data = await exportBackup();
      toast(`Cadangan berisi ${data.records.length} catatan diunduh`, 'success');
    } catch (err) {
      toastError(err);
    } finally {
      backupBtn.disabled = false;
      backupSub.textContent = lastBackupText();
    }
  });

  mount(
    pageHead('Lainnya', {
      subtitle: 'Preferensi & manajemen garasi',
      actions: [h('span', { class: 'avatar avatar-lg', 'aria-hidden': 'true' }, initials(motor ? motor.name : 'MotoCare'))],
    }),
    motor && h('a', { class: 'card card-pad hero', href: '#/motors', 'aria-label': `Motor aktif ${motor.name}. Buka garasi untuk mengganti.` },
      h('div', { class: 'row gap-12' },
        h('span', { class: 'tile-icon lg', style: { position: 'relative' } }, icon('two_wheeler', 28),
          h('span', { style: { position: 'absolute', right: '-3px', bottom: '-3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--ok)', border: '2px solid var(--card)' } })),
        h('div', { class: 'stack grow' },
          h('span', { class: 'row gap-8' }, h('span', { class: 't-title truncate' }, [motor.brand, motor.model].filter(Boolean).join(' ') || motor.name), h('span', { class: 'badge badge-primary' }, 'Utama')),
          h('span', { class: 'list-sub' }, [motor.plate, `${formatNumber(motor.odometerCurrent)} km`].filter(Boolean).join(' · ')),
        ),
        h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, icon('swap_horiz', 22)),
      ),
    ),
    h('div', { class: 'card list-divider' },
      menuRow('#/motors', 'two_wheeler', 'Motor', 'Tambah, ubah, pilih motor aktif'),
      menuRow('#/reports', 'bar_chart', 'Laporan', 'Biaya per bulan dan per kategori'),
      menuRow('#/settings', 'tune', 'Pengaturan', 'Kategori, tema, versi, keluar'),
    ),
    h('div', { class: 'card list-divider' },
      backupBtn,
      menuRow('#/help', 'help', 'Pusat Bantuan & Saran', 'Panduan pemakaian dan tips perawatan'),
    ),
    h('div', { class: 'tip' }, icon('lightbulb', 26), h('span', null, 'Tips: Catat servis berkala tepat waktu untuk menjaga harga jual kembali motor tetap tinggi!')),
    h('p', { class: 'footer-note' }, `MotoCare v${APP_VERSION} · Pemeliharaan Motor Pintar`, h('strong', null, 'Dirancang untuk mobilitas tanpa kendala')),
  );
}
