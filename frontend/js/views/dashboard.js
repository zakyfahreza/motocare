import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatKm, formatRupiah, formatDate, formatTimestamp, describeReminder, TYPE_LABELS } from '../utils/format.js';
import { pageHead, statusBadge, typeBadge, toast } from '../ui/components.js';
import { openOdometerDialog } from './motors.js';

const MAX_REMINDERS = 6;

export async function render({ motor, mount, refresh }) {
  const data = await call('dashboard.get', { motorId: motor.id });
  const m = data.motor;

  const odoCard = h('section', { class: 'card', 'aria-labelledby': 'odo-h' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'odo-h', class: 'muted small mb-0' }, 'Odometer terkini'),
      h('button', {
        type: 'button', class: 'btn btn-sm',
        onclick: async () => {
          const updated = await openOdometerDialog(m);
          if (updated) { toast('Odometer diperbarui', 'success'); refresh(); }
        },
      }, 'Update km'),
    ),
    h('div', { class: 'stat-big' }, formatKm(m.odometerCurrent)),
    h('div', { class: 'muted small' }, m.odometerUpdatedAt ? `Diperbarui ${formatTimestamp(m.odometerUpdatedAt)}` : ''),
  );

  const quick = h('div', { class: 'quick-actions' },
    h('a', { class: 'btn', href: '#/records/new?type=GANTI_OLI' }, h('span', { 'aria-hidden': 'true' }, '🛢'), 'Ganti Oli'),
    h('a', { class: 'btn', href: '#/records/new?type=SERVIS' }, h('span', { 'aria-hidden': 'true' }, '🔧'), 'Servis'),
    h('a', { class: 'btn', href: '#/records/new?type=BELANJA_PART' }, h('span', { 'aria-hidden': 'true' }, '🛒'), 'Belanja Part'),
  );

  const reminders = data.reminders.slice(0, MAX_REMINDERS);
  const remCard = h('section', { class: 'card', 'aria-labelledby': 'rem-h' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'rem-h' }, 'Pengingat perawatan'),
      h('a', { href: '#/reminders', class: 'small' }, 'Kelola'),
    ),
    reminders.length
      ? h('div', null, reminders.map((r) =>
        h('div', { class: 'reminder' },
          h('div', { class: 'list-main' },
            h('div', { class: 'list-title' }, r.label),
            h('div', { class: 'list-sub' }, describeReminder(r)),
          ),
          statusBadge(r.status),
        )))
      : h('p', { class: 'muted' }, 'Belum ada jadwal pengingat.'),
    data.reminders.length > MAX_REMINDERS && h('a', { href: '#/reminders', class: 'small' }, `Lihat semua (${data.reminders.length})`),
  );

  const spendCard = h('section', { class: 'card', 'aria-labelledby': 'spend-h' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'spend-h' }, 'Pengeluaran'),
      h('a', { href: '#/reports', class: 'small' }, 'Laporan'),
    ),
    h('div', { class: 'stat-row' },
      h('div', null, h('div', { class: 'stat-label' }, 'Bulan ini'), h('div', { class: 'stat-value' }, formatRupiah(data.spend.thisMonth))),
      h('div', null, h('div', { class: 'stat-label' }, 'Tahun ini'), h('div', { class: 'stat-value' }, formatRupiah(data.spend.thisYear))),
    ),
  );

  const last = data.lastRecord;
  const lastCard = h('section', { class: 'card', 'aria-labelledby': 'last-h' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'last-h' }, 'Catatan terakhir'),
      h('a', { href: '#/records', class: 'small' }, 'Riwayat'),
    ),
    last
      ? h('a', { class: 'list-item', href: `#/records/${encodeURIComponent(last.id)}`, 'aria-label': `${TYPE_LABELS[last.type]} ${formatDate(last.date)}` },
        h('div', { class: 'list-main' },
          h('div', { class: 'list-title' }, typeBadge(last.type), ' ', formatDate(last.date)),
          h('div', { class: 'list-sub' }, [formatKm(last.odometer), last.place].filter(Boolean).join(' · ')),
          last.itemNames && last.itemNames.length ? h('div', { class: 'list-sub' }, last.itemNames.join(', ')) : null,
        ),
        h('div', { class: 'list-side' }, h('strong', null, formatRupiah(last.grandTotal))),
      )
      : h('p', { class: 'muted' }, 'Belum ada catatan. Mulai dengan tombol di atas.'),
  );

  mount(
    pageHead(m.name),
    odoCard,
    quick,
    h('div', { class: 'grid grid-2' }, remCard, h('div', null, spendCard, lastCard)),
  );
}
