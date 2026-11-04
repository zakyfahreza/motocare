import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatNumber, formatRupiah, formatDate, formatTimestamp, describeReminder, TYPE_LABELS, todayISO } from '../utils/format.js';
import { statusBadge, typeBadge, toast, toastError, sectionHead, numberInput, readNumber, busy } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { categoryIcon, STATUS_TONES, TYPE_ICONS, TYPE_TONES, TRANSMISSION_LABELS } from '../ui/meta.js';
import { invalidateMotors } from '../state.js';

const MAX_REMINDERS = 6;

export async function render({ motor, mount, refresh }) {
  const data = await call('dashboard.get', { motorId: motor.id });
  const m = data.motor;

  // ---------- Hero motor + odometer ----------
  const odoInput = numberInput({ value: m.odometerCurrent, placeholder: 'Masukkan km' });
  odoInput.setAttribute('aria-label', 'Odometer baru (km)');
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Simpan');
  const odoError = h('div', { class: 'field-error', role: 'alert', hidden: true });
  const odoPanel = h('div', { hidden: true },
    h('form', { class: 'odo-inline', novalidate: true }, odoInput, saveBtn),
    odoError,
  );
  const updateBtn = h('button', { type: 'button', class: 'btn btn-tonal btn-sm', 'aria-expanded': 'false' }, icon('edit_note', 18), 'Update km');
  updateBtn.addEventListener('click', () => {
    odoPanel.hidden = !odoPanel.hidden;
    updateBtn.setAttribute('aria-expanded', String(!odoPanel.hidden));
    if (!odoPanel.hidden) odoInput.focus();
  });
  const saveOdo = async () => {
    const value = readNumber(odoInput);
    odoError.hidden = true;
    if (value === null || Number.isNaN(value)) { odoError.textContent = 'Masukkan angka km.'; odoError.hidden = false; return; }
    if (value < m.odometerCurrent) {
      odoError.textContent = `Minimal ${formatNumber(m.odometerCurrent)} km. Untuk koreksi gunakan Edit motor di Garasi.`;
      odoError.hidden = false;
      return;
    }
    const restore = busy(saveBtn, '…');
    try {
      await call('motors.updateOdometer', { id: m.id, odometer: value });
      invalidateMotors();
      toast('Odometer diperbarui', 'success');
      refresh();
    } catch (err) {
      restore();
      toastError(err);
    }
  };
  saveBtn.addEventListener('click', saveOdo);
  odoPanel.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); saveOdo(); });

  const late = data.reminders.filter((r) => r.status === 'TERLAMBAT').length;
  const soon = data.reminders.filter((r) => r.status === 'SEGERA').length;
  const condition = late ? { text: 'Perlu servis', cls: 'c-late' } : soon ? { text: 'Servis segera', cls: 'c-soon' } : { text: 'Kondisi aktif', cls: 'c-ok' };
  const subtitle = [[m.brand, m.model].filter(Boolean).join(' '), m.year && `(${m.year})`, m.transmission && TRANSMISSION_LABELS[m.transmission]].filter(Boolean).join(' ');

  const hero = h('section', { class: 'card hero', 'aria-labelledby': 'hero-name' },
    h('div', { class: 'row-between' },
      h('div', { class: 'stack' },
        h('span', { class: ['row gap-4 t-caps', condition.cls] }, h('span', { class: 'badge-dot', 'aria-hidden': 'true' }), condition.text),
        h('h2', { class: 't-h2 mt-4', id: 'hero-name' }, m.name),
        subtitle && h('span', { class: 't-sm c-2' }, subtitle),
      ),
      h('a', { class: 'tile-icon lg', href: '#/motors', 'aria-label': 'Buka garasi' }, icon('two_wheeler', 26)),
    ),
    h('div', { class: 'hero-odo' },
      h('div', { class: 'stack' },
        h('span', { class: 't-caps c-2' }, 'Odometer terkini'),
        h('div', { class: 'row gap-4', style: { alignItems: 'baseline' } },
          h('span', { class: 't-hero c-primary' }, formatNumber(m.odometerCurrent)),
          h('span', { class: 't-title c-primary', style: { fontWeight: '700' } }, 'km'),
        ),
        m.odometerUpdatedAt && h('span', { class: 'row gap-4 t-sm c-2 mt-4' }, icon('schedule', 14), `Diperbarui ${formatTimestamp(m.odometerUpdatedAt)}`),
      ),
      updateBtn,
    ),
    odoPanel,
  );

  // ---------- Aksi cepat ----------
  const quickItem = (href, iconName, tone, title, sub) =>
    h('a', { class: 'card', href }, h('span', { class: ['tile-icon', tone] }, icon(iconName, 24)), h('span', { class: 't-label' }, title), h('span', { class: 't-sm c-2' }, sub));
  const quick = h('nav', { class: 'quick', 'aria-label': 'Aksi cepat' },
    quickItem('#/records/new?type=GANTI_OLI', 'oil_barrel', '', 'Ganti Oli', 'Catat baru'),
    quickItem('#/records/new?type=SERVIS', 'build', 'tone-violet', 'Servis', 'Bengkel'),
    quickItem('#/records/new?type=BELANJA_PART', 'shopping_cart', 'tone-sky', 'Belanja Part', 'Komponen'),
  );

  // ---------- Pengingat ----------
  const reminders = data.reminders.slice(0, MAX_REMINDERS);
  const remList = h('div', { class: 'card' },
    reminders.length
      ? h('div', { class: 'list-divider' }, reminders.map((r) => {
        const isLate = r.status === 'TERLAMBAT';
        return h('div', { class: 'list-row' },
          h('span', { class: ['tile-icon', STATUS_TONES[r.status]] }, icon(isLate ? 'warning' : categoryIcon(r.category), 22)),
          h('div', { class: 'stack grow' },
            h('span', { class: 'list-title truncate' }, r.label),
            h('span', { class: ['list-sub truncate', isLate && 'c-late'] }, r.status === 'BELUM_ADA_DATA' ? 'Belum pernah dicatat' : describeReminder(r)),
          ),
          statusBadge(r.status),
        );
      }))
      : h('p', { class: 'card-pad c-2' }, 'Belum ada jadwal pengingat.'),
    h('a', { class: 'list-foot', href: '#/reminders' }, h('span', null, data.reminders.length > MAX_REMINDERS ? `Lihat semua (${data.reminders.length})` : 'Kelola pengingat'), icon('arrow_forward', 16)),
  );

  // ---------- Pengeluaran ----------
  const year = todayISO().slice(0, 4);
  const spend = h('div', { class: 'card card-pad', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
    h('div', { class: 'stack' },
      h('span', { class: 'row gap-4 t-caps c-2' }, icon('calendar_today', 16), 'Bulan ini'),
      h('span', { class: 't-stat mt-4' }, formatRupiah(data.spend.thisMonth)),
      data.spend.countMonth
        ? h('span', { class: 't-sm c-2' }, `${data.spend.countMonth} transaksi`)
        : h('span', { class: 'row gap-4 t-sm c-ok' }, icon('check_circle', 14), 'Belum ada pengeluaran'),
    ),
    h('div', { class: 'stack', style: { paddingLeft: '16px', borderLeft: '1px solid var(--divider)' } },
      h('span', { class: 'row gap-4 t-caps c-2' }, icon('date_range', 16), `Tahun ${year}`),
      h('span', { class: 't-stat c-primary mt-4' }, formatRupiah(data.spend.thisYear)),
      h('span', { class: 't-sm c-2' }, `Total ${data.spend.countYear} transaksi`),
    ),
  );

  // ---------- Catatan terakhir ----------
  const last = data.lastRecord;
  const lastCard = last
    ? h('a', { class: 'card record-card', href: `#/records/${encodeURIComponent(last.id)}`, 'aria-label': `${TYPE_LABELS[last.type]} ${formatDate(last.date)}` },
      h('div', { class: 'row-between', style: { alignItems: 'flex-start' } },
        h('div', { class: 'row gap-12' },
          h('span', { class: ['tile-icon', TYPE_TONES[last.type]] }, icon(TYPE_ICONS[last.type] || 'receipt_long', 20)),
          h('div', { class: 'stack' },
            h('div', { class: 'row gap-8', style: { flexWrap: 'wrap' } }, typeBadge(last.type), h('span', { class: 't-sm c-2' }, formatDate(last.date))),
            h('span', { class: 't-title mt-4' }, (last.itemNames && last.itemNames.length ? last.itemNames.join(', ') : last.place) || TYPE_LABELS[last.type]),
          ),
        ),
        h('span', { class: 't-title c-primary num', style: { fontWeight: '800' } }, formatRupiah(last.grandTotal)),
      ),
      h('div', { class: 'card-tint row-between mt-12', style: { padding: '6px 10px' } },
        h('span', { class: 'row gap-4 t-sm c-2' }, icon('pin_drop', 14), [`${formatNumber(last.odometer)} km`, last.place].filter(Boolean).join(' · ')),
        icon('chevron_right', 16),
      ),
    )
    : h('div', { class: 'card card-pad c-2' }, 'Belum ada catatan. Mulai dengan tombol di atas.');

  mount(
    h('h1', { class: 'visually-hidden', tabindex: '-1' }, `Beranda ${m.name}`),
    hero,
    quick,
    h('section', null, sectionHead('Pengingat Perawatan', { href: '#/reminders', linkText: 'Kelola', extra: late ? h('span', { class: 'count-dot', 'aria-label': `${late} terlambat` }, String(late)) : null }), remList),
    h('section', null, sectionHead('Pengeluaran', { href: '#/reports', linkText: 'Laporan' }), spend),
    h('section', null, sectionHead('Catatan Terakhir', { href: '#/records', linkText: 'Riwayat' }), lastCard),
  );
}
